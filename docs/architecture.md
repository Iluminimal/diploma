# Architecture: where things are

Angel is a monorepo: a Next.js storefront and admin (`apps/web`), a FastAPI backend (`apps/api`), PostgreSQL with pgvector
for data and vector search, and Redis for caches and rate limits. This page is the map. The details of each part are in the
other documents (index: [`README.md`](README.md)).

```
angel/
├── apps/
│   ├── api/                 the backend (Python package `angel`)
│   │   ├── src/angel/       the code, see "The backend" below
│   │   ├── tests/           pytest, laid out like the code
│   │   └── migrations/      Alembic (one file per schema change)
│   └── web/                 the frontend (Next.js App Router)
│       ├── src/app/         routes: one folder per URL (storefront, /account, /checkout, /admin)
│       ├── src/features/    the code behind the screens, one folder per feature
│       ├── src/components/  shared UI: ui/ (shadcn), layout/, product/, forms/, motion/
│       ├── src/lib/         API client (generated types), env, helpers
│       └── e2e/             Playwright tests (see e2e.md)
├── scripts/                 command-line entry points (ingest the dataset, seed demo data, benchmarks)
├── infra/                   docker compose for Postgres + Redis (development)
├── docs/                    these documents
└── Makefile                 every everyday command (`make help`)
```

## The backend (`apps/api/src/angel`)

A request travels one way down the layers and each layer only talks to the one below:

```
HTTP request
   ▼
api/        routes: parse and validate the request, call a service, return a schema. No business logic.
   ▼
services/   the rules: checkout, refunds, ranking, who may review. Decide, coordinate, send emails.
   ▼
repositories/   the only code that writes SQL (SQLAlchemy queries, row locks).
   ▼
models/     ORM tables (Product, Order, User …); db/ holds the engine and the Base class.
```

Alongside them: `schemas/` (Pydantic request and response shapes, kept apart from the ORM models), `core/` (settings,
security, errors, rate limiting, dependency wiring in `deps.py`), `ml/` (FashionCLIP behind an interface), `ingestion/`
(the dataset pipeline), `oauth/` (Google), `payments/` (the gateway interface: Stripe and an offline demo one), `storage.py`
(photos on disk, behind an interface), and `cli/` (command-line tools).

### Domains

`api/v1`, `services`, `repositories` and `schemas` are each split into the **same six folders**, so a feature is always in
the same place in every layer:

| Domain | What it covers | Examples |
| --- | --- | --- |
| `catalog` | the products people browse and search | listing, filters, category tree, visual and text search, sizes, sitemap |
| `accounts` | who people are | register, sign in, profile, addresses, Google sign-in |
| `commerce` | buying | cart, wishlist, checkout, orders, payments, shipping, webhooks, fulfilment (ship, deliver, cancel, refund) |
| `reviews` | what customers say | writing, editing and listing reviews, the product's rating |
| `admin` | the back office | dashboard figures, customers, product management, order and review moderation |
| `system` | the service itself | health and readiness |

Shared pieces that belong to no single domain stay at the top of their layer: `services/mappers.py` (ORM to schema),
`services/cache.py`, `repositories/patterns.py`, `schemas/problem.py` (RFC 7807 errors).

The tests mirror this: `tests/{accounts,admin,catalog,commerce,core,ingestion,ml,reviews}/`, with shared helpers in
`tests/support/`.

### Following one request: "ship an order"

1. `api/v1/admin/orders.py`: `POST /api/v1/admin/orders/{number}/ship`. The admin package (`api/v1/admin/__init__.py`)
   puts a rate limit, the administrator check and `no-store` in front of every admin route.
2. `services/commerce/order_fulfillment.py`: locks the order, checks it is paid, records the shipment, writes an event, emails
   the customer.
3. `repositories/commerce/orders.py`: the queries (`get_for_update`, `add_event`).
4. `models/order.py`: the `Order` and `OrderEvent` tables. `schemas/admin/orders.py`: the request and the response.

## The frontend (`apps/web/src`)

* `app/`: only routing and page metadata. A page is a few lines that render something from `features/`.
* `features/<name>/`: everything for one part of the product (`catalog`, `cart`, `checkout`, `orders`, `reviews`, `admin`,
  `auth`, `account`, `wishlist`, `home`, `search`, `seo`, `health`): components, data hooks (TanStack Query), API calls and
  their tests side by side.
* `components/`: UI shared by several features. `ui/` is shadcn, `layout/` the header, footer, menus and search bar,
  `product/` cards, prices and stars, `forms/` form fields.
* `lib/api/`: a typed client generated from the backend's OpenAPI document (`make api-types`), so the two cannot drift apart
  without the type checker noticing.

Server Components are the default; a file is a client component only when it needs state, effects or browser APIs.

## Where do I add …?

| I want to … | Do this |
| --- | --- |
| add an endpoint | a route in `api/v1/<domain>/`, the rule in `services/<domain>/`, the query in `repositories/<domain>/`, the shapes in `schemas/<domain>/`; a test in `tests/<domain>/`; then `make openapi api-types` |
| add a table or column | the model in `models/`, then `cd apps/api && uv run alembic revision --autogenerate -m "…"`, read the file it wrote, `make migrate`; `alembic check` must then say "No new upgrade operations" |
| add a setting | `core/config.py` (with its default) and `.env.example` |
| add a page | `apps/web/src/app/<url>/page.tsx` rendering a component from `features/<feature>/` |
| add a command | `angel/cli/` and a Makefile target |
| change what an email says | the service that sends it (`services/commerce/order_fulfillment.py` for order emails), through the `Mailer` in `core/mail.py` |

## Rules that keep it understandable

* Routes do not contain business logic; services do not write SQL; repositories do not know about HTTP.
* Schemas are separate from ORM models; nothing returns an ORM object to the client.
* Money is integer cents. Times are UTC. Errors are RFC 7807 problems (`urn:angel:problem:*`).
* Anything that changes state in several tables does it in one transaction, and anything that talks to an outside service
  (payments) is written so that a failure leaves the data unchanged.
* New code comes with tests; `make lint typecheck test` must pass before a commit.
