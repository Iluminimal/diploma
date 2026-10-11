# Search and catalogue API

Everything is under `/api/v1`. Interactive docs: `/api/v1/docs`; schema: `make openapi` (writes
`docs/openapi.json`, git-ignored). Errors are RFC 7807 `application/problem+json` with a
`request_id`; `type` is a stable `urn:lookalike:problem:*` for the cases a client reacts to.

## Running it

```bash
make infra && make migrate && make ingest     # once
make api                                      # loads FashionCLIP (~2 s warm), then /readyz turns green
make latency DEVICE=cpu                       # or DEVICE=mps: the report below
make test                                     # 200 tests, no model download
make test-ml                                  # real model + real catalogue quality checks
```

`/readyz` returns 503 until the database, Redis **and the model** are all up, so an orchestrator never
routes traffic to a pod that cannot search. `/healthz` stays independent of them.

## Endpoints

| | |
| --- | --- |
| `POST /search/image` | multipart: `file` (+ optional filter fields, `limit`) |
| `POST /search/text` | JSON: `{"query": "red floral dress", "limit": 24, "filters": {...}}` |
| `POST /search/hybrid` | multipart: `file`, `query`, optional `text_weight` (0..1), filters, `limit` |
| `GET /products/{id}/similar` | stored embedding, no inference; filters and `limit` as query params |
| `GET /products` | listing, see below |
| `GET /products/{id}` | one product (404 if unknown or inactive) |
| `GET /catalog/filters` | category tree, option lists and price range for a filter UI (cached 10 min) |
| `GET /catalog/nav` | Women / Men / Kids, each with Clothing, Footwear and Accessories groups, sub-categories and article types, with active-product counts and the `path` the listing's `category` filter takes (cached 10 min, `Cache-Control: public, max-age=300`) |
| `GET /catalog/sitemap` | active products as `id`, `slug`, `updated_at`, in id order, `page`/`page_size` up to 10,000 (the web app builds `/sitemap/{n}.xml` from it) |

All four searches return the same envelope:

```jsonc
{
  "results": [{ "product": { "id": 1, "slug": "...", "name": "...", "gender": "Men", "article_type": "Shirts",
                              "price_cents": 2599, "currency": "USD", "in_stock": true,
                              "image": { "thumb_400": "...", "thumb_800": "...", "blur_data_url": "data:..." } },
                "similarity": 0.8731 }],
  "detected": [{ "article_type": "Shirts", "category_path": "apparel/topwear/shirts", "score": 0.62 }],
  "timings": { "decode_ms": 5.8, "embed_ms": 40.1, "db_ms": 11.2, "total_ms": 58.0 },
  "cached": false
}
```

`detected` is the zero-shot FashionCLIP guess (top 3 article types, probabilities over every article type in the catalogue) for image
and hybrid search, empty otherwise. It is **returned, not applied**: the UI shows "Detected: Shirts" and a
user override is simply `article_type=...` on the next request. Prediction costs one small matrix product
on top of the image embedding the search needs anyway; label embeddings are computed once at start-up.
The localizer is an interface (`ml/classifier.py: GarmentLocalizer`); today it returns the whole image, a
YOLO detector can later return several regions.

### Filters

One vocabulary everywhere (query string for GET, form fields for multipart, `filters` object in JSON).
Repeat a parameter for "any of": `?gender=Men&gender=Unisex&color=Blue`.

`gender`, `master_category`, `sub_category`, `article_type`, `color`, `season`, `usage`,
`min_price`, `max_price` (integer **cents**, `min_price <= max_price`), `in_stock`.

### Listing

`GET /products?...filters&q=red+shirt&sort=price_asc&page=2&page_size=24`

* `sort`: `newest` (default), `price_asc`, `price_desc`, `relevance` (default when `q` is given, 422 without `q`).
  Every order ends with `id`, so products sharing a price never reshuffle between pages.
* `q` uses `websearch_to_tsquery` on the indexed `search_vector`: quotes, `or` and `-word` work and arbitrary
  input never raises a syntax error.
* Offset pagination with `total` and `pages`; a page past the end is an empty list, not an error.
  `page_size` is at most 60. Unknown query parameters are a 422 (typos do not silently disable a filter).
