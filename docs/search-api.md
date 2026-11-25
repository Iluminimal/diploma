# Search and catalogue API

Everything is under `/api/v1`. Interactive docs: `/api/v1/docs`; schema: `make openapi` (writes
`docs/openapi.json`, git-ignored). Errors are RFC 7807 `application/problem+json` with a
`request_id`; `type` is a stable `urn:angel:problem:*` for the cases a client reacts to.

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
| `POST /search/text` | JSON: `{"query": "red floral dress", "limit": 24, "filters": {...}, "interpret": false}` |
| `POST /search/garments` | multipart: `file`, filters, `limit` **per garment** (default 12): every garment found in the photo with its own products, see "Garments in the photo" |
| `POST /search/detect` | multipart: `file` (one camera frame). Only finds the garments and returns their boxes, see "Live camera preview" |
| `POST /search/hybrid` | multipart: `file`, `query`, optional `text_weight` (0..1), filters, `limit`, `interpret` |
| `GET /products/{id}/similar` | stored embedding, no image inference; filters and `limit` as query params; optional `query`, `text_weight`, `interpret` blend a text in ("like this, but in red") |
| `GET /products` | listing, see below |
| `GET /products/{id}` | one product (404 if unknown or inactive) |
| `GET /catalog/filters` | category tree, option lists and price range for a filter UI (cached 10 min) |
| `GET /catalog/nav` | Women / Men / Kids, each with Clothing, Footwear and Accessories groups, sub-categories and article types, with active-product counts and the `path` the listing's `category` filter takes (cached 10 min, `Cache-Control: public, max-age=300`) |
| `GET /catalog/sitemap` | active products as `id`, `slug`, `updated_at`, in id order, `page`/`page_size` up to 10,000 (the web app builds `/sitemap/{n}.xml` from it) |

All four searches return the same envelope:

```jsonc
{
  "results": [{ "product": { "id": 1, "slug": "...", "name": "...", "gender": "Men", "article_type": "Shirts",
                              "price_cents": 8790000, "currency": "MNT", "in_stock": true,
                              "image": { "thumb_400": "...", "thumb_800": "...", "blur_data_url": "data:..." } },
                "similarity": 0.8731 }],
  "detected": [{ "article_type": "Shirts", "category_path": "apparel/topwear/shirts", "score": 0.62 }],
  "regions": [{ "box": { "x": 0.08, "y": 0.05, "width": 0.84, "height": 0.52 }, "label": "top, t-shirt, sweatshirt", "score": 0.93 },
              { "box": { "x": 0.2, "y": 0.78, "width": 0.5, "height": 0.2 }, "label": "shoe", "score": 0.81 }],
  "selected_region": 0,
  "timings": { "decode_ms": 5.8, "detect_ms": 71.0, "embed_ms": 40.1, "db_ms": 11.2, "total_ms": 129.0 },
  "cached": false,
  "applied": []
}
```

`applied` is filled only with `interpret=true` (see "Filters from words" below). `detected` is the zero-shot FashionCLIP guess (top 3 article types, probabilities over every article type in the catalogue) for image
and hybrid search, empty otherwise. It is **returned, not applied**: the UI shows "Detected: Shirts" and a
user override is simply `article_type=...` on the next request. Prediction costs one small matrix product
on top of the image embedding the search needs anyway; label embeddings are computed once at start-up.

### Live camera preview (`/search/detect`)

While the web camera dialog is open it outlines the garments in the live video with dotted frames (Amazon style), so the
user can aim before capturing. Every ~350 ms the page sends one downscaled frame (longest side 480 px, JPEG) to
`POST /search/detect`, which runs only decode + the localizer (no embedding, classifier or database) and returns

```jsonc
{ "regions": [{ "box": { "x": 0.1, "y": 0.1, "width": 0.4, "height": 0.5 }, "label": "...", "score": 0.93 }], "detect_ms": 55 }
```

- Frames are **never stored** (same upload path as `/search/image`: in-memory parsing, only counts and timings are logged).
  The camera dialog says so next to a "Highlight garments" checkbox that is on by default; the choice is remembered in
  `localStorage`, and with it off nothing is sent. The frame leaves the browser only for this analysis.
