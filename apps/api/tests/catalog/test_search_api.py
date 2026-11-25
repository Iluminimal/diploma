from typing import Any

import pytest

from tests.conftest import Api

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

SEARCH = "/api/v1/search"
PRODUCTS = "/api/v1/products"


def upload(data: bytes, content_type: str = "image/jpeg") -> dict[str, tuple[str, bytes, str]]:
    return {"file": ("photo.jpg", data, content_type)}


def ids(response_json: dict[str, Any]) -> list[int]:
    return [hit["product"]["id"] for hit in response_json["results"]]


# --- Зургаар хайх ---------------------------------------------------------------------------


async def test_a_products_own_photo_finds_it_at_rank_one(api: Api) -> None:
    for entry in (api.entries[0], api.entries[17], api.entries[-1]):
        response = await api.client.post(f"{SEARCH}/image", files=upload(entry.jpeg))

        body = response.json()
        assert response.status_code == 200
        assert body["results"][0]["product"]["id"] == entry.product_id
        assert body["results"][0]["similarity"] == pytest.approx(1.0, abs=1e-3)
        similarities = [hit["similarity"] for hit in body["results"]]
        assert similarities == sorted(similarities, reverse=True)


async def test_image_search_response_shape(api: Api) -> None:
    response = await api.client.post(
        f"{SEARCH}/image", files=upload(api.entries[3].jpeg), data={"limit": "5"}
    )

    body = response.json()
    assert len(body["results"]) == 5
    product = body["results"][0]["product"]
    assert "embedding" not in product
    assert "search_vector" not in product
    assert set(product["image"]) == {"thumb_400", "thumb_800", "blur_data_url"}
    assert product["image"]["thumb_400"].endswith("_400.webp")
    assert isinstance(product["in_stock"], bool)
    assert "stock_quantity" not in product
    timings = body["timings"]
    assert timings["decode_ms"] >= 0
    assert timings["embed_ms"] >= 0
    assert timings["total_ms"] >= timings["db_ms"]
    assert body["cached"] is False


async def test_image_search_returns_predicted_categories(api: Api) -> None:
    response = await api.client.post(f"{SEARCH}/image", files=upload(api.entries[0].jpeg))

    detected = response.json()["detected"]
    assert len(detected) == 3
    known = {"Shirts", "Tshirts", "Jeans", "Casual Shoes"}
    assert {d["article_type"] for d in detected} <= known
    scores = [d["score"] for d in detected]
    assert scores == sorted(scores, reverse=True)
    assert 0 < sum(scores) <= 1.0001
    assert all("/" in d["category_path"] for d in detected)


async def test_image_search_applies_filters(api: Api) -> None:
    response = await api.client.post(
        f"{SEARCH}/image",
        files=upload(api.entries[0].jpeg),
        data={
            "gender": ["Men", "Unisex"],
            "article_type": "Shirts",
            "min_price": "1500",
            "max_price": "4000",
            "in_stock": "true",
            "limit": "60",
        },
    )

    assert response.status_code == 200
    results = response.json()["results"]
    assert results
    by_id = {e.product_id: e for e in api.entries}
    for hit in results:
        entry = by_id[hit["product"]["id"]]
        assert entry.gender in ("Men", "Unisex")
        assert entry.article_type == "Shirts"
        assert 1500 <= entry.price_cents <= 4000
        assert entry.in_stock
        assert hit["product"]["in_stock"]


async def test_filters_that_match_nothing_return_an_empty_list(api: Api) -> None:
    response = await api.client.post(
        f"{SEARCH}/image", files=upload(api.entries[0].jpeg), data={"gender": "Girls"}
    )

    assert response.status_code == 200
    assert response.json()["results"] == []


