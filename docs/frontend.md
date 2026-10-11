# Frontend (apps/web)

Storefront and visual search UI. Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query,
Zustand. `make web` serves it on :3000; it needs `make api` for data.

## Routes

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` | per request | storytelling home page, see "The home page" below |
| `/products` | per request | URL-synced filters, sort and pagination; everything in the query string; the place for free-text search results |
| `/c/{department}[/{group}[/{sub}[/{type}]]]` | per request | category pages, e.g. `/c/men/apparel/topwear/tshirts`: breadcrumbs (+ `BreadcrumbList` JSON-LD), drill-down sidebar with counts, the same filters and grid as `/products`; an unknown or empty category is a real 404 |
| `/products/{id}/{slug}` | per request | gallery, size selector, breadcrumbs, similar-products rail, metadata, JSON-LD (Product + BreadcrumbList) |
| `/search` | per request | visual search (client side) |
| `/login`, `/register` | per request | forms (React Hook Form + Zod); `?next=` is honoured for same-site paths only; "Continue with Google" appears when the API has it configured (`GET /auth/providers`), and `/login?error=` shows a message for the few known codes (see `docs/commerce.md`) |
| `/cart` | static shell | the cart is client data (guest or account), see below |
| `/checkout`, `/checkout/confirmation/{number}` | static shell | needs a session; demo payment |
| `/account/profile`, `/account/orders`, `/account/orders/{number}`, `/account/addresses`, `/account/wishlist` | static shell | need a session. The profile page: name, how you sign in (Google / password: set or change), delete account |
| `/admin/products` (+ `new`, `{id}`), `/admin/orders` (+ `{number}`) | static shell | administrators only; `noindex`; see `docs/admin.md` |
| `/sitemap/{n}.xml`, `/robots.txt` | per request | 10,000 products per sitemap file (`GET /catalog/sitemap` gives id, slug and last change); private and low-value paths are disallowed; `robots.txt` still works when the API is down |
| `/icon`, `/apple-icon`, `/opengraph-image` | static | generated (no binary assets) |

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
  sources) is not involved, and rewrites API photo URLs onto this site's own `/media` route (a rewrite in
  `next.config.ts`), so photos reuse the page's connection instead of opening one to a second origin. Pass `sizes` for
  every grid.
* **Sizes** (`catalog/sizes.ts`) come from the category (clothing, shoes, kids, belts; none for watches, bags, ...) because
  the catalogue has no size data. The API validates against the same table (`apps/api/.../services/sizes.py`); keep the
  two in step.

## The home page

Apple-style storytelling on top, Amazon-style shelves below. Nothing on it is invented: no discounts, ratings or
"best sellers" (the dataset has none); every product, count and sentence is real.

| Section | What it is |
| --- | --- |
| Promo strip (in the layout, every page) | one thin line: the real free-shipping threshold (`features/home/store-promises.ts`, mirrors the API's default) and a link to photo search |
| Hero | huge headline, "Search with a photo" (opens the photo picker) and Shop women / men; below it five real photos (newest in stock per department) that drift at different speeds as you scroll (`.drift`). The headline is plain text, never hidden: it is what the page is measured on |
| How it works | a pinned story. A 340vh track with a sticky full-screen stage; the track's scroll position (a named view timeline, `.story-*` in `globals.css`) plays the three steps: the photo appears, a scan line sweeps it and what was detected fades in, then its real nearest neighbours (`getSimilarProducts`) rise in. Phones, browsers without scroll-driven animation and reduced motion get the three captions and the finished result stacked |
| Departments | three large cards (Women / Men / Kids) that grow into place (`.zoom-in`) |
| Shelves | "Shop by category" pills (biggest article types from `GET /catalog/nav`), New arrivals, Under $25, three "<type> for <department>" rails, and **Recently viewed** |
| Photo band | the full drop zone on a dark band |
| Trust strip | free shipping over $100, photos are never stored, this is a demo store |

* **Recently viewed** is per browser: product pages record the last 12 products they showed in `localStorage`
  (`features/catalog/recently-viewed.ts`, `RecordView`); the shelf reads it with `useSyncExternalStore` and is absent on a
  first visit. Entries keep the price seen at that visit; clicking opens the live page. Blocked storage means no shelf.
* **All motion is CSS** (scroll-driven animations behind `@supports (animation-timeline: ...)` and
  `prefers-reduced-motion: no-preference`), so the page costs no animation script.
* `ProductRail` lives in `features/catalog/product-rail.tsx`, apart from the server-only API module, because the client-side
  Recently viewed shelf renders it.

## Navigation, categories and motion

**Categories.** `GET /catalog/nav` (`services/taxonomy.py`) turns the dataset's master > sub > article type tree into what
shoppers expect: three departments (Women = Women + Unisex, Men = Men + Unisex, Kids = Boys + Girls) with counts per node.
The 11 article-type names that sit under two parents in the data (a "Tshirts" under Belts, "Dresses" under Topwear) are
merged into the parent with the most products, so every name has one place and nothing is counted twice. `GET /products`
takes `department` and `category` (a node `path`); unknown values are a 404 problem. Display names ("Tshirts" -> "T-shirts",
"Apparel" -> "Clothing") are a small table in the taxonomy module.

* **Desktop menu** (`components/mega-menu.tsx`): the department names are ordinary links (they work before any script or
  data arrive); a panel with the category tree opens on hover or keyboard focus (ArrowDown enters it, Escape returns to the
  link). The tree is fetched in the browser (`useCatalogNav`, shared TanStack Query cache) rather than by the layout, so
  pages that are static stay static and a slow API cannot take the header down.
* **Phones** (`components/mobile-nav-menu.tsx`): a drawer that drills down level by level, each step sliding in.
* **Category pages** (`app/c/...`): the segment layout validates the URL against the nav *before* streaming, so a dead
  category answers 404 (a `notFound()` inside a page behind `loading.tsx` would already be a 200). Do not put a
  `loading.tsx` on `/products/[id]`: the page's 308 canonical redirect and 404 need the status line to be unsent.
* **Search bar** (`components/search-bar.tsx`): the camera button sits inside the field and opens the photo picker
  (`features/search/photo-search-dialog.tsx`, which reuses the whole `ImageDropzone` pipeline: upload, drop, paste, camera,
  HEIC). A photo can also be dropped on the bar or pasted into it. Suggestions are grouped: recent searches (localStorage,
  last five, never required) when empty; matching categories (with counts) above products when typing.

**Motion.** Restrained, and almost all CSS, because the first load budget is tight (see Performance).

| What | How |
| --- | --- |
| Scroll reveals of sections, tiles, grid rows below the first row | `Reveal` flips `data-in` through an `IntersectionObserver`; the transition is in `globals.css` |
| Hero recedes while scrolling | `.scroll-fade`, CSS scroll-driven animation (`animation-timeline: view()`); browsers without it show the hero unchanged |
| Header gains a shadow after scrolling | `.header-elevate`, CSS scroll-driven animation |
| Page transitions | React `<ViewTransition>` in `app/template.tsx` (new page fades up, old one fades out); the header is named `site-header` and stays put |
| Menu panel, suggestions, sticky add-to-cart bar, heart and cart-badge pops | CSS transitions and keyframes |
| A cart line sliding shut when removed | the only use of the `motion` library (`AnimatePresence`), inside the lazily loaded cart drawer and `/cart` |

Curves and durations are tokens (`--ease-out-expo`, `--ease-in-out-quart`; `components/motion/easing.ts` mirrors them). Rules
to keep: never start the largest element of the first screen hidden (it would delay the largest contentful paint: the hero
headline has no entrance); everything that starts hidden is shown without scripting and with `prefers-reduced-motion`
(`[data-reveal]` in `globals.css`; Motion alone would still fade opacity); view-transition animations are switched off under
reduced motion too.

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

* `npm test`: Vitest + Testing Library, 267 tests (filters, product helpers, JSON-LD and sitemap, error mapping, image
  normalization, search, cart, checkout, account, orders, admin screens and their payload logic, forms, the access gate).
* `make e2e`: Playwright, 52 end-to-end tests against a running stack: visual search, cart, checkout with the demo
  payment, login, admin, plus axe accessibility sweeps and keyboard checks. See `docs/e2e.md`; CI runs it on a seeded
  stack with a fake model.
* `make lighthouse`: Lighthouse on the production build (below).
* The screenshots in `docs/screenshots` are from the retired `browser-check` scripts (Phase 4 and 5); their flows are now
  e2e specs.

## Accessibility

Target: WCAG 2.1 AA. What is checked automatically, and what is not:

* **axe** (`e2e/a11y.spec.ts`, rules `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`) on home, listing (plain,
  filtered, empty), product, search (empty and with results), sign in, register, cart, 404, the mini-cart, the header
  suggestions, the phone filter sheet, account, checkout, confirmation and the admin screens, each in light and dark mode at
  390 px and 1440 px, with reduced motion so nothing is caught mid-animation. Zero violations.
* **Keyboard** (`e2e/keyboard.spec.ts`): the skip link is the first stop and moves focus into `<main>`; the first 25 tab
  stops of a page all show focus; the search combobox (arrows, Escape, Enter); dialogs keep focus inside, close on Escape and
  give focus back; the category toggles work with Enter and Space and announce their state; form errors are tied to their
  fields; reduced motion switches animations off.
* **Not covered**: a screen reader (VoiceOver, NVDA) was not used, nor a real phone with switch access or zoom. Automated
  tools find roughly a third of accessibility problems, so treat "zero axe violations" as a floor.

What the first run found, and the fixes:

| Finding | Fix |
| --- | --- |
| `nested-interactive` in the category filter: a checkbox inside a `<summary>` | the expand toggle is its own button (`aria-expanded`, `aria-controls`); the branch opens by itself while something inside is selected |
| Muted text on muted backgrounds 4.34:1 | `--muted-foreground` oklch(0.556) to oklch(0.5): 5.5:1 on `bg-muted`, 6:1 on white |
| "Paid" badge 3.75:1, "Withdrawn"/"Cancelled" badge 3.99:1 | `--success` oklch(0.55 0.13 155) to oklch(0.45 0.12 155) (5.5:1); `--destructive` to oklch(0.52 0.22 27) (5.0:1) |
| Focus ring 2.6:1 against white (and drawn at 50-60% opacity) | `--ring` light oklch(0.4) (9.2:1 solid, 3.1:1 at 60%); dark oklch(0.75) |
| Escape in the search box left a hidden suggestion highlighted, so Enter opened a product instead of searching (found by the keyboard spec) | Escape only dismisses the list and clears the highlight, and does not let the browser clear the field |
| `<main>` could not receive the skip link's focus; footer links had no focus style | `tabIndex={-1}` on `<main>`; focus rings on footer links |

Contrast ratios were computed from the OKLCH values, not guessed (the colours are CSS variables in `globals.css`).

## Performance

Measured with Lighthouse 13.5 (`scripts/lighthouse.mjs`, `make lighthouse`): mobile preset, simulated slow 4G and 4x CPU,
production build (`make web-prod`), API and database on the same machine, **median of 5 runs** (the spread was 91 to 93
for home). "Before" is the same script on the commit before this pass (`docs/perf/lighthouse-before.json`, 3 runs).

  | Page | Before | After | A11y | Best practices | SEO | LCP | First-load JS | Transfer |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Home | 86 | **91** | 100 | 100 | 100 | 3.5 s | 204 KB | 348 KB |
  | Listing | 87 | **91** | 100 | 100 | 100 | 3.6 s | 202 KB | 404 KB |
  | Listing, filtered | 87 | **92** | 100 | 100 | 100 | 3.4 s | 202 KB | 370 KB |
  | Product | 86 | **97** | 100 | 100 | 100 | 2.6 s | 216 KB | 367 KB |
  | Search | 91 | **92** | 100 | 100 | 100 | 3.3 s | 292 KB | 379 KB |
  | Cart | 79 | **95** | 100 | 100 | 63 | 3.0 s | 202 KB | 266 KB |
  | Sign in | 96 | **96** | 100 | 100 | 63 | 2.8 s | 241 KB | 310 KB |

  Raw numbers: `docs/perf/lighthouse.json`. The SEO score of 63 on cart and sign-in is Lighthouse reporting the
  deliberate `noindex` ("page is blocked from indexing"). The score moves a few points between machines and runs; the
  script exits non-zero if home, listing or product fall below 90.

**How the score was reached.** Blocking time is tiny (about 25 ms) and nothing shifts, so the whole gap was the LCP the
simulation reported (about 4.2 s), although the real LCP in a browser is 60-110 ms. What the investigation showed, in order
of effect:

1. **`scroll-smooth` on the "new arrivals" carousel.** With `scroll-snap` it starts a smooth-scroll animation while the page
   loads, and Chrome then reported the page's largest paint about 900 ms late (observed LCP 900 ms to 110 ms once removed;
   in isolation home went 88 to 92). Bisected by removing sections, then classes. `ScrollRail` now has a comment saying not to add it
   back; the arrow buttons scroll smoothly themselves (and respect `prefers-reduced-motion`).
2. **First-load JavaScript 276 KB to 204 KB (home).** `env.ts` imported zod just to check two URLs, and the listing URL
   parser shared a module with browser code (about 29 KB on every page): both are plain TypeScript or their own module now.
   Overlays that most visitors never open load on first use instead of with the page: cart drawer, mobile menu, account
   dropdown (all a plain button first, the real component on the first click, which opens it), phone filter sheet, camera
   dialog, desktop filter sidebar (phones never fetch it) and the toast renderer. The sort control is a native `<select>`
   (no Radix Select).
3. **Fewer early image bytes.** `content-visibility: auto` (`defer-render`) on sections and grid rows below the first screen:
   a short mobile page otherwise fetches every "lazy" photo up front (12 photos, 102 KB on home became 5, 37 KB). Thumbnails
   come through this site's origin (no second connection) and the monospace font is not preloaded.
4. **Cart layout shift 0.21 to 0**: the empty state now has the loading skeleton's height.

**After the home page and account pass** (5 runs, median, real catalogue; `docs/perf/lighthouse.json` is this run): home 91,
listing 90, filtered listing 91, category page 90, product 97, search 91, cart 91, sign in 94. The margins on home and
listing are thin (single runs range from 83 to 95). First-load FCP rose by one or two round trips (150 ms each) on most pages:
the global stylesheet is now 17 KB gzipped and the login HTML 15 KB, both above TCP's first flight of about 14.6 KB, so each
needs another round trip on the simulated 4G link; the promo strip alone pushed the login HTML over that line. Next time the
score drops, shrink the global CSS (move route-specific rules such as the home page's `.story-*` into a route-level CSS file)
before anything else.

**After the navigation and motion pass** (3 runs, median; `docs/perf/lighthouse.json` is this run): home 96, listing 91,
filtered listing 92, category page 91, product 94, search 92, cart 91, sign in 98; first-load JS 209 KB on home (+5 KB),
208 KB on the listing, 224 KB on the product page. A first version with the Motion library in the root layout cost about
55 KB on every page and pushed the product page from 97 to 91; scroll reveals, the hero and the sticky bar are CSS now and
Motion loads only with the cart. Cart has 250 KB because `/cart` shows the animated lines inline.

Conventions that keep it this way: new overlays (dialog, sheet, dropdown, popover) go behind `next/dynamic` and a plain
trigger; keep schema libraries out of modules that browser code shares; do not use `scroll-smooth` on snap containers;
check with `make lighthouse` after touching the header or the home page.

Not done: statically generating the home page (it reads the API at request time, see Routes), and Lighthouse in CI
(runner variance would make a hard gate flaky; `make lighthouse` is the gate).