- Its own rate-limit bucket (`RATE_LIMIT_DETECT`, default `300/60`) so live frames do not use up the 20/min `image` budget
  and a search is never blocked by them. The page waits for each answer before sending the next frame (never two in flight),
  stops when the tab is hidden, the checkbox is off or the dialog closes, and gives up quietly (capturing still works) on a 429
  or three failures in a row.
- The page smooths the boxes between frames (`track-regions.ts`: IoU matching with stable ids, a box is kept two frames after it
  disappears) and shows only boxes with score >= 0.4 and a label; the frames are indicators only, **Capture** takes the whole
  frame and the garments are then searched as usual. The preview takes the camera's real aspect ratio so the boxes line up.
- Measured on an M1/MPS: 480 px frame p50 58 ms, p95 61 ms (`make latency`); image searches running at the same time as a live
  preview (one frame every 350 ms): p95 166 ms against ~155 ms alone.

### Garments in the photo (`regions`)

A photo of an outfit has several garments, and one embedding of the whole picture mixes them. Image and hybrid
search therefore first run a **localizer** (`ml/localizer.py: GarmentLocalizer`) that returns the garments it finds,
most prominent first, and only the selected one is embedded and searched:

- `LOCALIZER=yolo` (default): `ml/yolo.py` runs YOLOv8m fine-tuned on Fashionpedia
  ([`NovaAstro/YOLOv8m_fashion`](https://huggingface.co/NovaAstro/YOLOv8m_fashion), Apache-2.0, commit pinned). Only
  garments and accessories are kept (shirt, pants, dress, shoe, bag, watch, ...; parts such as sleeve or pocket are
  dropped), overlapping boxes are merged across classes, boxes under 1% of the picture are ignored, at most 5 are
  returned and each is padded by 5%. Ranking is `score * sqrt(area)`, so the dress outranks a confident but tiny watch.
  With no detection the whole picture is the only region. A plain catalogue photo is *not* unaffected: the detector
  fires on about 90% of them and the crop scores slightly lower than the whole picture (category mAP@10 0.809 vs 0.825,
  see `docs/ml-comparison.md` section 5).
- `LOCALIZER=whole`: no detector; one region covering the picture (the baseline in `docs/ml-pipeline.md`).
- `region` (form field, default `0`) picks which entry of `regions` to search; an index past the end is a 422
  ("Хэсэг олдсонгүй"). The client sends the same photo again with the index the user tapped, the detector is
  deterministic so indices are stable.
- `regions[].box` is relative to the picture (0..1, top-left corner, width, height) so a UI can draw it over any
  rendition of the photo. `timings.detect_ms` is the detector's share of the request (about 70 ms on an M1 with MPS).
- Nothing about the photo is stored; regions only exist in the response.

`POST /search/garments` is the all-at-once version: it runs the same localizer, embeds **every** crop in one model batch,
searches the catalogue once per garment and returns

```jsonc
{ "garments": [{ "index": 0, "region": { "box": {...}, "label": "...", "score": 0.93 },
                 "detected": [{ "article_type": "Shirts", ... }],     // zero-shot guess from this crop
                 "results": [{ "product": {...}, "similarity": 0.87 }] }],
  "timings": { "decode_ms": 6, "detect_ms": 64, "embed_ms": 30, "db_ms": 40, "total_ms": 142 } }
```

Filters apply to every garment. `index` is the `region` to pass to `/search/image` (or `/search/hybrid`) to open that
garment with more results or to refine it with words, and its results equal that single-garment search. One garment, or
none found (whole picture), gives a single entry. The web app uses it for the first search of a photo, shows a section per
garment and opens one on "See all matches". Same upload limits, `image` rate-limit bucket and error shapes as `/search/image`.
Measured on an M1/MPS with a 3-product collage (about 3.5 garments each): p50 122 ms, p95 143 ms. The detector returns about 0.8 more garments than products per collage;
in the one collage inspected they were real clothes the models in the product photos wear (trousers under a shirt), which
show up as extra sections. The UI marks each garment with a numbered dot (Amazon style) rather than a name because the
detector's labels are unreliable (shoes as "shorts").


### Filters

One vocabulary everywhere (query string for GET, form fields for multipart, `filters` object in JSON).
Repeat a parameter for "any of": `?gender=Men&gender=Unisex&color=Blue`.

`gender`, `master_category`, `sub_category`, `article_type`, `color`, `season`, `usage`,
`min_price`, `max_price` (integer **cents**, `min_price <= max_price`), `in_stock`.

### Listing

`GET /products?...filters&q=red+shirt&sort=price_asc&page=2&page_size=24`

* `sort`: `newest` (default), `price_asc`, `price_desc`, `relevance` (default when `q` is given, 422 without `q`),
  `rating` (average, then number of reviews) and `popular` (units sold in paid, shipped or delivered orders, newest on a tie).
  Every order ends with `id`, so products sharing a price never reshuffle between pages.
* **Typo tolerance**: when `q` matches nothing, the same filters and sort are applied to a trigram match on the product
  name (`pg_trgm` `word_similarity` at 0.4, GIN index `ix_products_name_trgm`) and the page says `"fuzzy": true`. An exact
  match is never marked fuzzy, nonsense still returns an empty page, and the fallback only runs after an empty result so a
  correct word pays nothing for it. The web shows "No exact matches for “x”. Showing the closest results."
* `GET /products/{id}/complete-the-look?limit=8` (1 to 12): products that go with this one, from the complementary
  sub-categories in `COMPLEMENTS` (`services/catalog/catalog.py`: a top gets bottoms, shoes, bags, watches, belts), same gender or
  Unisex, active and in stock, the same `usage` first and then the best sellers, at most two per sub-category and taken in turn
  so no category fills the row. 404 for an unknown or withdrawn product.
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
| similar-products result | `sim:{embedding_version}:{product_id}:{limit}:{filters + text + weight hash}` | 5 min |
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

## Filters from words (`interpret=true`)

CLIP is a poor judge of "blue", "summer" or "under $50", and it only knows English. With `interpret=true` on
`/search/text`, `/search/hybrid` and `/products/{id}/similar`, `services/catalog/query_parser.py` pulls those words
out of the text (Mongolian and English) and turns them into real filters; whatever is left goes to the model. The
response lists what was applied so a UI can show it:

```jsonc
// POST /search/text {"query": "цэнхэр зуны цамц 50$-аас доош", "interpret": true}
{ "applied": [ {"key": "color", "value": "Blue"}, {"key": "season", "value": "Summer"},
               {"key": "max_price", "value": "5000"} ], "results": [ ... ] }   // text sent to CLIP: "цамц Blue Summer"
```

* **Recognised:** colour, gender, season, usage, "in stock", and prices. `men` / `эрэгтэй` also match `Unisex`, as the
  menu does. Mongolian case endings are handled (`цэнхэрээр`, `өвлийн`), but only whole words: `хар` (black) does not
  match `харагдах`.
* **Prices** need a currency mark or unit *and* a direction, otherwise the number is left in the text:
  `under $50`, `50$-аас доош`, `20$-аас дээш`, `$20-$50`, `35 мянгаас доош`, `3.5 сая төгрөгөөс доош`.
  Togrog amounts are used as they are (prices are stored in togrog minor units); `$` amounts are converted with a fixed
  reference rate (`USD_IN_TOGROG`, search only).
  "cheap" or "cheaper" has nothing to compare with and is not turned into a filter.
* **Only real values:** a word becomes a filter only if the catalogue has that value (`GET /catalog/filters`).
* **Your filters win:** a key you pass yourself (`color=Red`) is never overridden; the parser fills empty keys only,
  and `applied` lists just what it did.
* **What is embedded:** for hybrid and similar the leftover text only (the filters already carry the colour, and
  adding "Blue" would pull results away from the photo). Text search also appends the English names ("Blue") so the
  model still gets the meaning. If nothing is left, hybrid is a plain image search with those filters, similar is a
  filtered similar, and `/search/text` answers 422 "Nothing to search for".
* Off by default (`false`), so existing clients behave exactly as before; the web app sends `true`.

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

With `LOCALIZER=yolo` (default) the detector adds about 65 ms per image search (p50 detect 64 ms, p95 127 ms on an M1/MPS)
and the end-to-end MPS figures become: original upload 129 / **161 ms**, 1280 px upload 119 / **155 ms**, hybrid 122 / **145 ms**
(all under the 400 ms target); four concurrent clients 398 / 508 ms at 9.5 requests/s because detector and embedder share the GPU.
The table above was measured without a detector (`LOCALIZER=whole`).

Where the image-search time goes (CPU, p50, original upload, no detector): decode 5.8 ms, embed + classify 41 ms,
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
