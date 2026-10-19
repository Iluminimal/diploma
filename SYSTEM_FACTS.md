# SYSTEM_FACTS: Lookalike

Fact sheet for the bachelor thesis. Generated 2026-10-08 by reading the repository and running its tools.
Nothing in the repository was modified; this file is the only addition.

**How to read the evidence tags**

| Tag | Meaning |
| --- | --- |
| **[V]** | Verified: I ran a command in this session (output shown or summarised here). |
| **[R]** | Read from a source / config file whose path is given; not executed by me as a separate check. |
| **[D]** | Stated in the repo's own documentation (`docs/*.md`, `README.md`) only. I did not re-run it. |
| **NOT FOUND** | I looked (file listing / grep) and it does not exist in the repo. |

**State of the repository at the time of writing [V]** (`git log`, `git status`): HEAD is
`20e1d7a feat: phase 3 search + catalog API`. The working tree additionally holds **uncommitted Phase 4 work**
(the whole storefront under `apps/web/src`: 12 modified tracked files + 39 untracked paths before this file was added).
Everything below about the frontend describes that working tree, not a commit.

**Machine used for every measurement [V]** (`sysctl`, `sw_vers`): Apple M1, 8 cores, 8 GiB RAM, macOS 26.6.2.
Postgres and Redis ran in Docker; the dev API (idle) and Next dev server were running at the same time.

---

## 1. Overview

- **What it is** [R `README.md`, `docs/SPEC.md`]: a monorepo for an e-commerce website with image-based similar-clothing
  search. A user uploads, drops, pastes or captures a photo of clothing; the system embeds it with the FashionCLIP model and
  returns the visually closest catalogue products by cosine similarity in PostgreSQL + pgvector. It also supports text search,
  hybrid (photo + words) search, and "similar products" for a catalogue item.
- **What actually exists in code [R/V]**: catalogue ingestion (Kaggle fashion dataset), a FastAPI backend with search +
  catalogue endpoints, and a Next.js storefront (home, listing, product detail, visual search page).
- **What is specified but does NOT exist** (`docs/SPEC.md` §3, §5 vs. code): users/auth, addresses, carts, orders, payments,
  wishlist, reviews, `search_logs` table, checkout/Stripe, admin area, transactional emails. See §5, §8, §12.
- **README status line is stale**: `README.md` line 7 says "Status: Phase 2 (data + ML) … search endpoints and the store arrive in
  later phases", while the code contains Phases 3 and 4 [R]. It also says the home page shows an API status line; that
  component (`apps/web/src/features/health/api-status.tsx`) is not imported anywhere outside its own folder [V grep].

---

## 2. Tech stack

Versions below are **installed versions** [V] (`uv run python importlib.metadata`, `npm ls --depth=0`, `node -v`, `docker exec …`),
with the declared constraint from `apps/api/pyproject.toml` / `apps/web/package.json` where it is a range.

### Backend (`apps/api`, Python 3.12.15 [V]; `apps/api/.python-version` = `3.12`)

| Package | Installed | Declared |
| --- | --- | --- |
| fastapi | 0.142.2 | `>=0.142.2` |
| starlette | 1.7.0 | (transitive) |
| pydantic / pydantic-settings | 2.13.5 / 2.15.0 | `>=2.15.0` (settings) |
| uvicorn[standard] | 0.54.0 | `>=0.54.0` |
| sqlalchemy[asyncio] | 2.1.3 | `>=2.1.3` |
| asyncpg | 0.32.0 | `>=0.32.0` |
| alembic | 1.20.0 | `>=1.20.0` |
| pgvector (Python) | 0.5.0 | `>=0.5.0` |
| torch | 2.14.1 | `>=2.14.1` (CPU wheels on Linux via `[tool.uv.sources]`; default wheels on macOS) |
| transformers | 5.19.0 | `>=5.19.0` |
| safetensors | 0.8.0 | `>=0.8.0` |
| numpy / pandas / pyarrow | 2.5.3 / 3.0.6 / 25.0.1 | `>=` same |
| pillow | 12.3.0 | `>=12.3.0` |
| redis (client) | 8.1.0 | `>=5` |
| structlog | 26.1.0 | `>=26.1.0` |
| python-multipart | 0.0.32 | `>=0.0.32` |
| tqdm | 4.70.1 | `>=4.70.1` |
| dev: pytest 9.1.1, pytest-asyncio 1.4.0, ruff 0.16.10, mypy 2.4.0, httpx 0.28.1, asgi-lifespan 2.1.0 | | `pyproject.toml` `[dependency-groups]` |

Package manager: `uv` (lockfile `apps/api/uv.lock`). Build backend `uv_build`. Lint: Ruff (line length 100). Types: mypy `strict`, pydantic plugin.

### Frontend (`apps/web`, Node v26.10.0 locally [V]; `.nvmrc` = `24` [R])

| Package | Installed [V] |
| --- | --- |
| next | 16.4.0 (App Router; `reactCompiler: true`) |
| react / react-dom | 19.3.0 |
| typescript | 5.9.3 (`strict`, `noUncheckedIndexedAccess`) |
| tailwindcss / @tailwindcss/postcss | 4.3.3 |
| radix-ui | 1.7.0 |
| shadcn (CLI) | 4.21.3 |
| class-variance-authority / tw-animate-css | 0.7.1 / 1.4.0 |
| lucide-react | 1.52.0 |
| @tanstack/react-query | 5.104.1 |
| zustand | 5.0.15 |
| react-hook-form / @hookform/resolvers / zod | 7.89.0 / 5.9.1 / 4.6.5 |
| openapi-fetch / openapi-typescript | 0.17.0 / 7.13.0 |
| next-themes | 0.4.6 |
| heic-to (HEIC→JPEG, WASM) | 1.6.5 |
| vitest / jsdom / @testing-library/react | 5.0.3 / 30.1.2 / 16.3.3 |
| playwright (browser-check script) | 1.63.0 |
| eslint / eslint-config-next | 9.39.5 / 16.4.0 |

### Infrastructure [V/R `infra/docker-compose.dev.yml`]

| Component | Image / version |
| --- | --- |
| PostgreSQL | `pgvector/pgvector:pg18` → PostgreSQL 18.6 (aarch64) [V `select version()`] |
| pgvector extension | 0.8.7 [V `pg_extension`] |
| Redis | `redis:8-alpine` → Redis server 8.10.2 [V] |
| CI | GitHub Actions (`.github/workflows/ci.yml`), Dependabot (`.github/dependabot.yml`) |

### ML model [R `apps/api/src/lookalike/ml/fashion_clip.py`; V cached `config.json`]

- `patrickjohncyh/fashion-clip`, revision pinned to `7e3ba62ce16b379a1ab479346b66f192e76f51b7`, loaded with `CLIPModel.from_pretrained(..., use_safetensors=True)`.
- Cached `config.json` [V]: `model_type: clip`, `projection_dim: 512`, vision `hidden_size 768 / patch_size 32 / image_size 224 / 12 layers`,
  text `hidden_size 512 / 12 layers / max_position_embeddings 77`. (Patch 32 + 224 px + 12 layers is a ViT‑B/32 geometry; the code docstring also says "ViT-B/32".)

---

## 3. Project structure

Tracked files at HEAD: 141 [V `git ls-files | wc -l`]. Top level [V `ls`, `git ls-files`]:

| Path | Role |
| --- | --- |
| `CLAUDE.md` | Project rules for the AI coding assistant (phase workflow, stack, gotchas). |
| `docs/` | `SPEC.md` (product/tech spec), `search-api.md` (API + measured latency), `ml-pipeline.md` (data/ML decisions + measurements), `frontend.md` (Phase 4), `screenshots/` (14 images), `openapi.json` (generated, git-ignored). |
| `infra/docker-compose.dev.yml` | Postgres+pgvector and Redis for development only. |
| `scripts/` | `ingest.py` (entry to ingestion CLI), `check_recall.py`, `measure_latency.py`, `measure_api_latency.py`, `benchmark_ml.py`. |
| `Makefile` | Single entry point for install/infra/migrate/api/web/ingest/lint/test/etc. |
| `.env.example` | All environment variables (real `.env` is git-ignored). |
| `data/media/` | Generated WebP thumbnails (git-ignored): 83,770 files, 1.3 GB [V `find`, `du`]. |
| `apps/api/src/lookalike/` | Backend package (3,764 lines of Python in `src`) [V `wc -l`]. |
| `apps/api/migrations/` | Alembic: 2 revisions. |
| `apps/api/tests/` | 24 test modules. |
| `apps/web/src/` | Next.js app (~4.8k lines TS/TSX excluding generated `schema.d.ts` and `components/ui`) [V `wc -l`]. |