* `newest` orders by ingestion time; the dataset has no real release date. "New arrivals" on the home page
  should decide what it means when it is built.

## Upload hardening

Nothing the client says is trusted. In order, for `/search/image` and `/search/hybrid`:

| Check | Where | Result |
| --- | --- | --- |
| `Content-Length` over 8 MB + 64 KB | ASGI middleware, before reading | 413 |
| body bytes counted while streaming (chunked or lying length) | ASGI middleware | 413 |
| declared type not JPEG/PNG/WebP | route | 415 |
| file part over 8 MB, empty file | route | 413 / 422 |
| real format not JPEG/PNG/WebP (checked from magic bytes, so a GIF or HTML labelled `image/jpeg` fails) | Pillow `formats=` | 422 |
| pixel count over 25 MP, read from the header **before** decoding (decompression bombs) | `load_image(max_pixels=)` | 422 |
| truncated or corrupt data | Pillow | 422 |
| decoded off the event loop (`asyncio.to_thread`), first frame only | service | |

EXIF orientation is applied, then EXIF, ICC profile and comments are dropped from the decoded image; the
upload is never re-encoded or written anywhere. Starlette would normally spool any file part over 1 MB into a
temporary file; `MultiPartParser.spool_max_size` is raised above the upload limit so photos stay in memory
(a test fails if a rollover happens). Error bodies never echo file content or library internals.

The decode, orientation and resize/pad code is the same `ml/preprocess.py` that ingestion uses
(`load_image` got two optional parameters, `formats` and `max_pixels`; the defaults are unchanged), so a
catalogue photo uploaded as a query matches its own product at similarity 1.0.

## Caching (Redis)

All operations are best effort with a 0.5 s timeout: a Redis error is a cache miss, never a failed search.

| What | Key | TTL |
| --- | --- | --- |
| text embedding (2 KB float32) | `emb:txt:{embedding_version}:{sha256(lowercased, whitespace-normalized query)}` | 24 h |
| similar-products result | `sim:{embedding_version}:{product_id}:{limit}:{filters hash}` | 5 min |
| catalogue filter options | `catalog:filters:{embedding_version}` | 10 min |

The embedding version (`fashion-clip@<rev>/pad`) is in every key, so re-embedding the catalogue invalidates
everything without a flush. Similar results are short-lived because price and stock change; carts and
checkout must read the database regardless.

## Rate limiting

Fixed window per client address and limit name, one atomic Lua script in Redis. Defaults per minute:
image and hybrid search 20, text search 60, similar products 120; browsing (`/products`, `/catalog`) is not
limited. Responses carry `X-RateLimit-Limit/Remaining/Reset`; a refused request is a 429 problem with
`Retry-After`. Rejected uploads count too (the limit is checked before the upload is looked at). If Redis is
unreachable the request is allowed and a warning logged. `X-Forwarded-For` is only honoured with
`TRUST_PROXY_HEADERS=true`, otherwise a client could dodge the limit by sending it. Limits are `RATE_LIMIT_*`
settings. A fixed window allows up to 2x the limit across a window boundary; that is acceptable for abuse
protection, a sliding window would be needed for billing-grade accuracy.

## Hybrid search: choosing the text weight

`query vector = normalize((1 - w) * image + w * text)`. CLIP text and image vectors live in the same space
but are not equally "loud" (a text-to-image cosine is about 0.3, image-to-image about 0.8), so an even 0.5
split under-weights the text. Measured on 24 blue products (t-shirts, jeans, dresses, shoes, handbags, shirts),
top-12 results, text = a colour word:

| `w` | colour matches the text ("red") | still the same article type |
| --- | --- | --- |
| 0.00 (image only) | 4% | 79% |
| 0.35 | 17% | 80% |
| 0.50 | 33% | 79% |
| **0.65 (default)** | **53%** | **77%** |
| 0.80 | 80% | 52% |
| 1.00 (text only) | 92% | 4% |

"in red": 41% / 80% at 0.5, 68% / 75% at 0.65, 87% / 51% at 0.8. "black" and "white" follow the same shape
(colour 54% and 48% at 0.65 with 83% and 82% article type kept). 0.65 is the largest weight that keeps the garment;
past ~0.75 the picture stops mattering. Clients can override per request with `text_weight`.

