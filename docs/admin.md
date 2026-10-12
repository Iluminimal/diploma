# Admin area

The shop's back office: a dashboard, orders through their whole life (ship, deliver, cancel, refund, notes), the
catalogue, stock, customers and review moderation. API under `/api/v1/admin` (interactive docs: `/api/v1/docs`), UI under
`/admin`. The customer-facing side of orders and reviews is in `docs/commerce.md`.

## Getting an administrator, and signing in

Registering through the app always creates a customer. The only way to get an administrator is the command line, so
there is no sign-up form to attack:

```bash
make create-admin EMAIL=you@example.com             # asks for a password (twice, not echoed)
make create-admin EMAIL=you@example.com ARGS=--keep-password   # promote an existing account, keep its password
ADMIN_PASSWORD=... make create-admin EMAIL=...      # non-interactive (CI); never pass a password as an argument
cd apps/api && uv run python -m angel.cli.admin revoke-admin --email you@example.com
```

An administrator who signs in (password form, register form or Google) and did not ask for a particular page lands on
`/admin`; one who was headed somewhere else (`?next=/cart`) still goes there. Customers land where they always did. The
rule is `landingPath` in `features/auth/landing.ts` for the forms and `OAuthService.complete` for Google.

`users.role` is `customer` or `admin` (a CHECK constraint). The role is **read from the database on every admin request**
and is never copied into the access token, so demoting or deactivating someone takes effect immediately, even for a token
that has not expired. Everything admin is behind `get_current_admin` (`core/deps.py`): 401 without a valid token (or for
a deactivated account), 403 (`urn:angel:problem:forbidden`) for a customer. Admin routes also have their own rate limit
(`RATE_LIMIT_ADMIN`, default 120 per minute per client address).

## The shell

`/admin` has its own frame instead of the storefront's: a sidebar (Dashboard, Orders, Products, Inventory, Customers,
Reviews), "View store", the theme toggle and the account menu; on a phone the sidebar becomes a strip of pills across the
top. The storefront's header and footer are not rendered there (`ShopChrome` in the root layout checks the path), so there
is no shop navigation to get lost in. `AdminGate` shows signed-out visitors the login page (with a way back) and customers
a "no access" message, and their browser sends no admin request at all. That gate is for the visitor's benefit; **the API
is what enforces access**, and the e2e suite checks both. `/admin` is `noindex`, disallowed in `robots.txt`, and covered by
the edge proxy's session check.

## Dashboard

`GET /admin/stats?days=30` (7, 30 or 90 in the UI; 1 to 366 in the API) and `/admin?days=7`. Everything is computed from the
orders, order items, products and users tables: there is no separate reporting store.

* **Revenue** is the total of orders that are `paid`, `shipped` or `delivered`, **by the day they were paid** (UTC days). A
  refunded order is not revenue; a cancelled one never was. **Orders**, **units** and **average order** use the same set.
* **New customers** are accounts created in the period (administrators and anonymised accounts are left out).
* Each figure is compared with the **equally long period just before**: "up 12%", "unchanged", "down 40%", or, when there was
  nothing before, "new" (a percentage of zero would be meaningless).
* The chart is drawn by hand (no chart library): SVG bars (`RevenueChart`) with the axis labels as text around them and the
  same numbers as a table under "Show the figures as a table", so it works with a screen reader and does not blur on a phone.
* **Needs attention** links to what is waiting: paid orders to ship, orders awaiting payment, products low on stock
  (`LOW_STOCK_THRESHOLD`, default 5, at or below and not yet sold out) and sold out. Also: recent orders, top products by
  revenue, the low-stock products.

## Orders

```
pending ──paid──▶ paid ──ship──▶ shipped ──deliver──▶ delivered
   │                 │              │                      │
 cancel            refund         refund                 refund
   ▼                 ▼              ▼                      ▼
cancelled          refunded      refunded               refunded
```

One state machine, `services/order_fulfillment.py`. Each action takes the order's row lock, checks the current state, writes
an event in the same transaction and then emails the customer. Anything else is a **409**
(`urn:angel:problem:invalid-order-transition`), so two administrators clicking at once get one result and one error.

