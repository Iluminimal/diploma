# Lookalike

Upload or capture a photo of clothing and get visually similar products, inside a complete,
minimal online store. Image embeddings come from FashionCLIP, similarity search from
PostgreSQL + pgvector.

> **Status:** Phase 1 (foundation). The web app, API skeleton, dev infrastructure, migrations and
> CI are in place. Catalog, search and store features arrive in later phases; the product
> requirements live in [`docs/SPEC.md`](docs/SPEC.md).

## Repository layout

```
apps/web     Next.js 16 (App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query)
apps/api     FastAPI (Python 3.12, SQLAlchemy 2 async, Alembic, uv)
infra/       docker-compose for development infrastructure (Postgres + pgvector, Redis)
docs/        Product & technical spec
scripts/     Data ingestion scripts (later phase)
```

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
make migrate   # apply database migrations (enables the pgvector extension)

make api       # terminal 1: FastAPI on http://localhost:8000
make web       # terminal 2: Next.js on http://localhost:3000
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
| `make api` / `make web` | Run the dev servers |
| `make lint` | Ruff (check + format check) and ESLint |
| `make typecheck` | mypy (strict) and `tsc` |
| `make test` | API tests (pytest) and web tests (Vitest) |
| `make format` | Auto-format and auto-fix the API |
| `make openapi` | Export the OpenAPI schema to `docs/openapi.json` |

API integration tests run against the real dev Postgres and Redis, so run `make infra` and
`make migrate` first. They fail with a clear message, rather than skipping, if the services are
unreachable.

## Configuration

All settings come from environment variables; defaults match `.env.example`. `make infra` copies it
to `.env` (git-ignored) on first run. The API reads `.env` from the repository root.

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://lookalike:lookalike@localhost:5433/lookalike` | |
| `REDIS_URL` | `redis://localhost:6379/0` | |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated |
| `LOG_LEVEL` / `LOG_JSON` | `INFO` / `true` | set `LOG_JSON=false` for readable console logs |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | web, validated at startup (`apps/web/.env.example`) |

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
API lint, format check, mypy, migration apply/rollback/re-apply, `alembic check` and pytest against
real Postgres+pgvector and Redis service containers; web lint, typecheck, Vitest and a production
build; and validation of the compose file.
