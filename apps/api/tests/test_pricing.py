import statistics

from lookalike.ingestion.pricing import base_price_dollars, generate_price_and_stock


def _generate(source_id: int, article_type: str = "Tshirts") -> tuple[int, int]:
    return generate_price_and_stock(
        source_id, article_type=article_type, sub_category="Topwear", master_category="Apparel"
    )


def test_same_product_always_gets_the_same_values() -> None:
    assert _generate(15970) == _generate(15970)


def test_values_depend_on_the_seed() -> None:
    assert {
        generate_price_and_stock(
            1, article_type="Tshirts", sub_category="Topwear", master_category="Apparel", seed=s
        )
        for s in range(20)
    } != {_generate(1)}


def test_values_do_not_depend_on_generation_order() -> None:
    forward = [_generate(i) for i in range(200)]
    backward = [_generate(i) for i in reversed(range(200))][::-1]
    assert forward == backward


def test_prices_are_realistic_integers_ending_in_99() -> None:
    prices = [_generate(i)[0] for i in range(2000)]
    assert all(isinstance(p, int) and p % 100 == 99 and 499 <= p <= 25_000 for p in prices)
    assert 1500 < statistics.median(prices) < 3500  # Tshirts base is $25


def test_prices_follow_the_category() -> None:
    watches = [_generate(i, "Watches")[0] for i in range(500)]
    socks = [_generate(i, "Socks")[0] for i in range(500)]
    assert statistics.median(watches) > 5 * statistics.median(socks)


def test_stock_is_non_negative_with_some_sold_out_products() -> None:
    stock = [_generate(i)[1] for i in range(5000)]
    assert min(stock) == 0
    assert max(stock) <= 120
    assert 0.05 < stock.count(0) / len(stock) < 0.11


def test_category_fallback_chain() -> None:
    assert base_price_dollars("Tshirts", "Topwear", "Apparel") == 25
    assert base_price_dollars("Unknown", "Topwear", "Apparel") == 36
    assert base_price_dollars("Unknown", "Unknown", "Footwear") == 60
    assert base_price_dollars("Unknown", "Unknown", "Unknown") == 35
