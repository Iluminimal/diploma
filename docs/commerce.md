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
* Registration reveals whether an email exists (409); it is rate limited, and the alternative would need email verification.
* Emails are logged, not sent (`core/mail.py`).
* No reviews or refund UI. Orders can be looked at in the admin area (`docs/admin.md`) but not changed.
