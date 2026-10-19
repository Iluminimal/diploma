# Development guide

Everything beyond the quick start in the [README](../README.md): all commands, configuration, API
conventions, troubleshooting and CI.

The API and web app run natively (not in Docker) so PyTorch can use Apple MPS. Docker is used only for the
data services.

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

## License

[MIT](LICENSE)
