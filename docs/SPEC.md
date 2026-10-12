# Angel: Product & Technical Spec

Production-quality e-commerce web app. Users upload or capture a photo of clothing and
the app recommends visually similar products (like Amazon's "search by image"), inside a
complete, minimal, modern online store.

## 1. Tech stack
**Frontend** (`/apps/web`)
- Next.js (latest, App Router), React 19, TypeScript strict
- Tailwind CSS v4 + shadcn/ui (Radix) + lucide-react
- TanStack Query (server state), Zustand (small client state)
- React Hook Form + Zod
- next/image with proper sizes and blur placeholders, next/font
- Server Components by default; Client Components only where interaction requires it
- Motion (Framer Motion) used sparingly

**Backend** (`/apps/api`)
- Python 3.12+, FastAPI, Pydantic v2, uvicorn
- SQLAlchemy 2.0 async + asyncpg + Alembic
- PostgreSQL 16+ with pgvector (HNSW, cosine distance)
- uv, Ruff, pytest + httpx
- ML: PyTorch + Hugging Face transformers, `patrickjohncyh/fashion-clip`
  (512-dim, L2-normalized). Load once at startup (lifespan); run inference in a
  threadpool so the event loop never blocks.
- Auth: short-lived JWT access token + refresh token in httpOnly secure cookie,
  argon2 password hashing
- Redis for caching, rate limiting, session helpers

**Infra**
- Docker + docker-compose (web, api, postgres+pgvector, redis)
- `.env.example`, Makefile, GitHub Actions CI (lint, typecheck, test, build)

## 2. Dataset
Kaggle "Fashion Product Images Dataset" (`styles.csv` + `images/`).
- `styles.csv` has malformed rows: parse with `on_bad_lines="skip"` and validate.
- Drop rows whose image is missing or unreadable.
- No prices or stock in the data: generate realistic deterministic prices (seeded, by
  category) and stock quantities in the seed script.
- Fields: id, gender, masterCategory, subCategory, articleType, baseColour, season,
  year, usage, productDisplayName.
- `scripts/ingest.py`: idempotent and resumable; batch embedding (configurable batch
  size, GPU if available, fp16 on GPU), progress bar, bulk insert, safe to re-run.
  Support exporting/importing embeddings (.npy or parquet) so the heavy step can run
  on Colab/Kaggle if there is no local GPU.
- Generate WebP thumbnails (400px and 800px) at ingest; serve as static files behind a
  storage abstraction (local disk in dev, S3-compatible in prod).

## 3. Database design
Tables with proper indexes, FKs, constraints, timestamps:
- `products` (metadata, price, currency, stock, slug, is_active, `embedding vector(512)`)
- `categories` (or indexed dataset category columns)
- `users`, `addresses`
- `carts`, `cart_items`
- `orders`, `order_items` (price snapshot), `payments`
- `wishlist_items`
- `reviews` (optional)
- `search_logs` (query type, latency, result count; never raw user images)

pgvector:
- HNSW index on `embedding` with `vector_cosine_ops`; tune m, ef_construction; set
  `hnsw.ef_search` per query.
- Filtered similarity search (gender, category, price range, in stock) must stay fast:
  use iterative scan if the installed pgvector supports it, otherwise over-fetch then
  filter. Document the choice.
- Postgres full-text index (tsvector) on product name for text search.

## 4. Core feature: visual search
`POST /api/v1/search/image` (multipart upload). Pipeline:
1. Validate content-type and size (max ~8 MB); decode safely with Pillow; strip EXIF;
   fix orientation; reject decompression bombs.
2. Garment localization behind a clean interface (YOLO pluggable later). Start with
   zero-shot FashionCLIP category prediction on the whole image. Return the predicted
   category so the UI can show "Detected: Shirts" and let the user override.
3. Compute the FashionCLIP image embedding, L2-normalize.
4. Query pgvector: top-K by cosine similarity with optional filters (gender,
   articleType, price range, color); return similarity score.
5. Return product DTOs + scores + timings.

Also:
- `POST /api/v1/search/text` (FashionCLIP text embedding, e.g. "red floral dress")
- `POST /api/v1/search/hybrid` (image + text refinement via weighted sum of normalized
  embeddings, e.g. "like this but in blue")
- `GET /api/v1/products/{id}/similar` (uses stored embedding, no inference)

Performance targets: image search p95 under ~400 ms on CPU (DB + inference, warm model;
document measured numbers); similar-products under 50 ms. Cache text embeddings and
similar-product results (in-memory or Redis LRU).

## 5. E-commerce features (all required)
- Home: hero with upload CTA, categories, new arrivals, trending
- Listing: filters (gender, category, article type, color, price, season, usage),
  sorting, pagination or infinite scroll, URL-synced filter state
- Product detail: gallery, price, stock state, size selector (per category), add to cart,
  wishlist, similar-products carousel, breadcrumbs, SEO metadata + JSON-LD Product
- Visual search page: drag-and-drop, paste from clipboard, camera capture (`getUserMedia`
  on desktop, `capture` attribute on mobile), preview with crop, skeleton loading,
  results grid with similarity badge, filter chips, text refinement input
- Cart: persisted for guests, merged on login; mini-cart drawer; quantity updates; stock
  validation
- Checkout: address form, shipping method, summary, Stripe in TEST mode with idempotent
  webhook handling, confirmation page
- Auth: register, login, logout, refresh, protected routes, account page
- Account: order history, order detail, saved addresses, wishlist
- Search bar with debounced text search and suggestions
- Admin (minimal): protected area to list/create/edit/deactivate products and view
  orders; creating a product from an uploaded image computes and stores its embedding
- Transactional emails stubbed behind an interface (console log in dev)

## 6. Design direction
Clean, minimal, modern: think Vercel, Linear, Apple Store, COS, Zara.
- Neutral palette (near-white, near-black, one subtle accent), generous whitespace,
  strong typography (Geist or Inter via next/font), large product imagery
- Soft borders, subtle shadows, 12-16px radii, consistent spacing scale
- Dark mode via CSS variables + `prefers-color-scheme` + manual toggle
- Responsive, mobile-first; touch-friendly camera/upload flow
- Skeleton loaders, optimistic UI for cart/wishlist, meaningful empty and error states
- Accessibility: semantic HTML, keyboard navigation, focus states, alt text, WCAG AA,
  respect `prefers-reduced-motion`
- Performance: Lighthouse 90+ on home, listing, product pages; streaming/Suspense, image
  optimization, route-level code splitting, minimal client JS

## 7. Architecture requirements
Backend layering (no business logic in routes):
`api/routes` -> `services` -> `repositories` -> `models`; `schemas` (Pydantic DTOs)
separate from ORM models; `core` (config, security, logging); `ml` (embedding service
behind an interface so the model can be swapped).
- Dependency injection via FastAPI `Depends`
- Settings via pydantic-settings; no secrets in code
- Structured JSON logging, request IDs, global exception handlers (RFC 7807 style)
- Versioned API (`/api/v1`), OpenAPI docs, proper CORS
- Rate limiting on search and auth endpoints
- `/healthz` and `/readyz` (readiness checks DB + model loaded)
- Frontend: feature-based folders, typed API client generated from OpenAPI
  (openapi-typescript), centralized error handling, env validation
- Security: validate all input, parameterized SQL only, upload hardening, secure cookies,
  CSRF-safe design, security headers; user images not persisted unless the user opts in

## 8. Testing
- Backend: pytest unit tests for services; integration tests against real Postgres
  (testcontainers or compose); search pipeline tests with fixture images; recall sanity
  test (a product's image returns itself at rank 1)
- Frontend: Vitest + Testing Library for key components; Playwright e2e for visual
  search, add to cart, checkout (Stripe test mode), login
- CI runs all of the above

## 9. Definition of done (per phase)
- Runs with a single documented command
- Lint, typecheck, and tests pass
- Short summary: what was built, key decisions and trade-offs, how to verify, what's next