Backend package layout [R] (layering rule from `CLAUDE.md`: routes → services → repositories → models):

| Module | Role |
| --- | --- |
| `main.py` | `create_app()`; lifespan loads the model, warms up, wires Redis/DB/cache/classifier; middleware; mounts `/media`. |
| `api/routes/health.py`, `api/v1/{search,products,catalog,router}.py` | HTTP layer (no business logic). |
| `core/` | `config.py` (pydantic-settings), `deps.py` (DI), `errors.py` (RFC 7807), `logging.py` (structlog JSON), `rate_limit.py` (Redis fixed window), `request_context.py` (request IDs/access log), `uploads.py` (upload hardening), `static.py`, `slug.py`. |
| `services/` | `search.py` (search orchestration), `catalog.py`, `cache.py` (Redis caches), `health.py`, `mappers.py`. |
| `repositories/` | `products.py` (vector search, listing), `categories.py`, `health.py`. |
| `models/` | SQLAlchemy ORM: `Product`, `Category`, `TimestampMixin`. |
| `schemas/` | Pydantic DTOs: `product.py`, `search.py`, `catalog.py`, `health.py`, `problem.py`. |
| `ml/` | `embeddings.py` (EmbeddingService protocol), `fashion_clip.py` (implementation), `preprocess.py` (shared image prep), `classifier.py` (localizer + zero-shot classifier). |
| `ingestion/` | `cleaning.py`, `images.py`, `pricing.py`, `pipeline.py`, `embedding_store.py`, `cli.py`. |
| `storage.py` | `Storage` protocol + `LocalStorage`. |
| `evaluation.py` | Helpers shared by the recall/latency scripts. |
| `openapi.py` | Writes the OpenAPI schema to a file. |

Frontend layout [R]: `src/app` (routes), `src/features/{catalog,search,home,health}`, `src/components` (+ `ui/` shadcn primitives),
`src/lib` (`api/` client+errors+generated types, `env.ts`, `image-loader.ts`, `site.ts`), `src/test` (setup, fixtures), `scripts/browser-check.mjs`.

---

## 4. Architecture

```
Browser (Next.js client components, React Query, Zustand)
   │  multipart/JSON over HTTP, CORS (credentials allowed, origin from CORS_ORIGINS)
   ▼
Next.js server (App Router, Server Components)  ──fetch (API_INTERNAL_URL or NEXT_PUBLIC_API_URL)──┐
                                                                                                    ▼
                                                        FastAPI (uvicorn)  /api/v1/*, /healthz, /readyz, /media/*
                                                          ├─ middleware: CORS → RequestContext → BodySizeLimit
                                                          ├─ services → repositories → PostgreSQL 18 + pgvector (asyncpg)
                                                          ├─ Redis (rate limits, text-embedding / similar / filters caches)
                                                          ├─ FashionCLIP (PyTorch; 1 dedicated worker thread; CPU/MPS/CUDA)
                                                          └─ LocalStorage: data/media/*.webp served by StaticFiles at /media
```

Facts behind the diagram:

- **Client → API**: browser calls the API directly at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) for image/hybrid search and header
  suggestions; product images are loaded straight from the API's `/media` URL [R `apps/web/src/lib/api/client.ts`, `features/search/search-api.ts`, `lib/image-loader.ts`].
- **Next.js server → API**: Server Components call the API with a typed `openapi-fetch` client; on the server `API_INTERNAL_URL` takes precedence if set [R `lib/api/client.ts`].
  Next fetch-cache lifetimes: catalog filters 600 s, product listing 60 s, single product 60 s, similar products 300 s [R `features/catalog/api.ts`].
- **Model**: loaded once in the FastAPI lifespan (`main.py::_load_embedder` in a thread), warmed up with one image + one text inference. All inference runs on a
  single-worker `ThreadPoolExecutor` named `embedder` (`fashion_clip.py`) so the event loop never blocks and MPS is never driven from several threads [R].
  `/readyz` returns 503 until database, Redis **and** model checks pass [R `services/health.py`; V live: `{"status":"ok","checks":{"database":"ok","redis":"ok","model":"ok"}}`].
- **Database**: PostgreSQL via SQLAlchemy 2 async + asyncpg, `pool_pre_ping=True`; one transaction per query; connections are not held during decoding or inference [R `db/engine.py`, `services/search.py`].
- **Storage**: `LocalStorage` writes atomically (temp file + `os.replace`), rejects path traversal; served by `MediaFiles(StaticFiles)` with `Cache-Control: public, max-age=86400`.
  An S3-compatible backend is **NOT FOUND** (the docstring in `storage.py` says it is "added with deployment").
- **Uploaded search images are never persisted**: kept in memory (`MultiPartParser.spool_max_size = max_upload_bytes + 1`), decoded, embedded, discarded;
  logs contain only `kind/results/total_ms/cached` [R `main.py`, `services/search.py`; test `test_uploads_stay_in_memory` passes [V]].
- **Error format**: RFC 7807 `application/problem+json` with `request_id`; stable `type` URNs: `urn:lookalike:problem:{product-not-found, rate-limited, upload-too-large, unsupported-media-type, invalid-image}` [R].
- **Logging**: structlog JSON (or console if `LOG_JSON=false`), one access line per request with `request_id`; `X-Request-ID` echoed (inbound accepted only if `[A-Za-z0-9._-]{8,64}`) [R].

---

## 5. Backend

Source of truth for the list: live `GET /api/v1/openapi.json` [V] plus route files [R]. Prefix `/api/v1` (`Settings.api_v1_prefix`); health probes are unversioned.
Docs UI at `/api/v1/docs`; `redoc` disabled.

### Authentication

**NOT FOUND.** No auth, no users table, no tokens, cookies, password hashing or protected routes exist in `apps/api/src` or `apps/web/src`
(grep for jwt/argon/bcrypt/oauth/bearer/login/cookie/stripe/cart returned only unrelated hits [V]). The OpenAPI schema has no `securitySchemes` [V].
`docs/SPEC.md` §1 plans JWT + refresh cookie + argon2, but this is not implemented. CORS is configured with `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`, `allow_origins=CORS_ORIGINS` [R `main.py`].

### Endpoints

| Method + path | Purpose | Rate-limit bucket | Error responses declared [V OpenAPI] |
| --- | --- | --- | --- |
| `GET /healthz` | Liveness (`{"status":"ok"}`) | none | |
| `GET /readyz` | Readiness: DB, Redis, model → `{"status":"ok","checks":{database,redis,model: "ok"\|"fail"}}`; 503 problem with `checks` extension on failure | none | 503 |
| `POST /api/v1/search/image` | Photo → similar products | `image` 20/60 s | 413, 415, 422, 429 |
| `POST /api/v1/search/text` | Text → products | `text` 60/60 s | 422, 429 |
| `POST /api/v1/search/hybrid` | Photo + text refinement | `image` 20/60 s (shared with `/image`) | 413, 415, 422, 429 |
| `GET /api/v1/products` | Listing with filters/sort/pagination/full-text | none | 422 |
| `GET /api/v1/products/{product_id}` | One product | none | 404, 422 |
| `GET /api/v1/products/{product_id}/similar` | Neighbours from the stored embedding (no inference) | `similar` 120/60 s | 404, 422 (429 is raised at runtime but not declared; see note) |
| `GET /api/v1/catalog/filters` | Category tree + option lists + price range | none | |
| `GET /media/{key}` | Static thumbnails (mounted app, not in OpenAPI) | none | |

Note: the OpenAPI listing shows `similar` with responses `200/404/422` [V]; the 429 is raised by the rate-limit dependency at runtime [R `core/rate_limit.py`] but not declared in `products.py`'s `responses`.
Rate limit mechanics [R `core/rate_limit.py`]: fixed window, Lua `INCR`+`EXPIRE` in Redis, key `rl:{name}:{client_ip}`, headers `X-RateLimit-Limit/Remaining/Reset` (seen live on a text search: `limit 60, remaining 59, reset 60` [V]),
429 adds `Retry-After`. Redis failure → request allowed (warning logged). `X-Forwarded-For` honoured only if `TRUST_PROXY_HEADERS=true`.

### Request fields

**Shared filters** (`schemas/product.py::FilterParams`; query string for GET, form fields for multipart, `filters` object in JSON): `gender[]`, `master_category[]`, `sub_category[]`,
`article_type[]`, `color[]` (matches `base_colour`), `season[]`, `usage[]` (each list ≤ 12 values, each value 1–100 chars), `min_price`, `max_price` (integer **cents**, 0–10,000,000, `min_price ≤ max_price` or 422), `in_stock` (bool, default false).

