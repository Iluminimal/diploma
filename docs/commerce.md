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
`login_hint` chooses the email (`unverified:<email>` yields an unverified one). `APP_ENV=prod` refuses it. Limits:
`RATE_LIMIT_OAUTH` (default 30 per 5 minutes per address).

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
* Google is the only external provider, and a Google-only account cannot add a password (there is no profile or password
  reset page yet).
* Registration reveals whether an email exists (409); it is rate limited, and the alternative would need email verification.
* Emails are logged, not sent (`core/mail.py`).
* No reviews or refund UI. Orders can be looked at in the admin area (`docs/admin.md`) but not changed.