@pytest.mark.parametrize(
    "bad_form",
    [
        {"min_price": "5000", "max_price": "100"},
        {"limit": "0"},
        {"limit": "61"},
        {"min_price": "-1"},
        {"in_stock": "maybe"},
    ],
)
async def test_image_search_rejects_invalid_parameters(api: Api, bad_form: dict[str, str]) -> None:
    response = await api.client.post(
        f"{SEARCH}/image", files=upload(api.entries[0].jpeg), data=bad_form
    )

    assert response.status_code == 422
    assert response.headers["content-type"] == "application/problem+json"


# --- Текстээр хайх --------------------------------------------------------------------------


async def test_text_search(api: Api) -> None:
    response = await api.client.post(
        f"{SEARCH}/text",
        json={"query": "red floral dress", "limit": 7, "filters": {"gender": ["Women"]}},
    )

    body = response.json()
    assert response.status_code == 200
    assert 0 < len(body["results"]) <= 7
    assert all(hit["product"]["gender"] == "Women" for hit in body["results"])
    assert body["detected"] == []
    assert body["timings"]["decode_ms"] is None


@pytest.mark.parametrize(
    "payload",
    [{}, {"query": ""}, {"query": "   "}, {"query": "x" * 201}, {"query": "ok", "limit": 500}],
)
async def test_text_search_validates_the_query(api: Api, payload: dict[str, object]) -> None:
    response = await api.client.post(f"{SEARCH}/text", json=payload)

    assert response.status_code == 422


# --- Hybrid хайлт ---------------------------------------------------------------------------


async def test_hybrid_weight_zero_is_image_search_and_one_is_text_search(api: Api) -> None:
    entry = api.entries[4]
    image_only = await api.client.post(
        f"{SEARCH}/hybrid", files=upload(entry.jpeg), data={"query": "blue", "text_weight": "0"}
    )
    text_only = await api.client.post(
        f"{SEARCH}/hybrid", files=upload(entry.jpeg), data={"query": "blue", "text_weight": "1"}
    )
    plain_text = await api.client.post(f"{SEARCH}/text", json={"query": "blue"})
    plain_image = await api.client.post(f"{SEARCH}/image", files=upload(entry.jpeg))

    assert ids(image_only.json()) == ids(plain_image.json())
    assert ids(text_only.json()) == ids(plain_text.json())
    assert image_only.json()["results"][0]["product"]["id"] == entry.product_id


async def test_hybrid_default_blends_image_and_text(api: Api) -> None:
    entry = api.entries[4]
    response = await api.client.post(
        f"{SEARCH}/hybrid", files=upload(entry.jpeg), data={"query": "in blue", "limit": "10"}
    )

    body = response.json()
    assert response.status_code == 200
    assert len(body["results"]) == 10
    assert len(body["detected"]) == 3  # ангиллын таамаглал зургийн хэсгээс ирнэ
    # Санамсаргүй fake embedding-ийн үед холимог нь зурагт өөрт нь хамгийн ойр байхаа больсон.
    assert body["results"][0]["similarity"] < 0.95


@pytest.mark.parametrize("data", [{}, {"query": ""}, {"query": "a", "text_weight": "1.5"}])
async def test_hybrid_validates_parameters(api: Api, data: dict[str, str]) -> None:
    response = await api.client.post(
        f"{SEARCH}/hybrid", files=upload(api.entries[0].jpeg), data=data
    )

    assert response.status_code == 422


# --- Төстэй бараа ---------------------------------------------------------------------------


async def test_similar_products_exclude_the_product_and_are_sorted(api: Api) -> None:
    entry = api.entries[9]
    response = await api.client.get(f"{PRODUCTS}/{entry.product_id}/similar", params={"limit": 8})

    body = response.json()
    assert response.status_code == 200
    assert len(body["results"]) == 8
    assert entry.product_id not in ids(body)
    similarities = [hit["similarity"] for hit in body["results"]]
    assert similarities == sorted(similarities, reverse=True)
    assert body["timings"]["embed_ms"] is None  # inference хийгдээгүй


