# Angel

Upload or capture a photo of clothing and get visually similar products, inside a complete,
minimal online store. Image embeddings come from FashionCLIP, similarity search from
PostgreSQL + pgvector.

> **Status:** Phase 10 (a real admin panel and a complete order lifecycle). A working store:
> visual, text and hybrid search over 41,885 products, accounts (password and Google), cart, checkout
> with a demo payment, orders that are shipped, delivered, cancelled and refunded with tracking and a
> history, product reviews, and an admin panel (dashboard, orders, products, inventory, customers,
> review moderation). Product requirements: [`docs/SPEC.md`](docs/SPEC.md). Details:
> [`ml-pipeline`](docs/ml-pipeline.md), [`search-api`](docs/search-api.md), [`commerce`](docs/commerce.md),
> [`frontend`](docs/frontend.md) (accessibility and performance results), [`admin`](docs/admin.md),
> [`e2e`](docs/e2e.md).

## Repository layout

```
apps/api       FastAPI backend (Python package `angel`): api -> services -> repositories -> models, by domain
apps/web       Next.js 16 storefront and admin (App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query)
scripts/       command-line entry points: ingest the dataset, seed demo data, benchmarks
infra/         docker compose for development infrastructure (Postgres + pgvector, Redis)
docs/          documentation (start with docs/architecture.md)
```

