"""Хайлтын текстээс шүүлтүүр задлах (монгол + англи): "цэнхэр зуны цамц 50$-аас доош".

FashionCLIP зөвхөн англи хэл ойлгодог бөгөөд өнгө, улирал, үнэ зэргийг embedding-ээр найдваргүй
тохируулдаг. Тиймээс таньсан үгсийг хатуу шүүлтүүр болгож, үлдсэнийг embedding-д үлдээнэ.

Модуль pure: DB, сүлжээ ашиглахгүй. Ашиглах ёстой хоёр зүйлийг (catalogue-д байгаа утгууд,
төгрөгийн ханш) дуудагч өгнө.

Дүрмүүд (зориуд хатуу, таамаглахгүй):
- Зөвхөн толь дахь бүтэн үгийг (эсвэл монгол тохиолдлын нөхцөлтэй хэлбэрийг) танина; хэсэгчилсэн
  тулгалт байхгүй, тиймээс "хар" нь "харагдах"-ыг барихгүй.
- Catalogue-д байхгүй утгыг хэзээ ч шүүлтүүр болгохгүй (`Vocabulary`).
- Үнийг зөвхөн валютын тэмдэгт эсвэл нэгжтэй (`$`, `₮`, usd, төгрөг, мянга, сая) тоо, мөн чиглэлийн
  үгтэй ("доош", "under", "дээш"...) үед танина. Чиглэлгүй эсвэл нэгжгүй тоо текстэд үлдэнэ.
- Хэрэглэгчийн өгсөн шүүлтүүрийг дарахгүй: зөвхөн хоосон түлхүүрийг нөхнө."""

import re
from dataclasses import dataclass, replace

from angel.repositories.catalog.products import SearchFilters
from angel.schemas.catalog.catalog import CatalogFilters
from angel.services.catalog.taxonomy import DEPARTMENT_BY_SLUG

MAX_PRICE_CENTS = 1_000_000_000  # FilterParams-ийн дээд хязгаартай адил (10 сая ₮)
# `$`, usd гэж бичсэн хэмжээг төгрөг болгох жишиг ханш: хайлтын тайлбарт л хэрэглэнэ, дэлгүүрийн
# үнэ ба төлбөрт огт нөлөөлөхгүй.
USD_IN_TOGROG = 3_500

# Монгол үгийн дараа залгагддаг тохиолдлын нөхцөл: "цэнхэр" + "ээр" = "цэнхэрээр".
_SUFFIXES = frozenset(
    {
        "ын", "ийн", "ны", "ний", "аар", "ээр", "оор", "өөр", "тай", "тэй", "той",
        "аас", "ээс", "оос", "өөс", "ыг", "ийг", "ууд", "үүд", "уудыг", "үүдийг",
    }
)  # fmt: skip


@dataclass(frozen=True)
class Vocabulary:
    """Catalogue-д жинхэнээр байгаа утгууд (жижиг үсгээр -> анхны бичлэг)."""

    genders: dict[str, str]
    colors: dict[str, str]
    seasons: dict[str, str]
    usages: dict[str, str]

    @classmethod
    def from_catalog(cls, options: CatalogFilters) -> "Vocabulary":
        def index(values: list[str]) -> dict[str, str]:
            return {v.lower(): v for v in values}

        return cls(
            genders=index(options.genders),
            colors=index(options.colors),
            seasons=index(options.seasons),
            usages=index(options.usages),
        )


@dataclass(frozen=True)
class Term:
    key: str  # color | gender | season | usage | in_stock
    values: tuple[str, ...]  # catalogue-ийн утгууд (жижиг үсгээр)
    label: str  # хэрэглэгчид харуулах, embedding-д нэмэх англи нэр
    words: tuple[tuple[str, ...], ...]  # хэллэгүүд (үг үгээр)


