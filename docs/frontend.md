# Frontend (apps/web)

Storefront and visual search UI. Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query,
Zustand. `make web` serves it on :3000; it needs `make api` for data.

## Routes

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` | per request | hero with upload drop zone, department tiles, New arrivals ("most recently added": the dataset has no release dates) |
| `/products` | per request | URL-synced filters, sort and pagination; everything in the query string |
| `/products/{id}/{slug}` | per request | gallery, size selector, breadcrumbs, similar-products rail, metadata, JSON-LD (Product + BreadcrumbList) |
| `/search` | per request | visual search (client side) |
| `/login`, `/register` | per request | forms (React Hook Form + Zod); `?next=` is honoured for same-site paths only |
| `/cart` | static shell | the cart is client data (guest or account), see below |
| `/checkout`, `/checkout/confirmation/{number}` | static shell | needs a session; demo payment |
| `/account/orders`, `/account/orders/{number}`, `/account/addresses`, `/account/wishlist` | static shell | need a session |

* **One canonical product URL.** The API id is the lookup key; `/products/41885` or a stale slug answer with a 308 to
  `/products/41885/alma-women-blue-kurta-60000`. (The numeric suffix of the slug is the dataset id, not the API id.)
* **The URL is the filter state.** `features/catalog/filters.ts` parses untrusted query strings tolerantly (bad values are
  dropped, never an error, never a 422 from the API) and serializes back to the shortest URL. The sidebar, the
  mobile sheet, sort, active-filter chips and pagination all read and write that one model. Chips and pagination are plain
  links, so they work without JavaScript.
* **Pages that read the API are rendered per request** (`force-dynamic` on `/` and `/search`): there is no API at build
  time (CI, Docker image builds). The API client's fetch cache (`revalidate`) keeps them cheap.
* **Images.** The API serves each photo as WebP at 400 and 800 px with a blur placeholder. `src/lib/image-loader.ts`
  hands `next/image` the matching file for the requested width, so Next's optimizer (which also refuses `localhost`
  sources) is not involved. Pass `sizes` for every grid.
* **Sizes** (`catalog/sizes.ts`) come from the category (clothing, shoes, kids, belts; none for watches, bags, ...) because
  the catalogue has no size data. The API validates against the same table (`apps/api/.../services/sizes.py`); keep the
  two in step.

## Accounts, cart and checkout

How the pieces fit (API side: `docs/commerce.md`):

* **Same origin.** `next.config.ts` rewrites `/api/v1/*` to the API, and the browser only ever calls its own origin. That
  makes the API's httpOnly refresh cookie first-party. Server components still call the API directly
  (`API_INTERNAL_URL`); the older search code keeps its cross-origin URL.
* **Session.** `features/auth`: the access token lives in a Zustand store, in memory only. On load `bootstrapSession`
  trades the refresh cookie for a token (`lk_session` is a non-secret marker so a signed-out visitor makes no request).
  `refreshSession` is single-flight: refresh tokens rotate, so two parallel refreshes would look like token theft.
  `lib/api/browser.ts` is the typed `openapi-fetch` client for authenticated calls; it adds the bearer token and, on a
  401, refreshes once and repeats the request.
* **`src/proxy.ts`** redirects `/account/*` and `/checkout/*` to `/login?next=...` without the marker cookie. It is a
  convenience, not security: the API checks every call.
* **Cart** (`features/cart`): server-side for guests (cookie) and accounts, so there is one code path; signing in merges the
  guest cart on the server. TanStack Query holds it; quantity changes and removals are optimistic and roll back with a toast
  when the API refuses (stock). Rapid taps overlap, so the server's answer is applied only after the last request finishes.
  The header drawer (`next/dynamic`) is only downloaded when opened.
* **Wishlist** (`features/wishlist`): accounts only. Guests are sent to sign in and come back to the same page; they never
  trigger a request. Optimistic like the cart.
* **Checkout** (`features/checkout`): address, shipping, then a card form that is labelled **"Demo payment, no real
  charge"**; card values are validated for shape but never sent anywhere. "Pay now" creates the order (stock is reserved
  server side, `Idempotency-Key` per attempt, kept across a dropped connection and renewed after any definite answer) and
  calls `simulate-payment`, which only exists when the API runs with `PAYMENTS_MODE=offline`. The confirmation page polls
  until the order is paid. No Stripe code or keys are in the web app.
* Test helpers: `src/test/api-mock.ts` (`stubApi` routes `fetch` by "METHOD /path"), `src/test/render.tsx`.

## Visual search

State: the photo, chosen category, refinement text and filters live in a small Zustand store
(`search/search-store.ts`); the results are a TanStack Query keyed by those values. The photo only ever exists in
memory (an object URL, revoked on replace/remove) and is never written to storage; it is sent to the API only for the
search itself.

Ways in (all go through `normalizeImage`, then the store): file picker, drag and drop (anywhere on the page), paste (⌘/Ctrl V),
the OS camera sheet on touch devices (`<input capture="environment">`), and a `getUserMedia` dialog on desktop
(stream stopped on close; denied/missing camera is explained).

`normalizeImage` makes every input an upload the API accepts:

* HEIC/HEIF (iPhone) is decoded natively where the browser can (Safari) and otherwise with `heic-to` (a ~3 MB WASM
  bundle, loaded by dynamic import only when a HEIC file shows up), then encoded as JPEG.
* Everything is downscaled to a 1600 px long edge (the model sees 224 px) and re-encoded as JPEG, flattening transparency
  onto white. EXIF orientation is applied by the decoder.

Results: grid with a "NN% match" badge, a "Detected: Shirts" chip (the zero-shot guess is a suggestion; picking a
category, from the top three or any article type, applies it as `article_type`), quick filter chips plus a sheet for colour,
price, season and occasion, and a "refine with words" box (adds `query`, which switches the request to hybrid search).
Filter changes are debounced 400 ms and results are cached per (photo, filters, category, text), so going back to an
earlier combination does not spend one of the API's 20 image searches per minute. Rate-limit, size, type and network
errors are shown in plain words (`lib/api/errors.ts`).

Not done: cropping the photo before searching (SPEC §5 mentions "preview with crop").

## Checks

* `npm test`: Vitest + Testing Library (filters, product helpers, JSON-LD, error mapping, image normalization, search
  request building, product card, filter fields, pagination, search bar, drop zone, detected chip, whole search view).
* `make browser-check-commerce`: the commerce flows at 390 px and 1440 px (see below). Last run: 51/51. Needs
  `make api` with `PAYMENTS_MODE=offline` (set in `.env`; `.env.example` has it) and `make web`.
  * guest adds to the cart (size required, drawer, badge), quantity stepper and stock limit, guest wishlist click goes to
    sign in and back, registering merges the guest cart, wishlist save, new address at checkout, express shipping changes the
    total, demo payment to confirmation, order history and detail, address default/delete, mobile menu, sign out, protected
    page redirect, wrong password message, sign in again, session survives a reload, no console errors.
* `make browser-check`: Chromium against the live app; saves screenshots to `docs/screenshots` and asserts the
  flows below. Last run: 26/26.
  * a catalogue photo's own product ranks first with a match badge; override sends `article_type`; refinement uses
    `/search/hybrid`; a gender chip adds `gender`; paste, drop, fake-camera capture and a real HEIC file all start a search;
    a text file is refused with a message; filters, sort and page land in the URL; product JSON-LD parses;
    no console errors on any page, in light and dark, at 390 px and 1440 px.
* Lighthouse (mobile preset, simulated slow 4G, production build, API on the same machine):

  | Page | Performance | Accessibility | Best practices | SEO |
  | --- | --- | --- | --- | --- |
  | Home | 88 | 100 | 100 | 100 |
  | Listing | 87 | 100 | 100 | 100 |
  | Product | 93 | 100 | 100 | 100 |
  | Search | 94 | 100 | 100 | 100 |

  Home and listing are just under the spec's 90 target: the simulated LCP is ~3.9 s although the real LCP measured in the
  browser is 50-125 ms, so the gap is Lighthouse's CPU/network throttling of the ~230 KB of JavaScript (React, Next, Radix),
  not slow content. Shrinking the header's client code is the next lever. These numbers predate the account menu and cart
  button in the header (a little more client JavaScript) and have not been re-measured.