| Endpoint | From | Effect |
| --- | --- | --- |
| `POST /admin/orders/{n}/ship` `{carrier, tracking_number}` | paid | `shipped_at`, tracking saved, "on its way" email with the number |
| `POST /admin/orders/{n}/deliver` | shipped | `delivered_at`, "delivered" email; the customer can now be invited to review |
| `POST /admin/orders/{n}/cancel` `{reason?}` | pending | the payment is cancelled at the provider, the stock goes back (`release_order`), email. If the customer paid a moment ago the provider says so and the cancel is refused (409) |
| `POST /admin/orders/{n}/refund` `{reason, restock}` | paid, shipped, delivered | the **full** amount goes back through `PaymentGateway.refund` (idempotency key derived from the payment), payment and order become `refunded`, the items return to stock if `restock` (product rows locked in id order, like checkout), email |
| `POST /admin/orders/{n}/notes` `{text}` | any | an internal note |
| `GET /admin/orders`, `/{n}` | | list with `status_counts` for the tabs; detail with events, shipment, payment |

**The payment provider is called inside the transaction**, so a provider failure is a **502** and *nothing* changes (the order
is still paid, the stock untouched) and the same click can be retried. Without a gateway the answer is a 503. Refunds are
full-amount only: partial refunds are out of scope.

**Events** (`order_events`: type, JSON `data`, `actor_id`, time) record `placed`, `paid`, `shipped`, `delivered`,
`cancelled`, `refunded` and `note`. Checkout, settlement and the expiry sweeper write them too, as does the automatic refund
of a payment that arrives for a cancelled order. The migration backfilled them for orders that existed before. The customer's
timeline shows the first six types and only the carrier and tracking number or the cancel reason from their data;
**notes, who did it, the refund reason and amounts stay admin-only** (tested through the API and in the browser).

**UI.** `/admin/orders` has a tab per status with counts ("To ship" is `paid`), search by number or email, and paging in the
URL. An order page has a progress stepper, the lines, a shipment panel, customer and payment, a history timeline and the note
box. The buttons shown depend on the state (`availableActions`); ship, refund and cancel open dialogs with their fields
(carrier and tracking number; reason and "put the items back in stock", which defaults to on for an order that has not left
the warehouse and off otherwise; an optional note), and a failed action keeps the dialog open.

## Inventory and stock

`PUT /admin/products/{id}/stock {quantity}` sets the number on the shelf (0 to 100 000) under the product row lock, the same
lock checkout takes to reserve stock, so a recount cannot be lost to a sale at the same moment (or the other way round).
It writes the number given, not a difference, so two people recounting cannot compound. `GET /admin/products` gained
`stock=low|out`. `/admin/inventory` lists what is on sale, lowest stock first, with an inline number field and Save per
product, tabs for all / low / sold out, and search. Stock stays per product, not per size.

## Customers

`GET /admin/customers` (search by name or email, `status`, `sort` newest / spent / orders / name), `GET /admin/customers/{id}`
(profile, how they sign in, their latest orders). "Orders" counts orders that were paid (including later refunded ones);
"spent" is what was paid for the ones that stand.

`POST /admin/customers/{id}/deactivate|activate` suspends or reinstates an account. **Suspending** sets `is_active = false`
and **revokes every refresh token** of that customer, so they are signed out everywhere (their short-lived access token stops
working at once too, because every request checks the account), cannot sign in, and cannot refresh until reinstated. Orders
and reviews are untouched. You cannot suspend yourself or another administrator (403); making someone an administrator stays a
command-line action.

## Reviews (moderation)

`GET /admin/reviews` (search by text, product or email; `status`, `rating`; counts per status) and
`POST /admin/reviews/{id}/hide|publish`. A hidden review leaves the product page and the average (recomputed in the same
transaction) and stays with its author, who is told it is hidden. The rules for writing reviews are in `docs/commerce.md`.

## Products

| Endpoint | |
| --- | --- |
| `GET /admin/products` | Every product, withdrawn ones included. `q` (substring of the name, or an exact id), `status` (`all`/`active`/`inactive`), `stock`, `category_id`, `sort` (`newest`, `price_asc`, `price_desc`, `stock_asc`), `page`, `page_size` (up to 100). `%` and `_` in `q` are literal. |
| `GET /admin/categories` | The article types a product can be filed under (grouped by master and sub category in the UI). |
| `GET /admin/products/{id}` | One product. |
| `POST /admin/products` | Multipart: the photo plus the details. Creates the product **and its search embedding**. |
| `PATCH /admin/products/{id}` | Only the fields that are sent change; `null` clears an optional one. Changing the category copies its master/sub/article-type names onto the product. The slug never changes (URLs stay stable). |
| `PUT /admin/products/{id}/image` | Replaces the photo and recomputes the embedding. |
| `POST /admin/products/{id}/deactivate`, `/activate` | Withdraw or restore. |

