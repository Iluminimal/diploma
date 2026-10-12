# Accounts, cart, checkout and orders

Everything is under `/api/v1`; errors are RFC 7807 problems (`application/problem+json`) like the rest of the API.
Interactive docs: `/api/v1/docs`. The browser side is described in `docs/frontend.md`.

## Running it

```bash
make infra && make migrate && make api     # .env needs PAYMENTS_MODE=offline (copied from .env.example)
make web
make e2e                                   # whole flow in Chromium (see docs/e2e.md)
make test                                  # API integration tests need make infra
```

## Sessions

| | |
| --- | --- |
| Access token | HS256 JWT, 15 min, claims `sub`, `jti`, `iat`, `exp`, `typ`. Sent as `Authorization: Bearer`; the web app keeps it in memory. |
| Refresh token | 256 random bits, only its SHA-256 is stored. Cookie `lk_refresh`: `HttpOnly; SameSite=Lax; Path=/api/v1/auth` (+ `Secure` when `APP_ENV=prod`), 30 days. |
| Rotation | Every refresh issues a new token. Presenting an already used one inside 10 s (two tabs) is refused; later it revokes the whole login (`family_id`). |
| `lk_session` | A non-secret marker cookie (`1`) next to the refresh cookie, so the web app's edge proxy can redirect signed-out visitors. Grants nothing. |
| Passwords | argon2id, 10 to 128 characters, no composition rules. Unknown emails cost the same time as wrong passwords; failed logins are also limited per email (5 per 5 min, counted on failure, reset on success). |
| CSRF | Bearer endpoints are immune. Endpoints that act on a cookie (auth, cart) refuse a browser request whose `Origin` is not in `CORS_ORIGINS`, on top of `SameSite=Lax`. |

Endpoints: `POST /auth/register|login|refresh|logout`, `GET /auth/me`. Register and login return the access token in
the body and set the cookies; both merge the guest cart.

### Your account (profile, password, deletion)

All three need a bearer token. `GET /auth/me` and the session responses carry `avatar_url`, `has_password` and `providers`
(e.g. `["google"]`).

| Endpoint | What it does |
| --- | --- |
| `PATCH /auth/me` `{full_name}` | rename |
| `PUT /auth/password` `{current_password?, new_password}` | set or change the password. An account with a password must send the current one (wrong: **403**, not 401, because the person is signed in; counted against the same per-email failure limit as login). A Google-only account may just set one. Every other login ends (all refresh tokens revoked) and this browser gets a new session |
| `DELETE /auth/me` `{confirm, password?}` | anonymizes the account: email becomes `deleted-<id>@deleted.invalid`, name "Deleted user", password, photo, Google link, addresses, wishlist, cart and refresh tokens removed, `is_active = false`. Orders stay (`orders.user_id` is `RESTRICT`, and the shop keeps its records) with their own address and price snapshots. The typed email (or phone number, for an account with no email) must match; a password is required if there is one. Administrators are refused (no lock-out). The address can be registered again |

The web app's `/account/profile` page uses them. Google's profile photo (https URLs only, up to 500 characters) is stored in
`users.avatar_url` and refreshed at each Google sign-in; without one the header shows initials.

## Sign in with Google

Authorization code flow with PKCE, run by the API; the browser only follows redirects, so it works without scripts and no
token ever appears in a URL.

1. The button on `/login` and `/register` is a link to `GET /api/v1/auth/google/start?next=/where/to/return`. The API sets a
   signed ten-minute cookie `lk_oauth` (`HttpOnly; SameSite=Lax; Path=/api/v1/auth/google`) holding the `state`, a `nonce`,
   the PKCE verifier and the return path, and redirects to Google.
2. Google redirects to `GET /api/v1/auth/google/callback` **on the web origin** (Next proxies `/api/v1` to the API, so the
   cookies below are first-party). The API compares `state` with the cookie, exchanges the code with the client secret and
   verifier, checks the ID token's issuer, audience, expiry and nonce, and requires a verified email. (The token's signature
   is not checked: it comes straight from Google's token endpoint over TLS, which Google's documentation accepts.)
3. It finds the user by `(google, sub)`; otherwise by email; otherwise creates one. Then it issues the normal session
   (`lk_refresh`, `lk_session`), merges the guest cart, clears `lk_oauth`, and redirects to `next`. The web app's
   `AuthBootstrap` trades the refresh cookie for an access token on load, like after any reload.