def _t(key: str, label: str, *phrases: str, values: tuple[str, ...] | None = None) -> Term:
    return Term(
        key,
        tuple(v.lower() for v in (values or (label,))),
        label,
        tuple(tuple(p.split()) for p in phrases),
    )


_MEN = tuple(DEPARTMENT_BY_SLUG["men"].genders)
_WOMEN = tuple(DEPARTMENT_BY_SLUG["women"].genders)
_KIDS = tuple(DEPARTMENT_BY_SLUG["kids"].genders)

TERMS: tuple[Term, ...] = (
    # --- өнгө (dataset-ийн base colour) ---
    _t("color", "Black", "black", "хар"),
    _t("color", "White", "white", "цагаан"),
    _t("color", "Off White", "off white", "цайвар цагаан"),
    _t("color", "Navy Blue", "navy blue", "navy", "хар хөх", "бараан хөх"),
    _t("color", "Blue", "blue", "цэнхэр", "хөх", "тэнгэр хөх"),
    _t("color", "Grey", "grey", "gray", "саарал"),
    _t("color", "Red", "red", "улаан"),
    _t("color", "Maroon", "maroon", "бараан улаан"),
    _t("color", "Pink", "pink", "ягаан", "ягаавтар"),
    _t("color", "Purple", "purple", "нил ягаан", "нил"),
    _t("color", "Green", "green", "ногоон"),
    _t("color", "Olive", "olive", "олив"),
    _t("color", "Yellow", "yellow", "шар"),
    _t("color", "Orange", "orange", "улбар шар"),
    _t("color", "Brown", "brown", "бор", "хүрэн"),
    _t("color", "Beige", "beige", "бежи", "бэж"),
    _t("color", "Cream", "cream", "цөцгий", "цөцгийн"),
    _t("color", "Gold", "gold", "golden", "алтлаг", "алтан"),
    _t("color", "Silver", "silver", "мөнгөлөг", "мөнгөн"),
    # --- хүйс: Unisex бараа эрэгтэй, эмэгтэй хоёуланд харагддаг (taxonomy.DEPARTMENTS) ---
    _t("gender", "Men", "men", "mens", "men's", "male", "эрэгтэй", values=_MEN),
    _t(
        "gender",
        "Women",
        "women",
        "womens",
        "women's",
        "female",
        "ladies",
        "эмэгтэй",
        values=_WOMEN,
    ),
    _t("gender", "Kids", "kids", "children", "хүүхдийн", "хүүхэд", values=_KIDS),
    _t("gender", "Boys", "boys", "boy", "хөвгүүдийн", "хөвгүүд", "хүүгийн"),
    _t("gender", "Girls", "girls", "girl", "охидын", "охид", "охины"),
    _t("gender", "Unisex", "unisex", "хосын"),
    # --- улирал ---
    _t("season", "Summer", "summer", "зун", "зуны"),
    _t("season", "Winter", "winter", "өвөл", "өвлийн"),
    _t("season", "Spring", "spring", "хавар", "хаврын"),
    _t("season", "Fall", "fall", "autumn", "намар", "намрын"),
    # --- хэрэглээ ---
    _t("usage", "Casual", "casual", "өдөр тутмын", "өдөр тутам"),
    _t("usage", "Formal", "formal", "албан ёсны", "албан", "албаны"),
    _t("usage", "Sports", "sports", "sport", "sporty", "спорт", "спортын"),
    _t("usage", "Party", "party", "үдэшлэг", "үдэшлэгийн"),
    _t("usage", "Travel", "travel", "аялал", "аялалын"),
    _t("usage", "Ethnic", "ethnic", "үндэсний"),
    # --- нөөц ---
    _t("in_stock", "In stock", "in stock", "available", "нөөцтэй", "нөөцөд байгаа"),
)