async def test_similar_products_follow_filters(api: Api) -> None:
    entry = api.entries[9]
    response = await api.client.get(
        f"{PRODUCTS}/{entry.product_id}/similar",
        params={"gender": "Women", "in_stock": "true", "limit": 60},
    )

    assert response.status_code == 200
    assert response.json()["results"]
    assert all(
        hit["product"]["gender"] == "Women" and hit["product"]["in_stock"]
        for hit in response.json()["results"]
    )


async def test_similar_products_of_an_unknown_product_is_a_404_problem(api: Api) -> None:
    response = await api.client.get(f"{PRODUCTS}/999999/similar")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["type"] == "urn:angel:problem:product-not-found"


async def test_similar_products_of_a_deactivated_product_is_a_404(api: Api) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(api.settings.database_url)
    async with engine.begin() as connection:
        await connection.execute(text("UPDATE products SET is_active = false WHERE id = 5"))
    await engine.dispose()

    response = await api.client.get(f"{PRODUCTS}/5/similar")

    assert response.status_code == 404


@pytest.mark.parametrize("bad_id", ["0", "-3", "abc"])
async def test_product_ids_are_validated(api: Api, bad_id: str) -> None:
    assert (await api.client.get(f"{PRODUCTS}/{bad_id}/similar")).status_code == 422
    assert (await api.client.get(f"{PRODUCTS}/{bad_id}")).status_code == 422


# --- Текстээс шүүлтүүр задлах (interpret) -----------------------------------------------------