4. Every failure is a redirect to `/login?error=<code>` (`google_denied`, `google_failed`, `google_unverified`,
   `account_disabled`), never a JSON page and never a reason. The login page maps known codes to a sentence and ignores
   the rest.

**Existing password accounts.** If Google's verified email belongs to an account made with a password, Google is linked to
it and **its password is removed**. Nobody verifies the email of a password account here, so whoever registered an address
first may not own it; after linking, the real owner signs in with Google and a squatter's password no longer works. Accounts
that only use Google have no password (`users.password_hash` is null), so password login fails for them exactly like an
unknown email. Identities live in `oauth_identities` (`provider`, Google's stable `sub`, unique together): the `sub`, not
the email, identifies the person.

**Set it up** (the button is hidden until both values exist):

1. [Google Cloud Console](https://console.cloud.google.com/) > create a project.
2. APIs & Services > OAuth consent screen: User type External, publishing status Testing, add your own Google account
   under Test users (only they can sign in until the app is published).
3. Credentials > Create credentials > OAuth client ID > **Web application**. Authorized redirect URI:
   `http://localhost:3000/api/v1/auth/google/callback` (add the real domain's callback for production). No JavaScript
   origin is needed.
4. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, run `make migrate` (new
   `oauth_identities` table, nullable `password_hash`), restart `make api`, open `/login`.

`OAUTH_MODE=fake` replaces Google with an in-process stand-in for tests and CI: "signing in" skips the consent screen and
`login_hint` chooses the email (`unverified:<email>` yields an unverified one, `<email>;picture=https://...` gives it a photo). `APP_ENV=prod` refuses it. Limits:
`RATE_LIMIT_OAUTH` (default 30 per 5 minutes per address).

## Reviews

Only people who **bought** a product can review it: an order of theirs that is `paid`, `shipped` or `delivered` must contain
it (a refunded or cancelled order does not count). One review per person per product (a unique constraint), with a 1 to 5
rating, an optional headline (120 characters) and text (2 000), shown as first name and last initial ("Ada L."), never an
email.

| Endpoint | |
| --- | --- |
| `GET /products/{id}/reviews` | Published reviews (`sort` newest / highest / lowest, paged) with the average and the count per star. Signed in, it also says whether you bought the product and returns **your own review even if it is hidden** (`viewer`); that response is `no-store` |
| `POST /products/{id}/reviews` | 201; 403 `review-not-allowed` if you have not bought it; 409 `review-exists` if you already reviewed it. Rate limited (`RATE_LIMIT_REVIEW`, 20 per hour) |
| `PATCH` / `DELETE /reviews/{id}` | Your own only (someone else's is a 404, not a 403, so ids reveal nothing) |
| `/admin/reviews…` | Moderation: `docs/admin.md` |

`products.rating_average` and `rating_count` are **kept in step with the published reviews in the same transaction**, with
the product row locked first (the lock checkout and stock changes use), so concurrent reviews cannot overwrite each other's
recount (tested by posting four at the same moment). They come back in `ProductOut`, so product cards show stars and
`aggregateRating` goes into the product page's JSON-LD without another query, and only once there is a published review (an
empty rating is not valid structured data). When an account is deleted its reviews stay, shown as "Deleted user".

On the product page the first page of reviews is rendered on the server (for the first paint and crawlers) and the browser
immediately fetches a current copy, so a new or hidden review shows at once even though the page itself may be up to a minute
old (Next's cache). The rating on cards and in the page header, which come from the product record, can lag by that minute (and a product page nobody has opened for a while may show its old copy once before it refreshes).

## Cart, wishlist, addresses

* **Cart** (`/cart`, `/cart/items`, `/cart/items/{id}`): one per user, or per guest through the `lk_cart` cookie (random id,
  hash stored). Lines show the *current* price and stock (`max_quantity`, `issue`: `out_of_stock` | `low_stock`); the cart
  is never rejected for a stale line, checkout is. Adds and changes are checked against stock and `CART_MAX_QUANTITY`
  (409 `insufficient-stock` with `available`). Sizes are validated per category.
* **Merge on login:** same product and size add up, never beyond stock; a line already over a limit is kept and flagged.
* **Wishlist** (`/wishlist`, `PUT|DELETE /wishlist/{product_id}`): idempotent, accounts only.
* **Addresses** (`/addresses`): up to 10, exactly one default (partial unique index), other people's ids are 404.

## Checkout and orders

`POST /checkout` (header `Idempotency-Key`) turns the cart into a **pending order that holds the stock**:

1. a per-user advisory lock serialises one shopper's checkouts;
2. that shopper's older unpaid orders have their payment cancelled at the provider (outside any transaction), then
   their stock is released; if one turns out to have been paid, the request fails with 409 `payment-in-progress`;
3. in one transaction: product rows are locked in id order, the cart is re-validated, stock is decremented, the order is
   written with a **snapshot** of name, price, size, image and the shipping address;
4. the payment is created (outside the transaction) and stored. A replay with the same key resumes at whatever is missing.

Totals are computed on the server (standard shipping free from `FREE_SHIPPING_THRESHOLD_CENTS`, express never). The cart
is cleared (only the lines that were bought) when the payment succeeds. Unpaid orders are cancelled after
`ORDER_PENDING_TTL_MINUTES` by a background task that is safe to run in several processes. `GET /orders` and
`GET /orders/{number}` are owner-only.

### The life of an order

`pending` (stock held, awaiting payment) → `paid` → `shipped` → `delivered`; `pending` → `cancelled` (expired, replaced by a
newer checkout, cancelled by an administrator, payment cancelled); `paid`, `shipped` or `delivered` → `refunded`. A paid order
is never "cancelled": its money goes back and it becomes `refunded`. A payment that arrives for an order that is already
cancelled is refunded automatically. The administrator's actions are in `docs/admin.md`; the state is a CHECK constraint on
`orders.status`.

Each change is recorded in **`order_events`** in the same transaction as the change (`placed`, `paid`, `shipped`, `delivered`,
`cancelled`, `refunded`, and administrators' `note`). `OrderOut` carries `shipped_at`, `delivered_at`, `refunded_at`,
`carrier`, `tracking_number` and a **safe timeline**: only the six public types, and from their data only the carrier and
tracking number of a shipment and the reason a cancel happened. Notes, the administrator's name, refund reasons and amounts
never reach the customer's API.

The customer's order page (`/account/orders/{number}`) shows a progress stepper (Placed, Paid, Shipped, Delivered, or ending
in Cancelled / Refunded), the tracking number, the lines, and the history; once delivered, each line has a "Write a review"
link. The customer is emailed when the order ships (carrier and tracking number), is delivered, is cancelled and is refunded
(`core/mail.py`; logged in development).

## Payments

`PAYMENTS_MODE=offline` (default in `.env.example`): no provider. `POST /checkout/orders/{number}/simulate-payment` marks
an order paid through the same settlement code a webhook uses; it answers 404 with a real gateway, and the API refuses to
start with offline mode when `APP_ENV=prod`. This is what the web app's demo "Pay now" calls.

`PAYMENTS_MODE=stripe`: real PaymentIntents behind `PaymentGateway` (`payments/`). Needs `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET`; `POST /webhooks/stripe` verifies the signature over the raw body, stores the event id and
applies the change in one transaction (exactly once however often Stripe redelivers), handles `payment_intent.succeeded`,
`payment_failed` (order stays open) and `canceled`, and refunds a payment that arrives for an order that was already
cancelled or has the wrong amount. **This path is covered by tests with signed payloads and a fake gateway, but has not
been run against Stripe**: there were no keys. The web app has no Stripe code; wiring Stripe.js would need a payment
element and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## Known limits

* Stock is per product, not per size (the dataset has none). Listing and similar-product caches (60 s to 5 min) can show
  "in stock" briefly after the last unit was reserved.
* Google is the only external provider. There is no "forgot password" and no email verification (emails are only logged),
  so a password can only be set or changed while signed in.
* Registration reveals whether an email exists (409); it is rate limited, and the alternative would need email verification.
* Emails are logged, not sent (`core/mail.py`).
* Refunds are always for the full amount; there are no returns, discount codes or tax. Refunds go through whatever
  `PaymentGateway` is configured (offline in development), and against real Stripe the path is tested with a fake gateway only.
* Reviews have no photos, "helpful" votes or replies, and cannot be reported by customers (only hidden by an administrator).
