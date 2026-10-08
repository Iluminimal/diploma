# Admin area

A deliberately small back office: manage products (list, create from a photo, edit, replace the photo, withdraw and
restore) and look at orders. API under `/api/v1/admin` (interactive docs: `/api/v1/docs`), UI under `/admin`.

## Getting an administrator

Registering through the app always creates a customer. The only way to get an administrator is the command line, so
there is no sign-up form to attack:

```bash
make create-admin EMAIL=you@example.com             # asks for a password (twice, not echoed)
make create-admin EMAIL=you@example.com ARGS=--keep-password   # promote an existing account, keep its password
ADMIN_PASSWORD=... make create-admin EMAIL=...      # non-interactive (CI); never pass a password as an argument
cd apps/api && uv run python -m lookalike.cli revoke-admin --email you@example.com
```

`users.role` is `customer` or `admin` (a CHECK constraint). The role is **read from the database on every admin request**
and is never copied into the access token, so demoting or deactivating someone takes effect immediately, even for a token
that has not expired. Everything admin is behind `get_current_admin` (`core/deps.py`): 401 without a valid token (or for
a deactivated account), 403 (`urn:lookalike:problem:forbidden`) for a customer. Admin routes also have their own rate limit
(`RATE_LIMIT_ADMIN`, default 120 per minute per client address).

## Products

| Endpoint | |
| --- | --- |
| `GET /admin/products` | Every product, withdrawn ones included. `q` (substring of the name, or an exact id), `status` (`all`/`active`/`inactive`), `category_id`, `sort` (`newest`, `price_asc`, `price_desc`, `stock_asc`), `page`, `page_size` (up to 100). `%` and `_` in `q` are literal. |
| `GET /admin/categories` | The article types a product can be filed under (grouped by master and sub category in the UI). |
| `GET /admin/products/{id}` | One product. |
| `POST /admin/products` | Multipart: the photo plus the details. Creates the product **and its search embedding**. |
| `PATCH /admin/products/{id}` | Only the fields that are sent change; `null` clears an optional one. Changing the category copies its master/sub/article-type names onto the product. The slug never changes (URLs stay stable). |
| `PUT /admin/products/{id}/image` | Replaces the photo and recomputes the embedding. |
| `POST /admin/products/{id}/deactivate`, `/activate` | Withdraw or restore. |
| `GET /admin/orders`, `GET /admin/orders/{number}` | Read-only (below). |

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

**Caches.** Every change drops the Redis entries that could show stale data (cached similar-product lists and the filter
options, `SearchCache.invalidate_catalogue`), so a withdrawn product leaves "You may also like" at once. Search results
themselves are not cached. What is *not* invalidated: Next.js caches the API responses behind its pages for a short time
(`revalidate`: 60 s for listing and product pages, 5 min for similar products), so the storefront can show a product for up
to a minute after it was withdrawn or repriced. The API refuses to sell it immediately; only the page lags.

## Orders

Read-only: a paginated list (newest first; filter by status; search by order-number prefix or customer email) and a
detail view with the lines as charged, the delivery address, the cancel reason and the payment record (provider,
reference, status, last error, refund). The payment `client_secret` is never returned. There is no cancel or refund
button: cancellation is automatic (unpaid orders expire) and refunds happen only through the payment provider path.

## The UI

`/admin/products` (+ `new`, `{id}`) and `/admin/orders` (+ `{number}`) in `src/features/admin`. List state (search, status,
sort, page) lives in the URL. The product form (React Hook Form + Zod) takes the price in dollars and sends cents; the
photo is checked in the browser (type, size) before upload and previewed. `AdminGate` shows signed-out visitors the login
page (with a way back) and customers a "no access" message, and their browser sends no admin request at all. That gate is
for the visitor's benefit; **the API is what enforces access**, and the e2e suite checks both. `/admin` is `noindex`,
disallowed in `robots.txt`, and covered by the edge proxy's session check.

## Tests

* API: `tests/test_admin_access.py` (roles, live demotion, inactive admin, CLI), `test_admin_products_api.py` (40 cases:
  access control for every endpoint, listing, create from a photo and found by search, validation and upload hardening,
  cleanup on failure, edits, photo replacement, withdrawal everywhere, cache invalidation, rate limit),
  `test_admin_orders_api.py`, `test_admin_units.py`.
* Web: `src/features/admin/*.test.ts(x)` (gate, list, form, payload conversion, orders, URL parameters).
* End to end: `apps/web/e2e/admin.spec.ts`; see `docs/e2e.md`.

## Limits

No product deletion, bulk actions, audit log, product description or gallery of several photos, and no S3 storage (photos
go to local disk through the `Storage` interface, as in development). One administrator role: no finer permissions.