| Endpoint | Body / params |
| --- | --- |
| `POST /search/image` (multipart) | `file` (required; JPEG/PNG/WebP, ≤ 8 MiB), `limit` (1–60, default 24 = `SEARCH_DEFAULT_LIMIT`), + shared filters |
| `POST /search/text` (JSON) | `query` (string, stripped, 1–200 chars), `limit` (1–60), `filters` (object of shared filters) |
| `POST /search/hybrid` (multipart) | as `/image` plus `query` (1–200, required), `text_weight` (0–1, default `HYBRID_TEXT_WEIGHT` = 0.65) |
| `GET /products` | shared filters + `q` (1–200), `sort` ∈ `newest\|price_asc\|price_desc\|relevance` (default `relevance` if `q` else `newest`; `relevance` without `q` → 422), `page` (1–10,000), `page_size` (1–60, default 24). `extra="forbid"`: unknown params → 422. |
| `GET /products/{id}` | `product_id` int 1…2⁶³−1 |
| `GET /products/{id}/similar` | shared filters + `limit` (1–60; **default 12** = `SIMILAR_DEFAULT_LIMIT` in `services/search.py`). `extra="forbid"`. |
| `GET /catalog/filters` | none |

### Response fields

- **Product (`ProductOut`)**: `id, slug, name, gender, master_category, sub_category, article_type, base_colour|null, season|null, usage|null, year|null, price_cents, currency, in_stock (bool), image{thumb_400, thumb_800, blur_data_url|null}`. Exact stock quantity is not exposed.
- **Search response (`SearchResponse`)** for all four search endpoints: `results[{product, similarity}]`, `detected[{article_type, category_path, score}]` (filled for image/hybrid only), `timings{decode_ms|null, embed_ms|null, db_ms, total_ms}`, `cached` (bool).
  `similarity` = cosine similarity rounded to 4 decimals and clamped to [−1, 1].
- **`GET /products`** → `ProductPage{items[], total, page, page_size, pages}`; page beyond the end → empty `items`, not an error.
- **`GET /catalog/filters`** → `CatalogFilters{categories[tree: id,name,slug,path,level,children], genders[], colors[], seasons[], usages[], price_range{min_cents,max_cents}}`.
- **Errors** → `ProblemDetail{type, title, status, detail?, instance, request_id, errors?[{loc,msg,type}]}` + extensions (e.g. `max_bytes`, `allowed`, `checks`). Validation errors deliberately omit the offending input.

Real responses captured live [V]:

```
POST /api/v1/search/text {"query":"red floral dress","limit":3}
  → 0.3414 id 33349 "Remanika Women Red Dress"       Dresses Red     7999
    0.339  id 35129 "French Connection Women Red Dress" Dresses Red   4499
    0.3289 id 31935 "French Connection Women Orange Dress" Dresses Orange 11499
  timings {decode_ms: null, embed_ms: 261.61, db_ms: 37.38, total_ms: 299.0}, cached false, detected []
GET /api/v1/products/41885/similar?limit=3 → ids/similarities [(31318, 0.8903), (35888, 0.8702), (31340, 0.8628)], total_ms 26.73
GET /api/v1/products?sort=relevance → 422 {"title":"Invalid sort","detail":"Sorting by relevance needs a search term (q).",...}
```

(The 261 ms first text embedding is a cold call on the running dev server; steady-state numbers are in §11.)

### Upload hardening [R `core/uploads.py`, `ml/preprocess.py`; behaviour covered by `tests/test_upload_hardening.py` (26 tests, pass [V])]

Order: `BodySizeLimitMiddleware` (Content-Length > 8 MiB + 64 KiB → 413 before reading; streamed bytes counted too) → declared content type must be JPEG/PNG/WebP (else 415) →
file ≤ 8 MiB, non-empty → real format from magic bytes via Pillow `formats=("JPEG","PNG","WEBP")` (else 422) → pixel count ≤ 25,000,000 read from the header before decoding → first frame only,
EXIF orientation applied, EXIF/ICC/comments dropped. SVG/GIF/BMP/HTML labelled as JPEG are rejected (test names).

---

## 6. Image-based recommendation pipeline

End to end for `POST /api/v1/search/image` (hybrid differs only where marked). All steps [R] unless tagged.

### 0. In the browser (`apps/web/src/features/search/`)

1. Input sources: file picker, drag-and-drop (whole page), clipboard paste, `<input capture="environment">` on touch devices (`(pointer: coarse)`), `getUserMedia` dialog on desktop (`image-dropzone.tsx`, `camera-dialog.tsx`, `use-image-input.ts`).
2. `normalizeImage` (`normalize-image.ts`): rejects non-images and > 40 MiB; decodes with `createImageBitmap(..., {imageOrientation:"from-image"})`; **HEIC/HEIF** falls back to `heic-to` (lazy WASM import);
   downscales to **1600 px long edge**, fills a white background, re-encodes **JPEG quality 0.9**, names it `photo.jpg`.
3. State: photo held only in the Zustand store (object URL revoked on replace/remove). TanStack Query key: `["image-search", imageId, debouncedFilters(400 ms), articleType, refinement]`, `staleTime: Infinity`, `retry: false`.
4. Request: `multipart/form-data` `POST {API}/api/v1/search/image` (or `/hybrid` when the refinement text is non-empty) with `file`, repeated filter fields, optional `article_type` (user override), `query`, and `limit=24`.

### 1. API entry

5. Middleware order (outermost first): CORS → `RequestContextMiddleware` → `BodySizeLimitMiddleware` (`main.py`).
6. Route `search.py::search_by_image` has `dependencies=[Depends(rate_limit("image"))]`, then `read_image_upload` (type/size checks above).

### 2. Decode and preprocess (`services/search.py::_embed_upload`, `ml/preprocess.py`)

7. `load_image(data, min_side=800, formats=JPEG/PNG/WEBP, max_pixels=25e6)` in `asyncio.to_thread`. For JPEG, Pillow `draft()` may decode at 1/2, 1/4, 1/8 scale while both sides stay ≥ 800 px.
   Then EXIF transpose → RGB (alpha composited on white `(255,255,255)`) → metadata stripped.
8. Garment localisation: `WholeImageLocalizer.locate()` returns the whole image (no detector; `GarmentLocalizer` is the plug-in interface).
9. `to_clip_array(image, mode="pad")` (`EMBEDDING_RESIZE_MODE`, default `pad`): scale the **longest side to 224 px** (bicubic), paste centred on a white 224×224 canvas → `uint8 (224,224,3)`. (`crop` mode = stock CLIP: shortest side to 224 + centre crop.)
   Ingestion uses the **same function**, so catalogue and query vectors share preprocessing.

### 3. Feature extraction (`ml/fashion_clip.py::embed_arrays`)

10. Pixels → float, `/255`, normalised with CLIP mean `(0.48145466, 0.4578275, 0.40821073)` and std `(0.26862954, 0.26130258, 0.27577711)`.
11. `CLIPModel.get_image_features(...)` (FashionCLIP vision tower + projection) → **512-dim** vector (`DIMENSION = 512`), then **L2-normalised in fp32**. Default fp32 (`EMBEDDING_FP16=false`), device `auto` = CUDA → MPS → CPU.
    Embedding version string stored/used everywhere: `fashion-clip@7e3ba62c/pad` (model revision[:8] + resize mode).

### 4. Category detection (suggestion only) (`ml/classifier.py`)

12. `ZeroShotCategoryClassifier`: for every distinct article-type name that has active products (de-duplicated by name; **107** labels in this DB [V: 107 distinct `article_type`]), embed the prompt `"a photo of {name.lower()}"` once at start-up (lazy, retried on failure).
13. `logits = logit_scale × (label_embeddings @ image_embedding)`, `softmax`, top **3** (`DETECTED_CATEGORIES=3`) → `detected[{article_type, category_path, score}]`. `logit_scale` is the model's learned value (`exp(model.logit_scale)`; the class default is 100.0 until `load()` replaces it).
    The result is **returned, not applied**; the UI's override is sent back as `article_type` on the next request.

### 5. (Hybrid only) text fusion (`services/search.py::search_hybrid`, `_combine`)

14. Text embedding: tokenizer `max_length=77`, `get_text_features`, L2-normalised; cached in Redis (key `emb:txt:{embedding_version}:{sha256(lowercased, whitespace-normalised query)}`, TTL 24 h).
15. `query_vector = normalize((1 − w)·image + w·text)`, default **w = 0.65** (`HYBRID_TEXT_WEIGHT`), overridable per request (`text_weight` 0–1). If the sum's norm < 1e-6 it falls back to the image vector.
    `w` was chosen from a measurement table in `docs/search-api.md` [D] (colour match vs. article-type retained, 24 blue products); I did not re-run that experiment, and no script for it exists in `scripts/` (**NOT FOUND**).

### 6. Similarity search (`repositories/products.py::search_similar`)