async def test_interpret_turns_words_and_a_price_into_filters(api: Api) -> None:
    response = await api.client.post(
        f"{SEARCH}/text",
        json={"query": "цэнхэр цамц 30₮-аас доош", "interpret": True, "limit": 60},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["applied"] == [
        {"key": "color", "value": "Blue"},
        {"key": "max_price", "value": "3000"},
    ]
    assert body["results"]
    assert all(
        hit["product"]["base_colour"] == "Blue" and hit["product"]["price_cents"] <= 3000
        for hit in body["results"]
    )


async def test_without_interpret_the_text_is_only_embedded(api: Api) -> None:
    response = await api.client.post(f"{SEARCH}/text", json={"query": "blue under $30"})

    assert response.status_code == 200
    assert response.json()["applied"] == []
    assert len({hit["product"]["base_colour"] for hit in response.json()["results"]}) > 1


async def test_a_text_made_only_of_filters_has_nothing_to_search_for(api: Api) -> None:
    response = await api.client.post(
        f"{SEARCH}/text", json={"query": "50$-аас доош", "interpret": True}
    )

    assert response.status_code == 422
    assert response.json()["title"] == "Хайх зүйл алга"


async def test_hybrid_with_only_filter_words_is_an_image_search_with_those_filters(
    api: Api,
) -> None:
    entry = api.entries[4]
    filtered = await api.client.post(
        f"{SEARCH}/image", files=upload(entry.jpeg), data={"color": "Blue", "limit": "20"}
    )
    texts_before = api.embedder.texts_embedded  # classifier-ийн ангиллын текстүүдтэй хамт
    interpreted = await api.client.post(
        f"{SEARCH}/hybrid",
        files=upload(entry.jpeg),
        data={"query": "цэнхэр", "interpret": "true", "limit": "20"},
    )

    assert interpreted.status_code == 200
    assert interpreted.json()["applied"] == [{"key": "color", "value": "Blue"}]
    assert ids(interpreted.json()) == ids(filtered.json())
    assert api.embedder.texts_embedded == texts_before  # үлдсэн текст байхгүй


async def test_interpreted_words_never_override_the_users_own_filter(api: Api) -> None:
    response = await api.client.post(
        f"{SEARCH}/hybrid",
        files=upload(api.entries[4].jpeg),
        data={"query": "цэнхэр цамц", "interpret": "true", "color": "Red", "limit": "30"},
    )

    body = response.json()
    assert body["applied"] == []
    assert {hit["product"]["base_colour"] for hit in body["results"]} == {"Red"}


# --- Төстэй бараа + текст -------------------------------------------------------------------


async def test_similar_with_text_moves_the_results_and_leaves_the_product_out(api: Api) -> None:
    entry = api.entries[9]
    texts_before = api.embedder.texts_embedded
    plain = await api.client.get(f"{PRODUCTS}/{entry.product_id}/similar", params={"limit": 12})
    refined = await api.client.get(
        f"{PRODUCTS}/{entry.product_id}/similar", params={"query": "long sleeve", "limit": 12}
    )

    assert refined.status_code == 200
    assert entry.product_id not in ids(refined.json())
    assert ids(refined.json()) != ids(plain.json())
    assert refined.json()["timings"]["embed_ms"] is not None
    assert api.embedder.texts_embedded == texts_before + 1


async def test_similar_with_text_is_cached_per_text_and_weight(api: Api) -> None:
    entry = api.entries[9]
    url = f"{PRODUCTS}/{entry.product_id}/similar"
    texts_before = api.embedder.texts_embedded
    first = await api.client.get(url, params={"query": "long sleeve"})
    again = await api.client.get(url, params={"query": "Long  Sleeve"})
    other_weight = await api.client.get(url, params={"query": "long sleeve", "text_weight": 0.2})

    assert first.json()["cached"] is False
    assert again.json()["cached"] is True
    assert ids(again.json()) == ids(first.json())
    assert other_weight.json()["cached"] is False
    # хоёр дахь нь үр дүнгийн cache, гурав дахь нь текстийн embedding-ийн cache
    assert api.embedder.texts_embedded == texts_before + 1


async def test_similar_with_interpreted_words_is_a_filtered_similar(api: Api) -> None:
    entry = api.entries[9]
    url = f"{PRODUCTS}/{entry.product_id}/similar"
    texts_before = api.embedder.texts_embedded
    interpreted = await api.client.get(
        url, params={"query": "цэнхэр", "interpret": "true", "limit": 20}
    )
    filtered = await api.client.get(url, params={"color": "Blue", "limit": 20})

    assert interpreted.json()["applied"] == [{"key": "color", "value": "Blue"}]
    assert ids(interpreted.json()) == ids(filtered.json())
    assert api.embedder.texts_embedded == texts_before


async def test_similar_text_is_validated(api: Api) -> None:
    url = f"{PRODUCTS}/{api.entries[0].product_id}/similar"

    assert (await api.client.get(url, params={"query": ""})).status_code == 422
    assert (await api.client.get(url, params={"query": "a", "text_weight": 2})).status_code == 422
    assert (
        await api.client.get(f"{PRODUCTS}/999999/similar", params={"query": "a"})
    ).status_code == 404


# --- Жагсаалт ---------------------------------------------------------------------------------


async def test_listing_paginates_without_gaps_or_overlap(api: Api) -> None:
    seen: list[int] = []
    first = (await api.client.get(PRODUCTS, params={"page_size": 15})).json()
    assert (first["total"], first["pages"], first["page"]) == (40, 3, 1)
    for page in range(1, first["pages"] + 1):
        body = (await api.client.get(PRODUCTS, params={"page": page, "page_size": 15})).json()
        seen += [item["id"] for item in body["items"]]

    assert len(seen) == len(set(seen)) == 40


async def test_listing_beyond_the_last_page_is_empty_not_an_error(api: Api) -> None:
    response = await api.client.get(PRODUCTS, params={"page": 99, "page_size": 15})

    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == 40


async def test_listing_sorts_by_price_with_stable_ties(api: Api) -> None:
    ascending = (
        await api.client.get(PRODUCTS, params={"sort": "price_asc", "page_size": 60})
    ).json()
    descending = (
        await api.client.get(PRODUCTS, params={"sort": "price_desc", "page_size": 60})
    ).json()

    asc_prices = [i["price_cents"] for i in ascending["items"]]
    assert asc_prices == sorted(asc_prices)
    assert [i["price_cents"] for i in descending["items"]] == sorted(asc_prices, reverse=True)
    # Үнэ ижил бараанууд (6 бүр) тогтмол дарааллаа хадгална, тиймээс хуудас дахин холилдохгүй.
    ties = [i["id"] for i in ascending["items"] if i["price_cents"] == 5000]
    assert ties == sorted(ties)


async def test_listing_filters_combine(api: Api) -> None:
    response = await api.client.get(
        PRODUCTS,
        params=[
            ("gender", "Men"),
            ("gender", "Women"),
            ("color", "Blue"),
            ("article_type", "Shirts"),
            ("article_type", "Tshirts"),
            ("master_category", "Apparel"),
            ("season", "Winter"),
            ("min_price", "1200"),
            ("max_price", "3000"),
            ("in_stock", "true"),
            ("page_size", "60"),
        ],
    )

    body = response.json()
    assert response.status_code == 200
    # Seed өгөгдөл: source_id % 4 == 0 бол өнгө Blue, ID тэгш бол улирал Winter.
    expected = {
        e.product_id
        for e in api.entries
        if e.gender in ("Men", "Women")
        and e.article_type in ("Shirts", "Tshirts")
        and 1200 <= e.price_cents <= 3000
        and e.in_stock
        and e.source_id % 4 == 0
    }
    assert expected, "the fixture must make this query non-trivial"
    assert {item["id"] for item in body["items"]} == expected
    assert body["total"] == len(expected)


async def test_listing_text_query_defaults_to_relevance(api: Api) -> None:
    response = await api.client.get(PRODUCTS, params={"q": "Jeans", "page_size": 60})

    body = response.json()
    assert response.status_code == 200
    assert body["total"] > 0
    assert all("Jeans" in item["name"] for item in body["items"])


async def test_listing_text_query_accepts_arbitrary_user_input(api: Api) -> None:
    for query in ['"unbalanced', "a & b | !c", "'; DROP TABLE products; --", "-", "((("]:
        response = await api.client.get(PRODUCTS, params={"q": query})
        assert response.status_code == 200, query

    assert (await api.client.get(PRODUCTS)).json()["total"] == 40


@pytest.mark.parametrize(
    "params",
    [
        {"sort": "relevance"},  # q хэрэгтэй
        {"sort": "cheapest"},
        {"page": "0"},
        {"page_size": "61"},
        {"min_price": "9", "max_price": "1"},
        {"unknown_param": "1"},
    ],
)
async def test_listing_rejects_invalid_parameters(api: Api, params: dict[str, str]) -> None:
    response = await api.client.get(PRODUCTS, params=params)

    assert response.status_code == 422
    assert response.headers["content-type"] == "application/problem+json"


async def test_get_product_and_404(api: Api) -> None:
    entry = api.entries[2]
    found = await api.client.get(f"{PRODUCTS}/{entry.product_id}")
    missing = await api.client.get(f"{PRODUCTS}/123456")

    assert found.status_code == 200
    assert found.json()["id"] == entry.product_id
    assert found.json()["price_cents"] == entry.price_cents
    assert missing.status_code == 404
    assert missing.json()["instance"] == f"{PRODUCTS}/123456"


async def test_catalog_filters(api: Api) -> None:
    body = (await api.client.get("/api/v1/catalog/filters")).json()

    assert set(body["genders"]) == {"Men", "Women", "Unisex"}
    assert set(body["colors"]) == {"Blue", "Red", "Black"}
    assert body["price_range"] == {"min_cents": 1100, "max_cents": 5000}
    roots = {node["name"]: node for node in body["categories"]}
    assert set(roots) == {"Apparel", "Footwear"}
    topwear = next(c for c in roots["Apparel"]["children"] if c["name"] == "Topwear")
    assert {c["name"] for c in topwear["children"]} == {"Shirts", "Tshirts"}
    assert topwear["children"][0]["path"].startswith("apparel/topwear/")
