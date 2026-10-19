# Angel

[![CI](https://github.com/Iluminimal/diploma/actions/workflows/ci.yml/badge.svg)](https://github.com/Iluminimal/diploma/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Find clothes by photo.** Upload or take a picture of an outfit and Angel shows visually similar products,
inside a complete online store. The storefront follows the design language of apple.com.

![Angel home page](docs/screenshots/home.jpg)

| Category menu | Bag | Search on a phone |
| --- | --- | --- |
| ![Category menu](docs/screenshots/category-menu.jpg) | ![Bag](docs/screenshots/bag.jpg) | <img src="docs/screenshots/search-phone.jpg" width="220" alt="Search on a phone"> |

## Features

- **Search by photo, text, or both** across 41,885 products
- **Store**: categories, filters, product pages with reviews, wishlist, bag and checkout, order history
- **Accounts**: email or phone sign-in with one-time codes, Google sign-in
- **Admin panel**: dashboard, orders, products, inventory, customers, review moderation

## How it works

Every product photo is turned into a 512-number vector by [FashionCLIP](https://huggingface.co/patrickjohncyh/fashion-clip)
and stored in PostgreSQL with pgvector. A search photo is turned into a vector the same way, and the database
returns the closest products.

## Tech stack

| | |
| --- | --- |
| Web | Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query |
| API | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 (async), Alembic |
| Data | PostgreSQL + pgvector, Redis |
| ML | FashionCLIP on PyTorch |
| Tooling | uv, Ruff, mypy, ESLint, Vitest, Playwright, GitHub Actions |

## Getting started

You need [Node.js](https://nodejs.org) 24, [uv](https://docs.astral.sh/uv/), Docker with Compose v2, and `make`.

```bash
make install   # install API and web dependencies
make infra     # start Postgres and Redis in Docker (creates .env on first run)
make migrate   # create the database tables

make api       # terminal 1: API on http://localhost:8000
make web       # terminal 2: web app on http://localhost:3000
```

Open <http://localhost:3000>. The catalogue is empty until you load data:

```bash
make ingest ARGS="--limit 500"   # load a 500-product sample of the Kaggle fashion dataset
```

Set `DATASET_DIR` in `.env` to the folder with the dataset first. See [`docs/ml-pipeline.md`](docs/ml-pipeline.md).
To try the admin panel: `make create-admin EMAIL=you@example.com`, then open <http://localhost:3000/admin>.

## Common commands

| Command | What it does |
| --- | --- |
| `make test` | API and web tests |
| `make lint` / `make typecheck` | Ruff + ESLint / mypy + TypeScript |
| `make e2e` | Playwright end-to-end tests |
| `make help` | List every command |

## Project structure

```
apps/api    FastAPI backend: routes -> services -> repositories -> models
apps/web    Next.js storefront and admin panel
scripts/    dataset ingestion, demo data, benchmarks
infra/      Docker Compose for Postgres and Redis
docs/       documentation
```

## Documentation

[Architecture](docs/architecture.md) · [Development guide](docs/development.md) · [Requirements](docs/SPEC.md) ·
[Search API](docs/search-api.md) · [ML pipeline](docs/ml-pipeline.md) · [Commerce](docs/commerce.md) ·
[Frontend](docs/frontend.md) · [Admin](docs/admin.md) · [End-to-end tests](docs/e2e.md)

## License

[MIT](LICENSE)