16. SQL (SQLAlchemy): `SELECT product, embedding <=> :q AS distance FROM products WHERE <filters> ORDER BY distance LIMIT :limit` using pgvector `cosine_distance` on the **HNSW** index `ix_products_embedding_hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=128)`.
17. Per-transaction settings via `set_config(..., true)`: `hnsw.ef_search = 200` (`DEFAULT_EF_SEARCH`; clamped to ≤ 300 because at ≥ ~400 the planner flips to a sequential scan [D]),
    `hnsw.iterative_scan = relaxed_order`, `hnsw.max_scan_tuples = 20000` (`MAX_SCAN_TUPLES`).
18. Filters in `WHERE`: `is_active = true` always; `IN` lists for gender / master / sub / article type / colour / season / usage; `price_cents` range; `stock_quantity > 0` for `in_stock`.
19. **Similarity** = `1 − cosine_distance` (embeddings are unit vectors, so this is the dot product). `relaxed_order` can return rows slightly out of order, so hits are **re-sorted descending in Python**.

### 7. Ranking and output

20. **Ranking = cosine similarity descending, nothing else.** No re-ranking model, no popularity/price/stock boost, and **no similarity threshold or cut-off** anywhere in API or UI logic (grep for threshold/cutoff/rerank found nothing [V]).
    Result count = `limit` (default 24, max 60). The "similar products" endpoint excludes the product itself (`exclude_id`) and defaults to 12.
21. Response includes `timings` (`decode_ms`, `embed_ms`, `db_ms`, `total_ms`). For "similar products" the result list is cached in Redis for 300 s (key `sim:{version}:{id}:{limit}:{filters-hash}`).
22. UI: each hit shows `"{round(similarity×100)}% match"` clamped to 0–100 (`similarity-badge.tsx`); the badge turns the brand colour at ≥ 85 % (display only).

### Key parameters (one place)

| Parameter | Value | Source |
| --- | --- | --- |
| Embedding dimension | 512, L2-normalised | `fashion_clip.py` `DIMENSION`; DB column `vector(512)` [V `\d products`] |
| CLIP input | 224×224, pad-to-square on white | `preprocess.py` `CLIP_SIZE`, `BACKGROUND` |
| Distance / index | cosine, HNSW `m=16`, `ef_construction=128` | `models/product.py`; [V] live index definition |
| `hnsw.ef_search` | 200 (max 300) | `repositories/products.py` |
| Iterative scan | `relaxed_order`, `max_scan_tuples=20000` | same |
| Top-k | default 24 (search), 12 (similar), max 60 | `config.py`, `schemas/search.py`, `services/search.py` |
| Zero-shot categories returned | 3 | `DETECTED_CATEGORIES` |
| Hybrid text weight | 0.65 | `HYBRID_TEXT_WEIGHT` |
| Similarity threshold | **NOT FOUND** (none) | grep [V] |
| Upload limits | 8 MiB, 25 MP | `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_PIXELS` |
| JPEG draft decode | min side 800 | `DECODE_MIN_SIDE` |

---

## 7. Dataset

- **Source** [R `docs/SPEC.md` §2, `ingestion/cleaning.py`; V on disk]: Kaggle "Fashion Product Images Dataset" in `DATASET_DIR=/Users/iluminimal/Datasets/fashion` (path from the local, git-ignored `.env`).
  Contents [V `ls`]: `styles.csv`, `images/`, `images.csv` (filename→URL), `styles/` (44,446 per-product JSON files). The code reads **only** `styles.csv` and `images/{id}.jpg`
  (grep for `images.csv`/`styles/` in `ingestion/` found nothing [V]).
- **Size [V]**: `styles.csv` = 44,446 records (`wc -l` 44,447 incl. header); `images/` holds 44,441 files; the sampled images are all **1800×2400** JPEG (10 sampled [V]).
- **CSV columns used** [R]: `id, gender, masterCategory, subCategory, articleType, baseColour, season, year, usage, productDisplayName` (required: first six minus colour; optional: `baseColour, season, year, usage`).
- **Preprocessing / cleaning** (`ingestion/cleaning.py`; running `load_catalog` myself produced [V]):

  ```
  styles.csv records: 44446
  kept: 41885
  dropped (malformed_row): 22
  dropped (missing_image): 5
  dropped (out_of_scope_category): 2534
  ```

  Rules: `pd.read_csv(on_bad_lines="skip")`; whitespace collapsed; required fields present; numeric unique `id`; gender ∈ {Men, Women, Boys, Girls, Unisex} (title-cased);
  `masterCategory` ∈ {Apparel, Footwear, Accessories} (default scope; dropped: Personal Care 2,403, Free Items 105, Sporting Goods 25, Home 1 [V raw counts]); image file exists and is non-empty; `year` kept only in 1990–2100.
- **Result [V DB]**: **41,885 products**, **107 distinct article types** (the "143 article types" in `docs/ml-pipeline.md` is the raw CSV count [V: raw `articleType` nunique = 143]; after scoping it is 107),
  3 master categories (Apparel 21,392 / Accessories 11,274 / Footwear 9,219), 5 genders (Men 21,510, Women 16,779, Unisex 2,111, Boys 830, Girls 655), 47 distinct `base_colour` values, `year` 2007–2018 (41,884 non-null), season: Summer 21,377 / Fall 11,419 / Winter 8,456 / Spring 612 / 21 NULL.
- **Images** [R `ingestion/images.py`; V counts]: per product WebP at 400 px and 800 px (longest side, never upscaled, LANCZOS, quality 80, `method=2`), key `products/{id//1000:03d}/{source_id}_{400|800}.webp`,
  plus a 12-px-side blur placeholder (WebP q40, base64 data URL) → 83,770 files / 1.3 GB [V]; every product has a `blur_data_url` [V: 0 NULL].
- **Synthetic fields** [R `ingestion/pricing.py`; V stats]: the dataset has **no prices or stock**; both are generated deterministically from `sha256(f"{seed}:{source_id}")` (seed `20240607`, currency USD):
  base price by article type → sub category → master category, × lognormal-like factor `exp(N(0, 0.35))` clamped [0.4, 3.0], min $5, price ends in `.99` (`dollars*100 − 1`);
  8 % chance of stock 0, otherwise `1 + exponential(mean 25)` capped at 120. Result in DB [V]: price 499–35,999 cents, mean $50.96, median $40.99; 3,334 of 41,885 products out of stock.
- **Embeddings** [V]: all 41,885 rows have `embedding_version = fashion-clip@7e3ba62c/pad` (1 distinct value).
- **Not in the repo**: the dataset images and `styles.csv` (git-ignored by design; `/data/` ignored; `CLAUDE.md`). Product slugs are `slugify(name) + "-" + source_id`.
- Documented dataset quirk [D `docs/search-api.md`]: a few photos are listed under two products (near-duplicates tie at the top of a self-search). The recall run in §11 confirms 17/1000 ties [V].

### Ingestion process [R `ingestion/pipeline.py`, `ingestion/cli.py`]

Idempotent and resumable: the DB is the only state; a product is "done" when its row has the current `embedding_version` and both thumbnails exist. Image decode runs in a `spawn` process pool (default 3 workers), embeddings in batches (default 64),
rows are upserted by `source_id` (`ON CONFLICT DO UPDATE`, keeping `price_cents`, `currency`, `stock_quantity`, `is_active`). `embed` sub-command writes parquet shards (every 2,048 products) so embedding can run elsewhere (Colab); `--import-embeddings` refuses a different model/preprocessing version, NaN/Inf, or non-normalised vectors.
Tests cover local export→import equality [V `test_export_then_import_matches_direct_embedding` passes]; a run on Colab itself is **NOT FOUND** (not verifiable from the repo).

---

## 8. Database / storage

PostgreSQL 18.6 + pgvector 0.8.7 [V]. Alembic head: `a1f3891fa86e` [V `alembic_version`]; revisions: `a6a98544cd4c` (enable `vector` extension), `a1f3891fa86e` (products + categories) [R].
Tables in the public schema [V `pg_tables`]: `alembic_version`, `categories`, `products` — **only these two domain tables exist**. (`users, addresses, carts, cart_items, orders, order_items, payments, wishlist_items, reviews, search_logs` from SPEC §3: **NOT FOUND** in models or migrations.)

### `categories` (152 rows: 3 at level 1, 31 at level 2, 118 at level 3 [V]) [R `models/category.py`, `\d categories` V]

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | sequence |
| `parent_id` | integer NULL | FK → `categories.id` ON DELETE RESTRICT; index `ix_categories_parent_id` |
| `level` | smallint | CHECK 1–3 (master > sub > article type) |
| `name`, `slug` | varchar(100), varchar(120) | |
| `path` | varchar(400) | UNIQUE, e.g. `apparel/topwear/shirts` |
| `created_at`, `updated_at` | timestamptz | default `now()` |