The map in more detail, and where to add a new endpoint, table or page, is in [`docs/architecture.md`](docs/architecture.md).

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24 (see `apps/web/.nvmrc`) | npm is the package manager |
| [uv](https://docs.astral.sh/uv/) | latest | installs Python 3.12 automatically |
| Docker | with Compose v2 | images are multi-arch (arm64 / amd64) |
| make | any | |

## Quick start

```bash
make install   # API deps (uv sync) + web deps (npm ci)
make infra     # Postgres+pgvector and Redis in Docker; creates .env from .env.example
make migrate   # apply database migrations (pgvector, products, categories)
make ingest ARGS="--limit 500"   # optional: load a 500-product sample (needs DATASET_DIR in .env)

make api       # terminal 1: FastAPI on http://localhost:8000
make web       # terminal 2: Next.js on http://localhost:3000
make create-admin EMAIL=you@example.com   # optional: an administrator for http://localhost:3000/admin
make seed-demo                            # optional: demo customers, ~80 orders and reviews for the dashboard
```

Then open <http://localhost:3000>. The status line on the home page shows whether the browser can
reach the API and whether its dependencies are healthy.

| URL | What |
| --- | --- |
| <http://localhost:3000> | Web app |
| <http://localhost:8000/healthz> | Liveness (no dependencies) |
| <http://localhost:8000/readyz> | Readiness: database, Redis, model |
| <http://localhost:8000/api/v1/docs> | Interactive OpenAPI docs |

The API and web app run natively (not in Docker) so PyTorch can use Apple MPS later on.
Docker is used only for the data services.

## Commands

Run `make help` for the full list.

| Command | What it does |
| --- | --- |
| `make infra` / `make infra-down` / `make infra-reset` | Start / stop / stop and **delete data** |
| `make migrate` | Apply Alembic migrations |
| `make ingest` | Ingest the dataset (`ARGS="--limit 500"`, see `docs/ml-pipeline.md`) |
| `make api` / `make web` | Run the dev servers |
| `make lint` | Ruff (check + format check) and ESLint |
| `make typecheck` | mypy (strict) and `tsc` |
| `make test` | API tests (pytest) and web tests (Vitest) |
| `make test-ml` | Tests that load the real FashionCLIP model (downloads ~600 MB once) |
| `make format` | Auto-format and auto-fix the API |
| `make create-admin EMAIL=...` | Create or promote an administrator (`docs/admin.md`) |
| `make seed-demo` / `make seed-demo-clean` | Add / remove demo customers (`demo-*@example.com`, password `DemoPass12345`), orders in every state and reviews, so the admin dashboard has something to show (development only; `docs/admin.md`) |
| `make web-prod` | Build and serve the web app as in production on :3000 (what e2e and Lighthouse measure) |
| `make e2e` / `make e2e-clean` | Playwright end-to-end tests against the running stack / remove what they created (`docs/e2e.md`) |
| `make seed-e2e` | Synthetic 60-product catalogue for CI (`EMBEDDER=fake`) |
| `make lighthouse` | Lighthouse on the production build; fails below 90 on home, listing and product |
| `make openapi` | Export the OpenAPI schema to `docs/openapi.json` |

Tests that write catalogue data use a throwaway `angel_test` database (created and dropped by
the test run), so `make test` never touches the ingested catalogue. API integration tests run against the real dev Postgres and Redis, so run `make infra` and
`make migrate` first. They fail with a clear message, rather than skipping, if the services are
unreachable.

## Configuration

All settings come from environment variables; defaults match `.env.example`. `make infra` copies it
to `.env` (git-ignored) on first run. The API reads `.env` from the repository root.

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://angel:angel@localhost:5433/angel` | |
| `REDIS_URL` | `redis://localhost:6379/0` | |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated |
| `LOG_LEVEL` / `LOG_JSON` | `INFO` / `true` | set `LOG_JSON=false` for readable console logs |
| `DATASET_DIR` | unset | folder with the Kaggle `styles.csv` and `images/` (ingestion only) |
| `MEDIA_DIR` / `MEDIA_URL_PATH` | `../../data/media` / `/media` | thumbnails written by ingestion, served by the API |
| `EMBEDDER` | `fashion-clip` | `fake` is a deterministic stand-in for CI end-to-end tests; refused when `APP_ENV=prod` |
| `EMBEDDING_DEVICE` / `EMBEDDING_FP16` / `EMBEDDING_RESIZE_MODE` | `auto` / `false` / `pad` | see `docs/ml-pipeline.md` before changing |
| `RATE_LIMIT_ENABLED`, `RATE_LIMIT_*` | on | per client address; the e2e tests need `RATE_LIMIT_ENABLED=false` (`RATE_LIMIT_ADMIN` limits the admin area) |
| `LOW_STOCK_THRESHOLD` | `5` | products at or below this many units count as low on stock in the admin dashboard and inventory |
| `PAYMENTS_MODE` | `stripe` | `offline` is the in-process demo gateway (refused in prod) |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SITE_URL` | `http://localhost:8000` / `http://localhost:3000` | web, validated at startup (`apps/web/.env.example`); the site URL feeds canonical links and the sitemap |

Never commit real secrets; `.env*` files other than `*.example` are git-ignored.

## API conventions

- Versioned under `/api/v1`; `/healthz` and `/readyz` are unversioned because orchestrators probe them.
- Errors are [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) `application/problem+json`,
  always with a `request_id`. Unexpected errors never leak internals.
- Every response carries `X-Request-ID` (a valid inbound one is reused). Logs are JSON, one
  access line per request, with the request ID attached to every line.
- Layering: `api/routes` -> `services` -> `repositories` -> `models`; Pydantic `schemas` are separate
  from ORM models; ML sits behind the `ml/` interface.

## Troubleshooting

- **Port 5432 is taken** by a locally installed Postgres: that's why compose publishes Postgres on
  **5433**. Change `POSTGRES_PORT` (and `DATABASE_URL`) in `.env` if 5433 is also taken.
- **`/readyz` returns 503**: the body lists which check failed. Usually `make infra` isn't running.
- **Start over with an empty database**: `make infra-reset && make infra && make migrate`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests:
API (and scripts) lint, format check, mypy, migration apply/rollback/re-apply, `alembic check` and pytest (without the model-loading tests) against
real Postgres+pgvector and Redis service containers; web lint, typecheck, Vitest and a production
build; an end-to-end job (Playwright against a seeded catalogue, the fake embedder and the production web build; the
report is kept when it fails); and validation of the compose file.
