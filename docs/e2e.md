# End-to-end tests (Playwright)

`apps/web/e2e`, run with `make e2e`. They drive a real browser (Chromium) against a running stack: API, web app, Postgres
and Redis. 104 tests:

| File | Covers |
| --- | --- |
| `visual-search.spec.ts` | a photo search shows results, match badges and a detected category; the user can override the category; words refine (hybrid) and filter chips narrow; paste, drop and a fake camera start a search; a non-image is refused; through the API a catalogue photo finds its own product first |
| `cart.spec.ts` | size required, drawer and badge, quantity stepper stopping at the stock limit, guest cart survives a reload, guest cart merges on sign-in, wishlist asks a guest to sign in |
| `checkout.spec.ts` | checkout needs an account; an empty cart cannot be paid; address, express shipping, **demo payment to the confirmation page and the order in the account**; a repeated checkout or payment never makes a second order; another customer cannot see an order (app and API) |
| `login.spec.ts` | register (short password refused), duplicate email refused, wrong then right password, return to the page that asked for sign-in, `next` cannot leave the site, session survives a reload, sign-out clears the session and the cart |
| `admin.spec.ts` | customers and visitors are kept out (UI and API); create a product from a photo, edit, replace the photo, withdraw and restore; order with its payment record |
| `admin-panel.spec.ts` | an administrator who signs in through the form lands on `/admin` (a customer on the home page, an administrator headed for `/cart` still goes there); the admin shell has no shop header or footer and a way back to the store, and works on a phone; every new admin endpoint refuses visitors and customers; **an order goes paid → shipped → delivered while the customer sees tracking and the timeline, then reviews it, a visitor sees the review, an administrator hides and republishes it, the author edits it**; only buyers can review; a rating shows on the card, the page and in the JSON-LD; **refunding puts the stock back** and an unpaid order can be cancelled; notes stay admin-only; the dashboard's figures, links and period; suspending and reinstating a customer (login and a live token are refused); setting stock from the inventory page |
| `navigation.spec.ts` | the department menu (hover, one shared flyout with instant switching, solid bar, closing on New or on leaving, keyboard, phone drill-down) leads to category pages with breadcrumb and counts; the sidebar drills down; an unknown category is a real 404; the camera button inside the search bar starts a photo search; the search box suggests categories and remembers searches |
| `google.spec.ts` | sign in with Google (the API's `OAUTH_MODE=fake` stand-in): a new customer lands on the page they asked for, the guest cart comes along, an existing password account is linked and its password stops working, cancelling and unverified emails end on the login page with a message, hostile `?error=` and `?next=` are harmless. Skips when the API has no Google configured |
| `home.spec.ts` | the headline, the hero's photo button, the departments / category pills / shelves, the pinned story (sticky stage while scrolling; stacked list under reduced motion), Recently viewed appearing after a product visit |
| `profile.spec.ts` | the profile page; rename shows in the header and survives a reload; change password (wrong current refused, old password stops working); a Google account sees "Connected" and adds a password; delete account (wrong password refused, then signed out for good); the account menu leads to the profile |
| `auth-pages.spec.ts` | "Sign up with Google" wording, password strength and show/hide, the Google hint after a failed login, `?next=` kept between the two pages |
| `a11y.spec.ts` | axe (WCAG 2.1 A/AA + best practices) on every kind of screen (including category pages, the open department menu, the photo dialog and the profile page with its dialogs, **and the whole admin area: dashboard, orders, order page, inventory, customers, a customer, reviews, and the ship and refund dialogs with their errors showing; on the storefront a delivered order page and a product page with reviews as a visitor, as the buyer with the form, and with their own review**), in light and dark, at 390 and 1440 px |
| `keyboard.spec.ts` | skip link, visible focus, the search panel (combobox, `/` opens it, a slash typed in a field is just a slash, Escape returns focus to the magnifier), arrow keys along the nav bar, dialog focus, category toggles, form errors, reduced motion |

## Against your development stack

The tests register their own customers, so the API must not rate limit registration, and checkout needs the offline
payment gateway. Production-like web output is also needed (the dev server is slow and adds an overlay).

```bash
make infra migrate                                            # Postgres + Redis
RATE_LIMIT_ENABLED=false PAYMENTS_MODE=offline OAUTH_MODE=fake make api   # terminal 1 (environment beats .env)
make web-prod                                                 # terminal 2: build + serve on :3000
make e2e                                                      # terminal 3 (ARGS="e2e/cart.spec.ts" for one file)
make e2e-clean                                                # afterwards: remove what the tests created
```

This is the real catalogue and the real FashionCLIP model. `global-setup.ts` creates the e2e administrator
(`e2e-admin@example.com`, password in `e2e/support/env.ts`) with the same CLI an operator uses. `make e2e-clean` deletes
`e2e-*@example.com` customers with their orders, and the products named `E2E ...` (the API can withdraw a product but not
delete it) with their photos. It refuses to run when `APP_ENV=prod`.

## Hermetic (what CI does)

CI has no dataset and no model download, so the job (`.github/workflows/ci.yml`, `e2e`) seeds 60 synthetic products and
runs the API with `EMBEDDER=fake`:

```bash
# an empty database with pgvector, then:
EMBEDDER=fake PAYMENTS_MODE=offline OAUTH_MODE=fake RATE_LIMIT_ENABLED=false (cd apps/api && uv run alembic upgrade head)
make seed-e2e ARGS="--count 60"       # drawn garments, thumbnails, embeddings from the served thumbnails
# start the API and `make web-prod`, then
E2E_FAKE_MODEL=1 make e2e
```

`FakeEmbedder` (`lookalike.ml.fake`) makes a vector from the pixels: identical images match perfectly, different ones are
unrelated. So search "works" but means nothing, and the browser re-encodes every upload (JPEG, 1600 px) which a pixel hash
cannot survive. Hence `E2E_FAKE_MODEL=1` skips only the UI assertion that a re-encoded photo finds its product first; the
API test with the original bytes still runs in both modes. `APP_ENV=prod` refuses `EMBEDDER=fake`, and the seeder refuses
to run in prod. The failure artifacts (HTML report, traces, API and web logs) are uploaded for 7 days.

To run the same thing locally without touching your data, use a second database and Redis db, the fake model and other
ports. That is how the job was validated (52/52 at first, 84/84 after the Apple-style redesign, 104/104 after the admin panel).
The recipe, which leaves a running `make api` and `make web` alone:

```bash
docker exec lookalike-postgres-1 psql -U lookalike -d postgres -c "CREATE DATABASE lookalike_e2e"
export APP_ENV=test DATABASE_URL=postgresql+asyncpg://lookalike:lookalike@localhost:5433/lookalike_e2e \
  REDIS_URL=redis://localhost:6379/1 EMBEDDER=fake PAYMENTS_MODE=offline OAUTH_MODE=fake RATE_LIMIT_ENABLED=false \
  JWT_SECRET=e2e-only-jwt-secret-0123456789-0123456789 MEDIA_DIR=/tmp/e2e-media MEDIA_BASE_URL=http://localhost:8001/media \
  CORS_ORIGINS=http://localhost:3001 WEB_BASE_URL=http://localhost:3001 \
  GOOGLE_REDIRECT_URI=http://localhost:3001/api/v1/auth/google/callback \
  E2E_API_URL=http://localhost:8001 E2E_BASE_URL=http://localhost:3001 E2E_FAKE_MODEL=1
(cd apps/api && uv run alembic upgrade head && uv run python ../../scripts/seed_e2e.py --count 60 \
  && uvicorn lookalike.main:create_app --factory --port 8001 --no-access-log &)       # uv run uvicorn ...
# a copy of apps/web (so `next build` does not overwrite your dev server's .next), built against :8001:
NEXT_PUBLIC_API_URL=http://localhost:8001 API_INTERNAL_URL=http://localhost:8001 npm run build
NEXT_PUBLIC_API_URL=http://localhost:8001 API_INTERNAL_URL=http://localhost:8001 PORT=3001 npm run start &
(cd apps/web && npx playwright test)
```

`GOOGLE_REDIRECT_URI` (and `WEB_BASE_URL`) must name the web origin you test against: the default points at `:3000`, and the
Google specs then end on `/login?error=google_failed`. The tests only ever add data (customers, products named `E2E ...`),
so start from a fresh database when you want a clean run.

## Writing specs

* `fixtures.ts`: `account` (a customer made through the API), `shopperPage` / `adminPage` (a page already signed in, by
  moving the session cookies into the browser: no slow UI sign-up), `products` (in-stock apparel), `api`.
* `newProduct`: a product made through the admin API for this one test, withdrawn when it ends. Use it whenever a test
  changes stock, buys something it must be able to count, or reviews. It is filed under **Handbags**, not apparel, so that
  the shared `products` fixture ("the newest in-stock apparel") never picks it up; the fake embedder cannot match a
  re-encoded thumbnail to a photo it did not make the vector from, so such a product at the top of the list breaks the
  visual-search spec.
* Pick products with `pickProduct` so parallel tests rarely buy the last unit of the same one. Sizes differ (kids, shoes):
  use `chooseSize`/`addToCart` rather than hard-coding "M".
* Fixtures that must not collide use unique emails (`uniqueEmail`). Generated test images come from `support/images.ts`
  (valid PNGs, no dependency).
* Do not add `scroll-smooth` to a scroll-snap container (see `docs/frontend.md`, Performance).

## Not covered

HEIC upload (needs a HEIC file and macOS `sips`; unit-tested in `normalize-image.test.ts`), Stripe (offline gateway only),
and anything with a screen reader or a real phone.