Level-3 rows are 118 but only 107 distinct names: 11 article-type names exist under two parents (e.g. Dresses, Shorts, Tshirts, Sandals, Wallets) [V query]. Every level-3 category has products [V: 0 empty].

### `products` (41,885 rows; table + indexes 247 MB, HNSW index 107 MB [V]) [R `models/product.py`, V `\d products`]

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | identity (by default) |
| `source_id` | integer NULL | UNIQUE; Kaggle id, ingestion idempotency key |
| `slug` | varchar(200) | UNIQUE |
| `name` | varchar(300) | |
| `category_id` | integer | FK → `categories.id` ON DELETE RESTRICT; index |
| `gender`, `master_category`, `sub_category`, `article_type` | varchar | **denormalised** deliberately so filtered vector search needs no join |
| `base_colour`, `season`, `usage` | varchar NULL | `base_colour`, `season`, `usage` have btree indexes |
| `year` | smallint NULL | |
| `price_cents` | integer | CHECK ≥ 0; btree index |
| `currency` | varchar(3) | default `'USD'`, CHECK length = 3 |
| `stock_quantity` | integer | default 0, CHECK ≥ 0 |
| `is_active` | boolean | default true |
| `image_key` | varchar(200) | storage key prefix |
| `blur_data_url` | text NULL | |
| `embedding` | `vector(512)` | HNSW index `ix_products_embedding_hnsw` (`vector_cosine_ops`, m=16, ef_construction=128) |
| `embedding_version` | varchar(100) | which model+preprocessing produced `embedding` |
| `search_vector` | tsvector | `GENERATED ALWAYS AS (to_tsvector('english', name)) STORED`; GIN index |
| `created_at`, `updated_at` | timestamptz | default `now()`; btree index on `created_at` (used for "newest") |

Relations: `products.category_id → categories.id` (leaf = article type); `categories.parent_id → categories.id` (tree). Constraint names follow a fixed naming convention (`db/base.py`). Migration apply/rollback/re-apply is tested (`test_migrations_apply_roll_back_and_reapply` passes [V]) and run in CI.

### Other storage

- **Redis** [R `services/cache.py`, `core/rate_limit.py`]: keys `rl:{name}:{ip}` (rate limits), `emb:txt:{version}:{sha256}` (text embedding, 2 KB float32, TTL 24 h), `sim:{version}:{product_id}:{limit}:{filters16}` (similar results, TTL 300 s), `catalog:filters:{version}` (TTL 600 s). All cache ops have a 0.5 s timeout and degrade to a cache miss.
- **Files**: `data/media/products/NNN/{source_id}_{400,800}.webp` (git-ignored).
- **Browser**: nothing persisted except the theme preference (`next-themes`); the search photo is memory-only [R `search-store.ts`].

---

## 9. Frontend

Next.js 16 App Router, Server Components by default; client components only for interaction [R]. Root layout: skip link, header (logo, nav, search bar, theme toggle, mobile nav), `<main id="main">`, footer; fonts Geist/Geist Mono via `next/font`; `Providers` = next-themes (class strategy, default `system`) + TanStack QueryClient (`staleTime 30 s`, no refetch on focus).

### Pages [R `apps/web/src/app`]

| Route | Rendering | Content |
| --- | --- | --- |
| `/` | `force-dynamic` | Hero with upload drop zone (hands the photo to `/search`), "Shop by department" (Women, Men, Footwear, Accessories tiles; image = newest in-stock product), "New arrivals" rail (`sort=newest`, `in_stock`, 12 items). The hero text says "Visual search for fashion". |
| `/products` | per request (reads `searchParams`) | Listing: sidebar filters (desktop) / sheet (mobile), sort select, active-filter chips, pagination links, empty state; 24 per page; `generateMetadata` with canonical URL; `noindex` for text queries and pages > 1. |
| `/products/[id]/[[...slug]]` | per request | Gallery, price, stock state, size selector (UI only), breadcrumbs (gender → master category → article type), detail list, "You may also like" rail from `/products/{id}/similar` (12), OpenGraph/Twitter metadata, JSON-LD (`Product`+`Offer`, `BreadcrumbList`, `<` escaped to `<`). Wrong/missing slug → 308 redirect to `/products/{id}/{slug}`; unknown id → 404. |
| `/search` | `force-dynamic` | Visual search page (client component `SearchView`): drop zone → preview + "Detected: …" chip (popover to override, any article type), refine-with-words form, filter chips + sheet, results grid with "NN% match" badge, skeletons, error/empty states, `aria-live` status with `total_ms`. |
| `error.tsx`, `not-found.tsx` | | Error boundary and 404. |

### Main user flows

1. **Visual search**: Home hero or `/search` → pick/drop/paste/capture photo → normalise (HEIC→JPEG, ≤1600 px) → automatic search → grid of matches; change filters (debounced 400 ms), override the detected category (sent as `article_type`), or add words (switches to `/search/hybrid`); results are cached per (photo, filters, category, text) so reverting a filter costs no request.
2. **Browse**: header nav / department tiles → `/products` with URL-synced filters (`gender, master_category, sub_category, article_type, color, season, usage, min_price, max_price, in_stock, q, sort, page`); URL is the single source of truth, malformed values are dropped (`parseListingQuery`), chips and pagination are plain links.
3. **Text search**: header search bar, debounced 250 ms, ≥ 2 chars → suggestions from `GET /products?q=…&sort=relevance&page_size=5`; Enter → `/products?q=…`.
4. **Product page**: from any card → detail → similar rail → "Find more like this with a photo" links to `/search`.
5. No cart/wishlist/checkout/login/account flows exist (**NOT FOUND**); size selector is display-only and sizes are hard-coded per category (`catalog/sizes.ts`).

### State management

| Kind | Mechanism |
| --- | --- |
| Listing filters/sort/page | URL query string (`features/catalog/filters.ts`; changes via `router.replace` in a transition) |
| Visual-search session (photo, filters, category override, refinement) | Zustand store `features/search/search-store.ts` (in memory only) |
| Search results, header suggestions | TanStack Query (`["image-search", …]`, `["suggest", q]`) |
| Server-fetched catalogue data | Next fetch cache (`revalidate`) + React `cache()` |
| Refine form | React Hook Form + Zod (max 200 chars) |
| Theme | next-themes |

### How it calls the backend

- Typed client generated from OpenAPI: `npm run api:types` → `src/lib/api/schema.d.ts` (`openapi-typescript`) used with `openapi-fetch` (`src/lib/api/client.ts`); server base URL `API_INTERNAL_URL` else `NEXT_PUBLIC_API_URL` (validated with Zod in `lib/env.ts`, default `http://localhost:8000`).
- The two upload endpoints are called with plain `fetch` + `FormData` (`search-api.ts`) because they are multipart.
- Errors: `lib/api/errors.ts` parses problem+json into `ApiError`; `userMessage()` maps 429/413/415/422/404/5xx/network to plain-language messages; aborts are rethrown.
- Images: `next/image` with a custom loader (`images.loader: "custom"`) that maps requested width → the API's `_400.webp` / `_800.webp` (no Next image optimizer).
- `features/health` (`fetchReadiness` against `/readyz`) exists with tests but is not used by any page [V].

### Browser-level checks [V, run by me in this session]

`node scripts/browser-check.mjs <scratch dir>` against the live app (web :3000, API :8000), headless Chromium, mobile 390 px and desktop 1440 px, light/dark:

```
26/26 checks passed
```