## Measured latency

Apple M1 (8 GB), PyTorch 2.14, Postgres 18 + pgvector 0.8.7, 41,885 products, warm model and caches
empty for "cold" rows. **Client wall time** of the whole app in-process (middleware, multipart parsing, JSON
serialization, Redis), 200 requests per row after a 10-request warm-up; real catalogue photos sent as JPEG
bytes. Reproduce with `make latency DEVICE=cpu|mps`.

| | CPU p50 / p95 | MPS p50 / p95 | Target |
| --- | --- | --- | --- |
| **Image search**, original 1800x2400 upload | 62 / **71 ms** | 54 / **74 ms** | p95 < 400 ms |
| Image search, phone-style 1280 px upload | 57 / **66 ms** | 49 / **58 ms** | p95 < 400 ms |
| Image search + 5 filters | 78 / 82 ms | 86 / 105 ms | p95 < 400 ms |
| Hybrid search (image + cached text) | 59 / 66 ms | 49 / 56 ms | p95 < 400 ms |
| Text search, cold (embeds the text) | 32 / 39 ms | 33 / 44 ms | |
| Text search, cached embedding | 16 / 19 ms | 12 / 15 ms | |
| **Similar products**, cold | 22 / **30 ms** | 10 / **15 ms** | p95 < 50 ms |
| Similar products, cached | 2.8 / 4.0 ms | 1.4 / 1.8 ms | p95 < 50 ms |
| Listing, newest page 1 | 18 / 23 ms | 13 / 14 ms | |
| Listing, filters + price sort | 22 / 27 ms | 19 / 22 ms | |
| Listing, `q="red shirt"` | 17 / 22 ms | 10 / 15 ms | |
| Listing, deep page 800 | 31 / 35 ms | 25 / 27 ms | |
| `/catalog/filters` (cached; 54 ms uncached) | 2.1 / 2.7 ms | 1.0 / 1.1 ms | |

Where the image-search time goes (CPU, p50, original upload): decode 5.8 ms, embed + classify 41 ms,
database 14 ms. The model dominates; MPS saves about 13 ms of it. Filtered search costs more (it walks the
HNSW index further to fill the page, see `ml-pipeline.md`) but stays well inside the target.

**Concurrency.** Inference is serialized on one worker thread (MPS must not be driven from several threads),
so under load requests queue for the model: with 4 concurrent clients p95 is 192 ms on CPU (23 req/s) and
134 ms on MPS (34 req/s). The rate limit bounds how much one client can queue; horizontal scaling (more API
processes) is the way to more throughput.

No index was added for listing: the slowest filtered query is under 30 ms at p95, so there is no evidence
that one is needed.

## Decisions worth knowing

* **Row loading.** Search and listing `defer` the `embedding` and `search_vector` columns: a hit never needs
  its own 2 KB vector, and loading it was pure overhead.
* **Connections are held only for the query**, never while decoding or running the model.
* **Start-up** loads the model in a thread, runs one warm-up image and text inference and one similarity query
  (first-request penalty was ~180 ms of connection and plan setup). The classifier labels come from the
  database lazily and retry, so the API still boots when the database is a few seconds late.
* **One label per article type.** A few types (e.g. "Shorts") exist under two parents; duplicated prompts would
  split the probability, so the parent with the most products represents the type.
* `ProblemError` is an `HTTPException` subclass: FastAPI converts any other exception raised while reading a
  request body into a generic 400, which hid the 413 for streamed oversize uploads.
* Prices are integer cents in the API; `in_stock` is a boolean, the exact quantity is not exposed.

## Known limits

* HEIC/HEIF (iPhone "high efficiency" photos) is not accepted; browsers convert to JPEG on upload.
* The dataset lists a few photos under two products (a t-shirt photo also appears as a watch), so an exact
  tie at the top of an image search can legitimately contain the wrong article type.
* `search_logs` (spec section 3) is not a table yet: every search emits a structured log line (`kind`,
  `results`, `total_ms`, `cached`; never the image or the query text).
* Start-up asks the Hugging Face Hub whether the pinned revision is cached; offline it falls back to the cache.
