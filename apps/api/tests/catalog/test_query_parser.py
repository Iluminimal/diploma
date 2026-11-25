import pytest

from angel.repositories.catalog.products import SearchFilters
from angel.schemas.catalog.catalog import CatalogFilters, PriceRange
from angel.services.catalog.query_parser import (
    ParsedQuery,
    Vocabulary,
    apply_parsed,
    parse_search_text,
)

VOCABULARY = Vocabulary.from_catalog(
    CatalogFilters(
        categories=[],
        genders=["Boys", "Girls", "Men", "Unisex", "Women"],
        colors=["Black", "Blue", "Navy Blue", "Red", "White", "Yellow"],
        seasons=["Fall", "Spring", "Summer", "Winter"],
        usages=["Casual", "Formal", "Sports"],
        price_range=PriceRange(min_cents=1_000_000, max_cents=40_000_000),
    )
)


def parse(text: str, vocabulary: Vocabulary = VOCABULARY) -> ParsedQuery:
    return parse_search_text(text, vocabulary=vocabulary)


# --- үг: өнгө, хүйс, улирал, хэрэглээ ---------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "colors"),
    [
        ("blue shirt", ("Blue",)),
        ("цэнхэр цамц", ("Blue",)),
        ("цэнхэрээр", ("Blue",)),  # тохиолдлын нөхцөл
        ("Улаан", ("Red",)),  # том үсэг
        ("navy blue jacket", ("Navy Blue",)),  # хамгийн урт хэллэг: "blue" биш
        ("хар хөх", ("Navy Blue",)),  # "хар", "хөх" тус тусдаа биш
        ("хар", ("Black",)),
    ],
)
def test_colours_are_recognised_in_both_languages(text: str, colors: tuple[str, ...]) -> None:
    assert parse(text).colors == colors


def test_a_word_that_merely_starts_like_a_colour_is_not_one() -> None:
    parsed = parse("харагдах загвар")

    assert parsed.colors == ()
    assert parsed.remaining == "харагдах загвар"


def test_values_missing_from_the_catalogue_are_never_filters() -> None:
    parsed = parse("ногоон цамц, бежи өмд")  # ногоон, бежи нь жагсаалтад алга

    assert parsed.colors == ()
    assert parsed.remaining == "ногоон цамц бежи өмд"


def test_men_includes_unisex_like_the_menu_does() -> None:
    assert parse("эрэгтэй").genders == ("Men", "Unisex")
    assert parse("women's").genders == ("Women", "Unisex")


def test_seasons_and_usages() -> None:
    parsed = parse("зуны өдөр тутмын даашинз")

    assert parsed.seasons == ("Summer",)
    assert parsed.usages == ("Casual",)
    assert parsed.remaining == "даашинз"


def test_the_words_that_became_filters_leave_the_text_and_reappear_as_english_labels() -> None:
    parsed = parse("цэнхэр зуны цамц")

    assert parsed.remaining == "цамц"
    assert parsed.embedding_text == "цамц Blue Summer"


def test_nothing_to_find_leaves_the_text_alone() -> None:
    parsed = parse("long sleeve t-shirt")

    assert parsed.applied == ()
    assert parsed.remaining == "long sleeve t-shirt"


def test_in_stock() -> None:
    assert parse("red dress in stock").in_stock is True
    assert parse("нөөцтэй улаан").in_stock is True


# --- үнэ ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "low", "high"),
    [
        ("under $50", None, 17_500_000),
        ("below 50 usd", None, 17_500_000),
        ("50$-аас доош", None, 17_500_000),
        ("50 доллараас доош", None, 17_500_000),
        ("over $20", 7_000_000, None),
        ("20$-аас дээш", 7_000_000, None),
        ("$20-$50", 7_000_000, 17_500_000),
        ("20-50$", 7_000_000, 17_500_000),
        ("between 20 and 50 usd", 7_000_000, 17_500_000),
        ("20$-аас 50$ хүртэл", 7_000_000, 17_500_000),
    ],
)
def test_dollar_prices(text: str, low: int | None, high: int | None) -> None:
    parsed = parse(text)

    assert (parsed.min_price_cents, parsed.max_price_cents) == (low, high)
    assert parsed.remaining == ""