(includes: the product's own photo ranks first with a match badge; override sends `article_type`; refinement uses `/search/hybrid`; paste / drop / fake-camera / real HEIC (converted to `photo.jpg`) each start a search; a non-image is rejected with a message; filters/sort/page land in the URL; product JSON-LD parses; no console errors.)
This script is **not** part of `npm test` or CI. A Playwright e2e suite for checkout/login: **NOT FOUND**.

---

## 10. Tests

All commands were run by me on 2026-10-08 [V].

### Backend (`apps/api/tests`): pytest 9.1.1, `asyncio_mode=auto`

Default run (`uv run pytest`; `addopts = -m 'not model'`), real output tail:

```
collected 214 items / 14 deselected / 200 selected
...
===================== 200 passed, 14 deselected in 30.77s ======================
```

Model-marked run (`uv run pytest -m model`; loads real FashionCLIP and uses the real ingested catalogue + dataset photos):

```
collected 214 items / 200 deselected / 14 selected
tests/test_fashion_clip_model.py .........
tests/test_search_model.py .....
===================== 14 passed, 200 deselected in 29.82s ======================
```

Static checks [V]: `ruff check` → "All checks passed!"; `ruff format --check` → "95 files already formatted"; `mypy` (strict) → "Success: no issues found in 95 source files".

Integration tests need the dev Postgres + Redis (they fail, not skip, if unreachable) and use a throwaway `lookalike_test` database (README) [D].

| File | Tests | Covers |
| --- | --- | --- |
| `test_classifier.py` | 8 | zero-shot ranking/softmax ordering, top-k, temperature effect, empty labels, label/embedding mismatch, prompt per label, lazy build + retry, whole-image localiser |
| `test_cleaning.py` | 11 | CSV cleaning: kept rows sorted, malformed rows, drop reasons (missing image, out-of-scope, invalid gender/id, missing field), empty image, duplicate ids, year range, missing columns |
| `test_config.py` | 2 | CORS origin splitting, invalid log level |
| `test_database.py` | 1 | pgvector installed with iterative-scan support |
| `test_embedding_store.py` | 6 | parquet shard round trip, version mismatch, non-normalised/NaN, shape, empty/corrupt, columns |
| `test_errors.py` | 4 | problem+json for 404, validation (no input echo), extensions, unhandled 500 without leakage |
| `test_fashion_clip_model.py` (model) | 9 | real model: 512-d unit vectors, determinism/batch independence, same-class closer, zero-shot text, JPEG-scale independence, fp16≈fp32, CPU≈accelerator, async off-loop + serialisation, requires load |
| `test_health_api.py` | 4 | `/readyz` OK and 503 per failing dependency / until model loaded |
| `test_health_service.py` | 5 | readiness logic |
| `test_images.py` | 18 | key sharding, WebP sizes/aspect, no upscaling, flags, corrupt/missing file, colour modes, transparency, EXIF, decompression bomb, draft decode, pad vs crop, blur size |
| `test_ingest_pipeline.py` | 11 | end-to-end ingest into Postgres with a fake embedder, re-run no-op, resume, crash keeps batches, thumbnail regeneration, re-embed keeps shop fields, unreadable images, worker processes, export→import, missing embeddings |
| `test_logging.py` | 1 | JSON access log with request id |
| `test_media.py` | 2 | static thumbnails + cache headers; missing media dir |
| `test_migrations.py` | 1 | apply / roll back / re-apply |
| `test_preprocess.py` | 10 | EXIF orientation, transparency, format allow-list, max pixels, first frame only, garbage input |
| `test_pricing.py` | 7 | determinism, seed dependence, order independence, `.99` prices, category effect, stock, fallback chain |
| `test_product_repository.py` | 8 | HNSW index params, constraints, self at rank 1, exclusion, filters, iterative scan returns full page, settings don't leak, ef_search clamp |
| `test_rate_limit.py` | 11 | parsing, limit/deny, separate counters, window expiry, concurrency exactness, dead Redis allows, 429 + Retry-After, independent endpoints, rejected uploads count, forwarded header trust, disable switch |
| `test_request_context.py` | 4 | request id generation/echo/replacement, CORS preflight |
| `test_search_api.py` | 42 | image/text/hybrid/similar/listing/product/filters endpoints: shape, rank-1 self, detection, filters, validation (parametrised), hybrid weights 0 and 1, pagination, sorting, FTS input, 404s |
| `test_search_cache.py` | 10 | text-embedding cache, TTL/version in key, corrupt entries, similar cache keys + expiry, Redis down, catalog-filters cache |
| `test_search_model.py` (model) | 5 | real model + catalogue: `/readyz` green, detected category matches photo (≥ n−1 per article type for 4 types), photos find themselves (similarity > 0.999), "red dress" text query (≥ 8/10 dress-like and ≥ 8/10 Red), hybrid "same t-shirt in red" raises red share by > 0.2 and keeps ≥ 12/24 Tshirts |
| `test_storage.py` | 8 | put/exists/url, atomic overwrite, unsafe keys rejected |
| `test_upload_hardening.py` | 26 | accepted formats, 415 types, spoofed files 422, empty/missing/non-multipart, 413 paths (declared, streamed, lying length), pixel limit, hybrid parity, in-memory uploads, EXIF |
| **Total** | **214** | 200 default + 14 model |

### Frontend (`apps/web/src/**/*.test.ts(x)`): Vitest 5.0.3 + jsdom + Testing Library

```
 RUN  v5.0.3 /Users/iluminimal/Documents/Diploma/lookalike/apps/web
 Test Files  16 passed (16)
      Tests  95 passed (95)
   Duration  4.06s
```

`npm run lint` (eslint) → no output (clean); `npm run typecheck` (`next typegen && tsc --noEmit`) → "✓ Types generated successfully", no errors. `npm run build` was not re-run in this task (the CI web job runs it).

| File | Tests | Covers |
| --- | --- | --- |
| `lib/api/errors.test.ts` | 7 | problem+json parsing, non-JSON body, user messages for upload/rate-limit/offline/5xx, no leaking, abort rethrow |
| `features/catalog/filters.test.ts` | 14 | tolerant URL parsing, defaults, repeated/duplicate/capped values, bad numbers, relevance-without-q, reversed price, round-trip, escaping, toggle, count, API mapping |
| `features/catalog/product.test.ts` | 9 | price format, canonical path, subtitle, sizes by category, JSON-LD (Product/Offer, OutOfStock, `<` escaping, breadcrumb links) |
| `features/catalog/filter-fields.test.tsx` | 6 | gender toggle, in-stock, colour swatches, category tree, group selection |
| `features/catalog/pagination.test.tsx` | 5 | page window, links keep filters, single page, active-filter chips |
| `features/catalog/size-selector.test.tsx` | 3 | radio-group semantics, keyboard, sold-out disabled |
| `features/search/normalize-image.test.ts` | 10 | fit-within, HEIC detection (type or extension), reject non-image/too large, JPEG output, native vs HEIC decoder, failure handling |
| `features/search/search-api.test.ts` | 7 | form building (repeated filters, cents, category/refinement), endpoint choice image vs hybrid, problem → `ApiError`, network error |
| `features/search/image-dropzone.test.tsx` | 6 | choose, drop, non-image message, paste (and text paste ignored), capture input |
| `features/search/detected-chip.test.tsx` | 5 | top guess, pick other detected, any category, override reset, hidden when empty |
| `features/search/search-view.test.tsx` | 9 | no request initially, auto-search + badges, skeletons, category override request, hybrid refine + cached revert, filter chip, error + retry, empty state, remove photo |
| `components/search-bar.test.tsx` | 4 | debounce + min chars, Enter navigation, keyboard suggestion, empty |
| `components/product-card.test.tsx` | 3 | link/price, sold-out flag, badge |
| `components/theme-toggle.test.tsx` | 1 | toggles `dark` class |
| `features/health/api.test.ts`, `api-status.test.tsx` | 4 + 2 | readiness parsing and the (unused) status component |
| **Total** | **95** | |

Not present: component tests for the listing page/product page themselves and Playwright e2e in CI (**NOT FOUND**); coverage reports (**NOT FOUND**, no coverage tool configured).

---

## 11. Evaluation

Scripts in `scripts/` [R], all run by me [V] on the Apple M1 (see header) against the real 41,885-product catalogue. Mind the caveats at the end of this section.

### 11.1 `scripts/check_recall.py`: self-retrieval sanity check

Each sampled product's own 1800×2400 JPEG is sent through the real decode→embed pipeline, then `search_similar` (HNSW, `ef_search=200`, k=10); compared with an exact sequential scan. Command: `uv run python ../../scripts/check_recall.py --n 1000 --device cpu` (seed 11 default):

```
queries: 1000  (ef_search=200, k=10, device=cpu, version=fashion-clip@7e3ba62c/pad)
rank-1 is self, strict:         983/1000 = 0.9830
rank-1 is self or tied (<= 0.0001): 1000/1000 = 1.0000   (17 tied with a near-duplicate)
self within top-5:              1000/1000 = 1.0000
HNSW recall@10 vs exact scan:  0.9985
exit=0
```

### 11.2 `scripts/measure_latency.py --device cpu`: component latency + HNSW parameter sweep

```
== image search, upload = original 1800x2400, 200 requests
decode (Pillow, draft)             p50     6.4  p95    11.7  p99    17.4  max    29.8 ms
embed batch=1 (cpu)                p50    41.3  p95    56.3  p99    81.0  max   109.2 ms
pgvector top-20, unfiltered        p50    11.4  p95    19.4  p99    27.6  max    29.9 ms
pgvector top-20, 5 filters         p50    22.3  p95    39.9  p99    69.5  max    85.8 ms
END TO END image search            p50    66.8  p95    85.7  p99   118.0  max   154.3 ms
   target p95 < 400 ms: PASS (86 ms)
== image search, upload = phone-style 1280px, 200 requests
END TO END image search            p50    62.1  p95    68.3  p99    70.4  max    74.9 ms   PASS (68 ms)
== similar products (stored embedding, k=12)
GET similar                        p50     8.0  p95    14.9  p99    18.4  max    38.9 ms   target p95 < 50 ms: PASS (15 ms)
== ef_search sweep: recall@10 vs exact scan, 150 stored-embedding queries
   ef_search=10   recall@10 0.9847   p50   3.1 ms  p95   6.7 ms
   ef_search=20   recall@10 0.9847   p50   7.3 ms  p95  11.2 ms
   ef_search=40   recall@10 0.9860   p50   9.1 ms  p95  12.6 ms
   ef_search=80   recall@10 0.9933   p50  11.0 ms  p95  14.4 ms
   ef_search=120  recall@10 0.9933   p50   8.8 ms  p95  14.9 ms
   ef_search=200  recall@10 1.0000   p50  10.5 ms  p95  13.5 ms
   ef_search=400  recall@10 1.0000   p50  10.9 ms  p95  14.3 ms
== filtered search (gender + article type + in stock): iterative scan on/off
   iterative_scan=off  recall@10 0.9993   rows returned vs expected 1.000   p50  10.0 ms  p95  18.6 ms
   iterative_scan=on   recall@10 0.9993   rows returned vs expected 1.000   p50  10.1 ms  p95  19.0 ms
exit=0
```

(The `ef_search=400` plan flip to a sequential scan described in `docs/ml-pipeline.md` is not visible in this run's latency: 10.9 ms; the doc reports 91 ms [D]. The clamp to 300 is enforced by a test, `test_ef_search_is_clamped_below_the_sequential_scan_cliff`, which passed [V], but I did not independently reproduce the 91 ms figure.)

### 11.3 `scripts/measure_api_latency.py --device cpu`: whole application, in-process (ASGI), rate limiting off

```
start-up (model load + warm-up): 1.7 s
POST /search/image, original upload (1800x2400), 200 requests
  decode p50 5.4 p95 9.6 | embed (model + classify) p50 40.5 p95 43.5 | database p50 17.9 p95 26.9
  END TO END (client wall time)    p50    65.3  p95    74.8  p99    86.2  max    97.1 ms   PASS (75 ms) vs target 400
POST /search/image, phone-style upload (1280 px)
  END TO END                       p50    56.5  p95    59.4  p99    62.6  max    72.5 ms   PASS (59 ms)
POST /search/image with 5 filters (phone-style)
  END TO END                       p50    80.3  p95    92.3  p99    99.8  max   123.8 ms   PASS (92 ms)
POST /search/text, 200 distinct queries
  cold (embeds the text)           p50    32.0  p95    39.3  p99    49.7  max    91.9 ms
  cached embedding                 p50    15.5  p95    20.1  p99    22.5  max    25.2 ms
POST /search/hybrid (phone-style upload + cached text)
  END TO END                       p50    58.4  p95    70.3  p99   102.1  max   181.2 ms   PASS (70 ms)
GET /products/{id}/similar (k=12), 200 products
  cold (pgvector)                  p50    21.8  p95    30.2  p99    38.1  max    48.6 ms   PASS (30 ms) vs target 50
  cached                           p50     1.4  p95     4.4  p99     7.3  max     8.9 ms   PASS (4 ms)
GET /products (24/page): newest p50 16.6 p95 19.9 | filters+price sort p50 24.2 p95 27.3 | q="red shirt" p50 15.9 p95 21.0 | page 800 p50 32.5 p95 35.3 ms
GET /catalog/filters p50 2.1 p95 2.5 ms
concurrency: 4 clients sending phone-style image searches
  latency at concurrency 4         p50   189.2  p95   209.4  p99   214.0  max   250.9 ms
  throughput 20.9 requests/s
exit=0
```

Targets (400 ms image search, 50 ms similar) come from `docs/SPEC.md` §4 [R]. My CPU run is consistent with the CPU column in `docs/search-api.md` (e.g. original-upload image search p95 75 ms vs documented 71 ms; similar cold p95 30 ms vs 30 ms) [D vs V].
The MPS columns in the docs (e.g. image search p95 74 ms; concurrency-4 p95 134 ms) were **not re-run** by me (I used `--device cpu` for the latency scripts); treat them as [D].

### 11.4 `scripts/benchmark_ml.py --n 2000`: throughput and embedding-quality experiments (MPS)

Random 2,000-product sample (seed 7) of the dataset scope. Full output (progress bars removed):

```
sampled 2000 products; torch 2.14.1; device auto = mps
== 1. decode + 2 WebP sizes + blur + 224px array, images/s (whole pipeline)
   workers=1:   17.6 img/s | workers=2: 26.8 | workers=3: 30.3 | workers=4: 34.5   (240/240 ok each)
   avg bytes/product for both thumbnails: 31.3 KB -> 1.31 GB for 41.9k products
== 3. fp32 on mps: batch-size sweep (images/s, peak RSS)
   batch= 16: 89.6 | 32: 94.6 | 64: 94.6 | 128: 90.1 | 256: 91.5   (peak RSS 1760 MB)
   full 2000 images at batch 64: 92.7 img/s ; norms min 1.000000 max 1.000000
== 4. fp16 vs fp32 on MPS
   fp16 111.2 img/s vs fp32 92.7 img/s -> speedup 1.20x
   cosine(fp16, fp32): min 0.99990 mean 0.99999 ; top-10 neighbour overlap 0.996, top-1 agreement 0.997, all finite: True
   GATE (finite, min cos >= 0.999, speedup >= 1.3x): FAIL        -> fp32 kept as the default
== 5. JPEG draft (1/2-scale) decode vs full decode
   cosine(draft, full): min 0.99773 mean 0.99994
== 6. center-crop vs pad-to-square (leave-one-out kNN within the sample)
   pad : articleType@10 0.774  subCategory@10 0.928  gender@10 0.831
   crop: articleType@10 0.771  subCategory@10 0.927  gender@10 0.838
   pad : zero-shot articleType accuracy 0.712 (75 classes)
   crop: zero-shot articleType accuracy 0.710 (75 classes)
== 7. fp32 on CPU
   batch= 1: 24.0 img/s | 16: 56.9 | 32: 56.7 ; cosine(cpu, mps fp32): min 1.000000
exit=0
```

### 11.5 Test-based quality checks [V]

`test_search_model.py` (passes): detected category is among the returned top 3 for all but at most one of up to 6 blue sample photos per type, for T-shirts, Casual Shoes, Watches, Jeans; every sampled catalogue photo returns itself with similarity > 0.999; text "red dress" gives ≥ 8/10 dress-like and ≥ 8/10 red; hybrid "the same t-shirt in red" raises the red share by > 0.2 while ≥ 12 of 24 stay T-shirts.

### 11.6 Documented measurements I did NOT reproduce [D]

`docs/search-api.md`: hybrid text-weight table (colour match 4 % → 92 % across w = 0 … 1; article type kept 79 % → 4 %; 24 blue products), MPS latency columns. `docs/ml-pipeline.md`: ingest speed (41,885 products in 16 min 10 s ≈ 43 img/s), DB size, `ef_search=400` seq-scan cliff (91 ms), recall figures from 150-query samples. Lighthouse (mobile preset): Home 88 / Listing 87 / Product 93 / Search 94 performance, 100 for Accessibility/Best Practices/SEO [D `docs/frontend.md`; V that the saved Lighthouse 13.5.0 reports `lh-home/listing/product/search.json` from 2026-10-07 contain exactly these scores]; I did not re-run Lighthouse.

### 11.7 What the evaluation does and does not show (for the thesis)

- **Present**: ANN-vs-exact recall@10, self-retrieval rank-1 rate, article-type/sub-category/gender label agreement of top‑10 neighbours (a proxy), zero-shot article-type accuracy, latency percentiles, throughput, fp16/crop/draft ablations.
- **NOT FOUND**: any evaluation against human-judged relevance or a labelled "similar item" ground truth; precision@k/recall@k/NDCG/mAP on user-style queries (photos not from the catalogue, e.g. street photos); a user study; A/B comparison to another model/baseline (e.g. plain CLIP vs FashionCLIP); evaluation of the hybrid text weight in code (only a table in docs); evaluation of the text-search quality beyond the 2 assertions above; accuracy of the detected category on the **full** catalogue (the 71.2 % is on a 2,000-product sample with 75 classes present, using the benchmark prompt `"a photo of a {type}"`, whereas production uses `"a photo of {type lowercased}"` with 107 labels, so the numbers are not directly comparable).
- The self-retrieval test queries with the same image that was indexed, so it validates plumbing and index recall, not generalisation. Label-agreement@10 is measured *within the 2,000-item sample*, not the full 41,885-item index.

---

## 12. Known limitations / unfinished parts (visible in code)

No `TODO`/`FIXME`/`NotImplemented` markers exist in source (grep across `apps`, `scripts`, `infra`, `.github`, `Makefile` returned only the HTML `placeholder` attribute, test stubs and comments [V]). Limitations are stated in comments/docs instead:

1. **Planned-but-absent features** (SPEC vs code): auth, users, addresses, cart, checkout/Stripe, orders, payments, wishlist, reviews, admin, transactional emails, `search_logs` table (`docs/search-api.md` "Known limits": only structured log lines). `api/v1/router.py` comment: "Feature routers (cart, orders, ...) are mounted here as they are built."
2. **No garment detection**: `WholeImageLocalizer` returns the full image (`ml/classifier.py`); photos with several garments or a person plus background are embedded as a whole. No crop UI (`docs/frontend.md`: "Not done: cropping the photo before searching").
3. **Synthetic business data**: prices and stock are generated (`ingestion/pricing.py`); sizes are hard-coded constants in the web app (`catalog/sizes.ts`); "new arrivals/newest" = ingestion time (`created_at`), because the dataset has no release date (`search-api.md`). One image per product.
4. **No similarity threshold**: the top-k is always returned, however poor; the UI shows a percentage but never says "no match" except for an empty filtered result.
5. **Detected category is a zero-shot guess** only over article types that exist in the catalogue; documented accuracy is ~71 % on a sample (§11.4).
6. **Single inference thread**: concurrent image searches queue behind the model (measured p95 209 ms at 4 concurrent clients on CPU, 20.9 req/s [V]); horizontal scaling is the stated remedy.
7. **Rate limiting** is a fixed window (up to 2× the limit across a boundary), per client IP; fails open if Redis is down. Per-IP in-process dev setup only; `TRUST_PROXY_HEADERS` default false.
8. **Storage**: only `LocalStorage` + `StaticFiles` (dev). No S3 backend, no CDN config. HEIC is not accepted by the API (converted in the browser; non-browser clients must send JPEG/PNG/WebP).
9. **No security headers** (CSP, HSTS, X-Content-Type-Options, …) configured in the API or `next.config.ts` (grep [V]) even though SPEC §7 lists "security headers".
10. **Deployment gaps**: no Dockerfiles, no full-stack compose, no production config (see §13). `CLAUDE.md` mentions "Full-stack docker compose is for deployment" but only `infra/docker-compose.dev.yml` exists [V `find`].
11. **Frontend performance target missed on two pages**: Lighthouse performance Home 88, Listing 87 vs SPEC target 90+ (`docs/frontend.md` [D/V reports]).
12. **Type-generation drift risk**: `docs/openapi.json` is git-ignored; `src/lib/api/schema.d.ts` is committed (currently untracked/uncommitted) and CI has no drift check; `npm run api:types` reads the ignored file.
13. **Stale documentation**: root `README.md` status says Phase 2 and describes an API status line on the home page that no longer exists; `docs/search-api.md` says `limit` "Defaults to 24" in the shared `Limit` schema description while `/similar` actually defaults to 12; `ingestion/pipeline.py` `_upsert` comment refers to "after Phase 4" for live stock changes; `docs/ml-pipeline.md` says "143 article types" (raw CSV) whereas the catalogue has 107.
14. **Unused code / data quirk**: `apps/web/src/features/health/*` (API status widget) is not used by any page. Separately, 11 article-type names appear under two parent categories (§8), and products are filtered by the `article_type` *name*, so such a filter spans both parents.
15. **Working tree is not committed**: all Phase 4 frontend code (and `package.json`/lockfile changes) is uncommitted at the time of writing.
16. **Model weights / dataset not self-contained**: the model downloads from Hugging Face on first start (~600 MB per `Makefile`/README), the dataset must be obtained from Kaggle separately; the ingestion step takes 16 min on the M1 per `docs/ml-pipeline.md` [D].

---

## 13. Deployment / run instructions (as defined in the repo)

Sources: `README.md`, `Makefile`, `.env.example`, `infra/docker-compose.dev.yml`, `.github/workflows/ci.yml`. The repo defines **local development** and **CI** only; production deployment is **NOT FOUND**.

### Prerequisites [R `README.md`]
Node.js 24 (`apps/web/.nvmrc`), `uv` (installs Python 3.12), Docker with Compose v2, `make`. Apple Silicon is the intended dev machine (PyTorch MPS); compose images are multi-arch.

### Steps [R `README.md`, `Makefile`]

```bash
make install        # uv sync (API) + npm ci (web)
make infra          # copies .env.example → .env if missing; docker compose up -d --wait (Postgres :5433, Redis :6379)
make migrate        # alembic upgrade head
make ingest         # needs DATASET_DIR in .env (Kaggle folder with styles.csv + images/); ARGS="--limit 500" for a sample
make api            # uvicorn lookalike.main:create_app --factory --reload on 127.0.0.1:8000 (downloads FashionCLIP on first start)
make web            # next dev on :3000
```

Other targets: `make lint`, `make typecheck`, `make test` (API tests need infra + migrate), `make test-ml` (real model), `make openapi`, `make api-types`, `make browser-check`, `make latency DEVICE=cpu|mps`, `make infra-down`, `make infra-reset` (deletes data volumes).
URLs: web http://localhost:3000, API http://localhost:8000 (`/healthz`, `/readyz`, `/api/v1/docs`).

### Configuration (`.env.example`, read by the API from `../../.env`, then `apps/api/.env`)
`POSTGRES_*`, `REDIS_PORT`, `APP_ENV`, `LOG_LEVEL`, `LOG_JSON`, `DATABASE_URL` (default `postgresql+asyncpg://lookalike:lookalike@localhost:5433/lookalike`), `REDIS_URL`, `CORS_ORIGINS`, `MEDIA_DIR`, `MEDIA_URL_PATH`, `MEDIA_BASE_URL`, `DATASET_DIR`,
`EMBEDDING_DEVICE` (`auto`), `EMBEDDING_FP16` (`false`), `EMBEDDING_RESIZE_MODE` (`pad`), `MAX_UPLOAD_BYTES` (8388608), `MAX_UPLOAD_PIXELS` (25000000), `SEARCH_DEFAULT_LIMIT` (24), `HYBRID_TEXT_WEIGHT` (0.65), `DETECTED_CATEGORIES` (3),
`TEXT_EMBEDDING_CACHE_TTL_SECONDS` (86400), `SIMILAR_CACHE_TTL_SECONDS` (300), `CATALOG_FILTERS_CACHE_TTL_SECONDS` (600), `REDIS_OP_TIMEOUT_SECONDS` (0.5), `RATE_LIMIT_ENABLED` (true), `RATE_LIMIT_IMAGE/TEXT/SIMILAR` (`20/60`, `60/60`, `120/60`), `TRUST_PROXY_HEADERS` (false),
web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, optional `API_INTERNAL_URL`. Defaults in `.env.example` are local-development values, not secrets; the real `.env` is git-ignored (a local `.env` exists in the working directory [V]; its contents are not reproduced here).
`apps/web/.env.example` lists only `NEXT_PUBLIC_API_URL` (the root `.env.example` is the complete one).

### CI [R `.github/workflows/ci.yml`]
On push to `main` and PRs: **api** job (Postgres `pgvector/pgvector:pg18` + Redis 8 service containers): `uv sync --frozen`, `ruff check`, `ruff format --check`, `mypy`, migrations up/down/up, `alembic check`, `pytest` (model tests excluded);
**web** job: `npm ci`, `lint`, `typecheck`, `npm test`, `npm run build`; **infra** job: `docker compose config --quiet`. I did not execute the workflow itself; I ran the equivalent commands locally (§10).

### Production / containers
Dockerfiles for `api` or `web`: **NOT FOUND**. Full-stack compose: **NOT FOUND**. Reverse proxy/TLS, object storage, secrets management, process manager: **NOT FOUND**.

---

## Appendix: side effects of producing this file

Commands run (all read-only with respect to source code): `git`, `ls`, `grep`, `psql` SELECT queries via `docker exec`, `curl` against the running API, `pytest` (default and `-m model`), `vitest`, `eslint`, `tsc`, `ruff`, `mypy`, `check_recall.py`, `measure_latency.py`,
`measure_api_latency.py`, `benchmark_ml.py`, `browser-check.mjs` (screenshots written to a scratch directory outside the repo, not to `docs/screenshots`).
Incidental, non-source effects: the test run creates/drops a throwaway `lookalike_test` database; the scripts created and removed their own Redis cache keys and incremented rate-limit counters; `next typegen` refreshed git-ignored type files under `apps/web/.next`.