_NUM = r"\d+(?:[.,]\d+)*"
# "мянга", "сая" нь төгрөг гэсэн үг; "мянгаас" гэх мэт нөхцөлтэй хэлбэрийг зөвшөөрнө.
_SCALE = r"(?:мянг(?:ан?)?|сая)(?:аас|ээс|ас|ын|ийн|аар|д|с)?"
_CURRENCY = (
    r"(?:usd|dollars?|доллар|mnt|tugriks?|төгрөг|төг)(?:аар|аас|ээр|өөр|өөс|ын|ийн|д)?(?!\w)|[$₮]"
)
_MONEY_RE = re.compile(
    rf"(?P<sym>[$₮])?\s*(?P<num>{_NUM})\s*(?P<scale>{_SCALE})?\s*(?P<cur>{_CURRENCY})?"
)
_RANGE_RE = re.compile(
    rf"(?:between\s+)?(?P<syma>[$₮])?\s*(?P<a>{_NUM})\s*(?P<sa>{_SCALE})?\s*(?P<ca>{_CURRENCY})?\s*"
    rf"(?:-аас|-ээс|аас|ээс|-|–|—|to|and)\s*"
    rf"(?P<symb>[$₮])?\s*(?P<b>{_NUM})\s*(?P<sb>{_SCALE})?\s*(?P<cb>{_CURRENCY})?"
    rf"(?:\s*(?:хүртэл|хооронд))?"
)
_CASE_SUFFIX = r"(?:-?(?:аас|ээс|оос|өөс|с))?"
_MAX_AFTER = re.compile(rf"^[\s\-]*{_CASE_SUFFIX}\s*(?P<d>доош|хүртэл|багаас|бага|ихгүй)(?!\w)")
_MIN_AFTER = re.compile(rf"^[\s\-]*{_CASE_SUFFIX}\s*(?P<d>дээш|илүү|их)(?!\w)")
_MAX_BEFORE = re.compile(
    r"(?<!\w)(?P<d>under|below|less than|up to|max(?:imum)?|cheaper than|<=?)\s*$"
)
_MIN_BEFORE = re.compile(r"(?<!\w)(?P<d>over|above|more than|from|at least|min(?:imum)?|>=?)\s*$")
_TOKEN_RE = re.compile(r"[\w'’]+(?:[-.][\w'’]+)*")


@dataclass(frozen=True)
class ParsedQuery:
    remaining: str  # шүүлтүүр болоогүй үгс (embedding-д)
    genders: tuple[str, ...] = ()
    colors: tuple[str, ...] = ()
    seasons: tuple[str, ...] = ()
    usages: tuple[str, ...] = ()
    min_price_cents: int | None = None
    max_price_cents: int | None = None
    in_stock: bool = False
    # (түлхүүр, утга): gender/color/season/usage-д англи нэр, үнэд cent-ийн тоо
    applied: tuple[tuple[str, str], ...] = ()
    # Таньсан өнгө, улирал, хэрэглээ, хүйсийн англи нэрс: CLIP-д "blue" гэх мэт тусална.
    labels: tuple[str, ...] = ()

    @property
    def embedding_text(self) -> str:
        return " ".join(part for part in (self.remaining, *self.labels) if part)


def _number(raw: str) -> float:
    if re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", raw):
        return float(raw.replace(",", ""))
    return float(raw.replace(",", "."))


def _cents(num: str, scale: str | None, currency: str | None, symbol: str | None) -> int:
    """Нэгжтэй хэмжээг үнийн бага нэгж (төгрөг x 100) болгоно. `мянга`/`сая`, `₮`, төгрөг нь
    төгрөг; `$`, usd, доллар нь доллар ("жишиг ханш"-аар төгрөг рүү)."""
    amount = _number(num)
    if scale:
        amount *= 1_000_000 if scale.startswith("сая") else 1_000
    unit = (currency or symbol or "").lower()
    in_usd = unit in {"$", "usd"} or unit.startswith(("dollar", "доллар"))
    cents = round(amount * (USD_IN_TOGROG if in_usd else 1) * 100)
    return min(cents, MAX_PRICE_CENTS)