@pytest.mark.parametrize(
    ("text", "high"),
    [
        ("35000₮-аас доош", 3_500_000),  # 35,000 ₮
        ("35000 төгрөгөөс доош", 3_500_000),
        ("35 мянгаас доош", 3_500_000),
        ("35 мянган төгрөг хүртэл", 3_500_000),
        ("under 35000 mnt", 3_500_000),
    ],
)
def test_togrog_prices_are_kept_as_they_are(text: str, high: int) -> None:
    assert parse(text).max_price_cents == high


def test_a_million_togrog() -> None:
    assert parse("3.5 сая төгрөгөөс доош").max_price_cents == 350_000_000


def test_a_thousands_separator_is_not_a_decimal_point() -> None:
    assert parse("under 35,000 mnt").max_price_cents == 3_500_000


def test_a_togrog_range_shares_the_unit() -> None:
    parsed = parse("35-70 мянга")

    assert (parsed.min_price_cents, parsed.max_price_cents) == (3_500_000, 7_000_000)


@pytest.mark.parametrize(
    ("text", "remaining"),
    [
        ("size 38", "size 38"),
        ("2-3 хос", "2-3 хос"),
        ("цамц 50", "цамц 50"),
        ("цамц 50$", "цамц 50"),  # нэгжтэй ч чиглэлгүй
        ("t-shirt 100 хүртэл", "t-shirt 100 хүртэл"),  # чиглэлтэй ч нэгжгүй
    ],
)
def test_numbers_without_a_unit_or_a_direction_are_left_alone(text: str, remaining: str) -> None:
    parsed = parse(text)

    assert parsed.min_price_cents is None
    assert parsed.max_price_cents is None
    assert parsed.remaining == remaining


def test_a_contradictory_range_is_ignored() -> None:
    parsed = parse("under $10 over $50")

    assert (parsed.min_price_cents, parsed.max_price_cents) == (None, None)


def test_everything_together() -> None:
    parsed = parse("цэнхэр зуны цамц 50$-аас доош")

    assert parsed.colors == ("Blue",)
    assert parsed.seasons == ("Summer",)
    assert parsed.max_price_cents == 17_500_000
    assert parsed.remaining == "цамц"
    assert parsed.applied == (
        ("color", "Blue"),
        ("season", "Summer"),
        ("max_price", "17500000"),
    )


# --- хэрэглэгчийн шүүлтүүртэй нэгтгэх ----------------------------------------------------------


def test_parsed_filters_fill_only_the_empty_keys() -> None:
    parsed = parse("цэнхэр зуны 50$-аас доош")
    explicit = SearchFilters(seasons=("Winter",), max_price_cents=9000)

    filters, applied = apply_parsed(parsed, explicit)

    assert filters.seasons == ("Winter",)  # хэрэглэгчийнх нь дарагдахгүй
    assert filters.max_price_cents == 9000
    assert filters.base_colours == ("Blue",)
    assert applied == (("color", "Blue"),)


def test_a_parsed_price_that_contradicts_the_users_range_is_dropped() -> None:
    parsed = parse("over $80")

    filters, applied = apply_parsed(parsed, SearchFilters(max_price_cents=5000))

    assert filters.min_price_cents is None
    assert applied == ()


def test_in_stock_is_applied_once() -> None:
    parsed = parse("in stock")

    _, applied = apply_parsed(parsed, SearchFilters())
    _, already = apply_parsed(parsed, SearchFilters(in_stock_only=True))

    assert applied == (("in_stock", "true"),)
    assert already == ()