**Creating from a photo** (`services/admin_products.py`) reuses what search and ingestion already trust:

1. `read_image_upload`: declared type (JPEG, PNG, WebP), size limit (8 MB, enforced while the body streams in, also for
   the admin endpoints), then the hardened `load_image` (format from the bytes, pixel limit, EXIF stripped, orientation
   applied). A bad file is a 415, 413 or 422 before anything is stored.
2. 400 px and 800 px WebP thumbnails and the blur placeholder, exactly as ingestion makes them.
3. The FashionCLIP embedding, with the same preprocessing as search, so the new product is comparable with the catalogue
   and **a search with its own photo finds it first** (covered by a test and an e2e spec).
4. Files are written first (key `products/admin/<uuid>`), then the row is inserted; if the insert fails the files are
   removed again. Replacing a photo uses a new key, so browsers and caches never keep showing the old picture, and removes
   the old files (only those under `products/admin/`; dataset photos are left alone).

**Withdrawing, never deleting.** `order_items.product_id` is `ON DELETE RESTRICT`: past orders keep their product. A
withdrawn product disappears from listing, search, similar products, the sitemap and category filters, cannot be added to
a cart (404), and stays visible to admins with a "Withdrawn" badge. Restoring puts it back.

**Caches.** Every catalogue change (including stock and reviews) drops the Redis entries that could show stale data (cached
similar-product lists and the filter options, `SearchCache.invalidate_catalogue`). What is *not* invalidated: Next.js
caches the API responses behind its pages for a short time (`revalidate`: 60 s for listing and product pages, 5 min for
similar products), so the storefront can show a product, its price or its rating for up to a minute after a change (a page nobody has opened for a while may show its old copy once, then refresh: Next serves a stale entry while it revalidates). The API
refuses to sell a withdrawn product immediately; only the page lags. A product's review list is refetched by the browser on
load, so reviews themselves are current.

## Demo data

`make seed-demo` fills a development database so the dashboard has something to show: about 25 customers
(`demo-<name>@example.com`, all with the password `DemoPass12345`) and 75 to 80 orders over 45 days in **every state**, with
addresses, payments, tracking numbers, history events, stock decrements and reviews (`src/angel/cli/seed_demo.py`; the newest few
orders are fixed: one awaiting payment, two just paid). It is deterministic for a `--seed`, **refuses `APP_ENV=prod`**, does
nothing if the demo customers already exist, and `make seed-demo-clean` removes exactly what it made, gives the stock back and
recomputes the affected ratings. Options: `make seed-demo ARGS="--customers 40 --orders 120 --days 60 --seed 7"`. Refunding a
demo order works with `PAYMENTS_MODE=offline` (the default for development); a real Stripe key would refuse the made-up
payment ids.

## Tests

* API: `test_admin_access.py` (roles, live demotion, inactive admin, CLI), `test_admin_products_api.py` (access control for
  every endpoint, listing, create from a photo and found by search, validation and upload hardening, cleanup on failure,
  edits, photo replacement, withdrawal everywhere, cache invalidation, rate limit), `test_admin_orders_api.py`,
  `test_order_fulfillment_api.py` (every transition valid and invalid, a race, refunds with success, provider failure and
  restock on and off, cancel, emails, events, what the customer may see), `test_admin_dashboard_api.py` (the figures against
  hand-built orders, customers, suspending, stock, access), `test_reviews_api.py` (below), `test_demo_seed.py` (the data is
  consistent, repeatable and removable), `test_admin_units.py`.
* Web: `src/features/admin/*.test.ts(x)` (gate, nav, dashboard, orders and their dialogs, inventory, customers, reviews,
  list parameters, the figures' arithmetic), `components/shop-chrome.test.tsx`, `features/auth/landing.test.ts`.
* End to end: `apps/web/e2e/admin.spec.ts` and `admin-panel.spec.ts`; accessibility sweeps in `a11y.spec.ts`; see
  `docs/e2e.md`.

## Limits

No product deletion, bulk actions, audit log beyond the order history, product description or gallery of several photos, and
no S3 storage (photos go to local disk through the `Storage` interface, as in development). One administrator role: no finer
permissions, and nobody can be promoted from the UI. No discount codes, returns, tax or partial refunds. Emails are logged,
not sent.