def _extract_prices(
    text: str,
) -> tuple[str, int | None, int | None, list[tuple[str, str]]]:
    """Үнийн хэллэгийг текстээс хасч (зайгаар солино) (шинэ текст, min, max, applied) буцаана."""
    low: int | None = None
    high: int | None = None
    blank: list[tuple[int, int]] = []

    # "50-100$", "50$-аас 100$ хүртэл", "between 50 and 100 usd"
    for match in _RANGE_RE.finditer(text):
        if not any(match[g] for g in ("sa", "ca", "sb", "cb", "syma", "symb")):
            continue  # нэгжгүй хоёр тоо ("2-3") үнэ биш
        currency = match["cb"] or match["ca"]
        symbol = match["symb"] or match["syma"]
        scale = match["sb"] or match["sa"]  # "50-100 мянга": хоёулаа мянга
        a = _cents(match["a"], match["sa"] or scale, currency, symbol)
        b = _cents(match["b"], match["sb"] or scale, currency, symbol)
        low, high = min(a, b), max(a, b)
        blank.append(match.span())
    text = _blank(text, blank)
    blank = []

    if low is None and high is None:
        for match in _MONEY_RE.finditer(text):
            if not (match["sym"] or match["cur"] or match["scale"]):
                continue  # нэгжгүй тоо
            cents = _cents(match["num"], match["scale"], match["cur"], match["sym"])
            end = match.end()
            after = text[end : end + 24]
            before = text[max(0, match.start() - 24) : match.start()]
            direction: re.Match[str] | None
            span = (match.start(), end)
            if direction := _MAX_AFTER.match(after):
                high = cents
                span = (span[0], end + direction.end())
            elif direction := _MIN_AFTER.match(after):
                low = cents
                span = (span[0], end + direction.end())
            elif direction := _MAX_BEFORE.search(before):
                high = cents
                span = (match.start() - len(before) + direction.start(), end)
            elif direction := _MIN_BEFORE.search(before):
                low = cents
                span = (match.start() - len(before) + direction.start(), end)
            else:
                continue  # чиглэлгүй: таамаглахгүй
            blank.append(span)
        text = _blank(text, blank)

    if low is not None and high is not None and low > high:
        low = high = None  # зөрчилтэй: ашиглахгүй
    applied: list[tuple[str, str]] = []
    if low is not None:
        applied.append(("min_price", str(low)))
    if high is not None:
        applied.append(("max_price", str(high)))
    return text, low, high, applied


def _blank(text: str, spans: list[tuple[int, int]]) -> str:
    chars = list(text)
    for start, end in spans:
        chars[start:end] = " " * (end - start)
    return "".join(chars)


def _word_matches(token: str, word: str) -> bool:
    if token == word:
        return True
    return token.startswith(word) and token[len(word) :] in _SUFFIXES


def _phrase_at(tokens: list[str], index: int, term: Term) -> int:
    """`index`-д эхэлсэн хэллэг тулгарвал түүний урт, үгүй бол 0."""
    best = 0
    for phrase in term.words:
        size = len(phrase)
        fits = size > best and index + size <= len(tokens)
        if fits and all(_word_matches(tokens[index + i], phrase[i]) for i in range(size)):
            best = size
    return best


def parse_search_text(text: str, *, vocabulary: Vocabulary) -> ParsedQuery:
    lowered = text.lower().replace("’", "'")
    lowered, min_price, max_price, applied = _extract_prices(lowered)

    tokens = _TOKEN_RE.findall(lowered)
    used = [False] * len(tokens)
    found: dict[str, list[Term]] = {}
    index = 0
    while index < len(tokens):
        # Хамгийн урт хэллэг түрүүлнэ: "navy blue" нь "blue"-ээс, "хар хөх" нь "хар"-аас өмнө.
        best_size, best_term = 0, None
        for term in TERMS:
            size = _phrase_at(tokens, index, term)
            if size > best_size:
                best_size, best_term = size, term
        if best_term is None:
            index += 1
            continue
        table = {
            "color": vocabulary.colors,
            "gender": vocabulary.genders,
            "season": vocabulary.seasons,
            "usage": vocabulary.usages,
        }.get(best_term.key)
        # Catalogue-д байхгүй утгыг шүүлтүүр болгохгүй: токен текстэд үлдэнэ.
        if table is None or any(v in table for v in best_term.values):
            for i in range(index, index + best_size):
                used[i] = True
            if best_term not in found.setdefault(best_term.key, []):
                found[best_term.key].append(best_term)
        index += best_size

    def values(key: str, table: dict[str, str]) -> tuple[str, ...]:
        out: list[str] = []
        for term in found.get(key, []):
            out.extend(table[v] for v in term.values if v in table and table[v] not in out)
        return tuple(out)

    in_stock = "in_stock" in found
    words: list[tuple[str, str]] = []
    for key in ("gender", "color", "season", "usage"):
        words.extend((key, term.label) for term in found.get(key, []))
    if in_stock:
        words.append(("in_stock", "true"))
    applied = [*words, *applied]  # үг, дараа нь үнэ

    return ParsedQuery(
        remaining=" ".join(t for t, u in zip(tokens, used, strict=True) if not u),
        genders=values("gender", vocabulary.genders),
        colors=values("color", vocabulary.colors),
        seasons=values("season", vocabulary.seasons),
        usages=values("usage", vocabulary.usages),
        min_price_cents=min_price,
        max_price_cents=max_price,
        in_stock=in_stock,
        applied=tuple(applied),
        labels=tuple(
            term.label
            for key in ("color", "season", "usage", "gender")
            for term in found.get(key, [])
        ),
    )


def apply_parsed(
    parsed: ParsedQuery, filters: SearchFilters
) -> tuple[SearchFilters, tuple[tuple[str, str], ...]]:
    """Задалсан шүүлтүүрийг хэрэглэгчийн шүүлтүүрт нэмнэ: хэрэглэгчийн өгсөн түлхүүрийг ДАРАХГҮЙ.
    Буцаах `applied` нь үнэхээр хэрэгжсэн хэсэг л."""
    updated = filters
    applied: list[tuple[str, str]] = []

    def labels(key: str) -> list[tuple[str, str]]:
        return [item for item in parsed.applied if item[0] == key]

    if parsed.genders and not filters.genders:
        updated = replace(updated, genders=parsed.genders)
        applied += labels("gender")
    if parsed.colors and not filters.base_colours:
        updated = replace(updated, base_colours=parsed.colors)
        applied += labels("color")
    if parsed.seasons and not filters.seasons:
        updated = replace(updated, seasons=parsed.seasons)
        applied += labels("season")
    if parsed.usages and not filters.usages:
        updated = replace(updated, usages=parsed.usages)
        applied += labels("usage")

    new_min = parsed.min_price_cents if filters.min_price_cents is None else None
    new_max = parsed.max_price_cents if filters.max_price_cents is None else None
    low = new_min if new_min is not None else filters.min_price_cents
    high = new_max if new_max is not None else filters.max_price_cents
    if low is not None and high is not None and low > high:
        new_min = new_max = None  # хэрэглэгчийн хязгаартай зөрчилдсөн
    if new_min is not None:
        updated = replace(updated, min_price_cents=new_min)
        applied.append(("min_price", str(new_min)))
    if new_max is not None:
        updated = replace(updated, max_price_cents=new_max)
        applied.append(("max_price", str(new_max)))
    if parsed.in_stock and not filters.in_stock_only:
        updated = replace(updated, in_stock_only=True)
        applied.append(("in_stock", "true"))
    return updated, tuple(applied)
