# Frontend (apps/web)

Storefront and visual search UI. Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query,
Zustand. `make web` serves it on :3000; it needs `make api` for data.

## Routes

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` | per request | storytelling home page, see "The home page" below |
| `/products` | per request | URL-synced filters, sort and pagination; everything in the query string; the place for free-text search results |
| `/c/{department}[/{group}[/{sub}[/{type}]]]` | per request | category pages, e.g. `/c/men/apparel/topwear/tshirts`: breadcrumbs (+ `BreadcrumbList` JSON-LD), drill-down sidebar with counts, the same filters and grid as `/products`; an unknown or empty category is a real 404 |
| `/products/{id}/{slug}` | per request | gallery, size selector, breadcrumbs, a star rating under the name, **customer reviews** (average, distribution, sort and paging; a form for people who bought it), similar-products rail, metadata, JSON-LD (Product with `aggregateRating` once rated, and BreadcrumbList) |
| `/search` | per request | visual search (client side) |
| `/login`, `/register`, `/forgot-password` | per request | `/login` has Phone and Email tabs (one-time codes, see `docs/accounts.md`); forms (React Hook Form + Zod); `?next=` is honoured for same-site paths only; "Continue with Google" appears when the API has it configured (`GET /auth/providers`), and `/login?error=` shows a message for the few known codes (see `docs/commerce.md`) |
| `/cart` | static shell | the cart is client data (guest or account), see below |
| `/checkout`, `/checkout/confirmation/{number}` | static shell | needs a session; demo payment |
| `/account/profile`, `/account/orders`, `/account/orders/{number}`, `/account/addresses`, `/account/wishlist` | static shell | need a session. The profile page: name, how you sign in (phone, email, Google, password: add / change / verify / remove), your devices, delete account. An order page has a progress stepper, the tracking number, the history and a "Write a review" link per delivered item |
| `/admin` (dashboard), `/admin/orders` (+ `{number}`), `/admin/products` (+ `new`, `{id}`), `/admin/inventory`, `/admin/customers` (+ `{id}`), `/admin/reviews` | static shell | administrators only; `noindex`; they have their own shell (sidebar, no shop header or footer: `ShopChrome` in the root layout skips the storefront chrome under `/admin`); see `docs/admin.md` |
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
  the catalogue has no size data. The API validates against the same table (`apps/api/src/angel/services/catalog/sizes.py`); keep the
  two in step.

## Design language (Apple-style)

* **Colour** (`:root` and `.dark` in `globals.css`): white and `#f5f5f7` bands, ink `#1d1d1f`, secondary text `#6e6e73`,
  hairlines `#d2d2d7`; dark mode is true black with `#1d1d1f` surfaces. One accent: Apple blue `#0071e3` for the primary
  button, focus ring and links (`#0066cc` / `#2997ff` as `--brand` for text). Contrast is checked by the axe sweeps: never dim
  text with `opacity-*` on a grey surface, use `text-muted-foreground`.
* **Buttons** (`components/ui/button.tsx`) are pills; the main action is the blue one, the rest are outlined or quiet.
* **Product tiles** are `#f5f5f7` rounded squares. The catalogue photos have white backgrounds, so they are drawn with
  `mix-blend-multiply` and melt into the tile (in dark mode the tile is white and the photo is drawn normally). Do the same for
  any new product picture.
* **Header** (`components/layout/site-header.tsx`): a 44px translucent bar (backdrop blur and saturation) with the logo on the left,
  small centred department links, and search, account and cart on the right. A hairline fades in under it as the page scrolls
  (a scroll-driven animation). The theme toggle lives in the footer.
* **Department menu** (`components/layout/mega-menu.tsx`) follows apple.com's global nav:
  * the entries in the bar are real links (they work before any script or data arrive);
  * hovering one opens **one shared flyout** after a short delay (120 ms); moving to another entry swaps the content at
    once (a crossfade) while the flyout's height animates to fit it (a `ResizeObserver` on the active content);
  * it closes 200 ms after the pointer leaves the bar and flyout, and at once-ish when the pointer goes to an entry
    without a flyout ("New");
  * while open the bar turns solid (`has-[.mega-flyout[data-open=true]]` on the header) so bar and flyout read as one surface,
    and the page behind is dimmed and blurred by `.mega-scrim` (it lets pointer events through, so moving down onto the page
    closes the menu); the links fade in one after another (`--i` on `.mega-item`);
  * touch: the first tap on an entry opens its flyout, the second follows the link (a click with `detail > 0` after a
    non-mouse `pointerdown`; Enter on the keyboard is unaffected);
  * keyboard: ArrowLeft / ArrowRight / Home / End move along the bar (and, with a flyout open, switch it along; an entry
    without one closes it), ArrowDown opens an entry and moves into it, Escape closes it and returns to the entry, focus
    leaving the menu closes it. Content that is not shown is `visibility: hidden`, so only the open department is in the tab order
    and the accessibility tree.
* **Search** (`components/layout/header-search.tsx`): the magnifier opens a full-width panel over the bar with a large field (the
  `overlay` variant of `SearchBar`), live suggestions, recent searches and quick links, and dims the page. Escape closes it and
  returns focus to the magnifier, wherever focus is. **Pressing `/` anywhere opens it** with the cursor in the field (not while
  typing in an input, textarea, select or dialog, not with Ctrl / Cmd / Alt held, and the slash is not typed into the field);
  the magnifier advertises it (`aria-keyshortcuts="/"`, tooltip "Search (press /)"). The panel is portalled to `<body>` because the header's backdrop blur would otherwise make
  it the containing block of anything `fixed` inside, and it loads on first click (so the header ships less JavaScript).
* **Footer**: pale grey, 12px type, four quiet columns and one line of fine print. Account links there are `prefetch={false}`:
  prefetched while signed out they cache the redirect to /login, which then sends a customer back to the login page right after
  they sign in.

## The home page

Apple-style storytelling on top, Amazon-style shelves below. (There is no announcement bar above the header.) Nothing on it is invented: no discounts, ratings or
"best sellers" (the dataset has none); every product, count and sentence is real.

| Section | What it is |
| --- | --- |
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

**Categories.** `GET /catalog/nav` (`services/catalog/taxonomy.py`) turns the dataset's master > sub > article type tree into what
shoppers expect: three departments (Women = Women + Unisex, Men = Men + Unisex, Kids = Boys + Girls) with counts per node.
The 11 article-type names that sit under two parents in the data (a "Tshirts" under Belts, "Dresses" under Topwear) are
merged into the parent with the most products, so every name has one place and nothing is counted twice. `GET /products`
takes `department` and `category` (a node `path`); unknown values are a 404 problem. Display names ("Tshirts" -> "T-shirts",
"Apparel" -> "Clothing") are a small table in the taxonomy module.

* **Desktop menu** (`components/layout/mega-menu.tsx`): the department names are ordinary links (they work before any script or
  data arrive); a panel with the category tree opens on hover or keyboard focus (ArrowDown enters it, Escape returns to the
  link). The tree is fetched in the browser (`useCatalogNav`, shared TanStack Query cache) rather than by the layout, so
  pages that are static stay static and a slow API cannot take the header down.
* **Phones** (`components/layout/mobile-nav-menu.tsx`): a drawer that drills down level by level, each step sliding in.
* **Category pages** (`app/c/...`): the segment layout validates the URL against the nav *before* streaming, so a dead
  category answers 404 (a `notFound()` inside a page behind `loading.tsx` would already be a 200). Do not put a
  `loading.tsx` on `/products/[id]`: the page's 308 canonical redirect and 404 need the status line to be unsent.
* **Search bar** (`components/layout/search-bar.tsx`): the camera button sits inside the field and opens the photo picker
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

## Motion and design pass (Phase 15)

Calm, Apple-style motion across the storefront; CSS first, off under reduced motion, no new library.

**Tokens** (`globals.css`): `--duration-{fast,base,slow}` (150, 300, 500 ms), `--ease-spring` (a CSS `linear()` spring) next to
the two existing curves, `.skeleton` (one shimmer class: dozens of repeated utility strings would double in the HTML and the
RSC payload), `.press-card`, the `shake`, `burst`, `scan`, `draw`, `grow-x`, `highlight` keyframes. Dialogs and sheets use the
house easing (a drawer slides its full width). **Rules**: every animation sits under the global reduced-motion kill-switch or
`prefers-reduced-motion: no-preference`; the Vitest setup runs with reduced motion on, so counted totals and the like show their
final value at once in tests (a test of an animation stubs `matchMedia` itself).

| Where | What |
| --- | --- |
| Add to cart (`features/cart`) | the button becomes a check mark (`Added`), a copy of the photo flies to the cart icon (`fly-to-cart.ts`, Web Animations, no library) which bounces, then the drawer opens; a missing size shakes and takes focus |
| Cart drawer and `/cart` | slides in, swipes away on touch (`components/ui/use-swipe-dismiss.ts`), the new line glows, free-shipping progress from `GET /checkout/shipping-methods`, totals and quantities count (`AnimatedNumber`, `AnimatedPrice`), **Undo** (an in-cart bar, not a toast: a toast is outside the open modal and out of reach of screen readers), **Save for later** moves a line to the wishlist |
| Product page | gallery cross-fades between photos, zooms around the mouse pointer, swipes on touch (ready for several photos); Product details and Delivery are `<details>` that slide (`Disclosure`; Delivery reads the real shipping methods); the card photo grows into the gallery (a named view transition, set by CSS on the hovered or focused card, `.press-card` in `globals.css`) |
| Cards | press feedback, the wishlist heart bursts when filled |
| Listing and search | a changed filter keeps the old grid dimmed (no skeleton flash, no `key` on the Suspense boundary), the count counts, the filter and sort bar sticks under the header, the filter sheet closes by swiping its title; a scanning band crosses the photo being searched and results rise in |
| Checkout | a stepper (checks, a summary beside each finished step, a connector that fills), the card number groups as typed and the card is named, a processing overlay (at least 900 ms, none under reduced motion), an animated confirmation with "What happens next", order progress connectors that fill, a pill that slides between account tabs |
| Forms | an error fades in and the control shakes once |
| Edge pages | one designed page for 404 and errors (`LostPage`: a floating mark, a search box, the way back), `global-error.tsx` |

**Phone navigation** (apple.com's): on a phone the header is the same four things in apple.com's order: logo on the left, then
search, bag and the menu button. The menu button (`MobileNav`) is two thin lines that turn into an X; pressed, a
full page opens under the bar (`MobileMenuPanel`, `.menu-panel` in `globals.css`): a search field, then Women, Men, Kids and
New in large type, each line fading in after the one above, with the small account links (Sign in, or Profile, Orders,
Wishlist, Addresses) at the bottom. Departments drill down level by level inside the page. While it is open the bar turns
solid, the page behind cannot scroll and is `inert`, Escape or the X or following a link closes it and focus returns to the
button. The page is portalled to `<body>` and fetched on the first press. Its search field closes the page and opens the search
panel through `useSearchPanel`; the bag opens the cart drawer. There is no bar along the bottom. Sign out, which lives in the
desktop account dropdown (the account icon is in the bar from md up), is a button on the account page on a phone. A bottom
tab bar (Instagram-style) was tried first and removed: it repeated what the header already offered.

**Lessons**: a `loading.tsx` above `/products/[id]` makes the product page stream, which turns its canonical-URL `permanentRedirect`
into a client-side redirect (two session refreshes in a row, the second rejected as a replay); a server component can neither pass
a function to a client component nor use `dynamic(..., { ssr: false })`; route-specific CSS (`features/home/story.css`,
`features/catalog/zoom.css`, `components/ui/disclosure.css`) is imported by the component that uses it, so other pages do not
download it; the product-card link is plain CSS rather than a client component (a client component per card is hydrated and
serialised once per card).

**Lighthouse after this pass** (production build, medians of 5, real catalogue; end of Phase 12 in brackets): home **89** (91),
listing 90-92 (92), product 91-92 (91-93), search 90 (91). First-load JS is 218 KB on home (213), 213 KB on the listing, 280 KB
on the product page (270). Blocking time stays under 60 ms and nothing shifts. The home page sits one point under the 90 gate
(single runs between 89 and 94): its simulated first paint is one round trip (150 ms) later than before, while the real first
paint is 0.3 s; the cause was not found by removing the tab bar or the per-card client component, nor by moving the
home-only CSS out of the global file, so the margin is recorded rather than hidden. `make lighthouse` exits non-zero until it is
back at 90.

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
* **Reviews** (`features/reviews`): the product page renders the first page on the server and the browser refetches a current
  copy at once (`initialDataUpdatedAt: 0`), so a new or hidden review shows without waiting for Next's 60 s cache. A signed-in
  customer's request carries their token and learns whether they bought it and what their own review is. The star picker is a
  group of radio buttons (arrow keys, labels), and `RatingStars` is a picture with the rating in words ("4.5 out of 5 stars").
* **Shared pieces** for orders: `OrderProgress` (stepper), `OrderTimeline` (history; the admin gets the same component with
  notes and actors), `StatusBadge`; for ratings `RatingStars`; the admin's `AdminPageHeader` gives every admin screen its `h1`.
* Test helpers: `src/test/api-mock.ts` (`stubApi` routes `fetch` by "METHOD /path"; use `respond(...)` for a route that will be
  called more than once, because a `Response` can only be read once), `src/test/render.tsx`.

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

* `npm test`: Vitest + Testing Library, 623 tests (filters, product helpers, JSON-LD and sitemap, error mapping, image
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

The admin and review screens added later were swept the same way and found three more:

| Finding | Fix |
| --- | --- |
| The product edit page's section headings were `h3` under the page's `h1` (`heading-order`) | they are `h2` |
| A "Sign in" link inside a sentence told itself apart from the text by colour alone (`link-in-text-block`) | underlined |
| The red "Refund order" button: red text on a faint red tint, 3.2:1 in dark mode (the soft destructive badge was the same recipe) | the destructive button is solid (white on the red, 6.0:1; black on the lighter dark-mode red, 7.3:1) and the destructive badge has lighter text in dark mode (6.5:1) |

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
needs another round trip on the simulated 4G link; a single extra line of markup in the layout can push the login HTML over that line. Next time the
score drops, shrink the global CSS (move route-specific rules such as the home page's `.story-*` into a route-level CSS file)
before anything else.

**After the navigation and motion pass** (3 runs, median; `docs/perf/lighthouse.json` is this run): home 96, listing 91,
filtered listing 92, category page 91, product 94, search 92, cart 91, sign in 98; first-load JS 209 KB on home (+5 KB),
208 KB on the listing, 224 KB on the product page. A first version with the Motion library in the root layout cost about
55 KB on every page and pushed the product page from 97 to 91; scroll reveals, the hero and the sticky bar are CSS now and
Motion loads only with the cart. Cart has 250 KB because `/cart` shows the animated lines inline.

**After the admin panel, ratings and reviews** (3 runs, median, on the 60-product synthetic catalogue of the hermetic e2e
stack, so the absolute numbers are not comparable with the real-catalogue rows above; `make lighthouse` on your own data is
the gate): home 93, listing 92, product 92, each with 100 for accessibility, best practices and SEO, CLS 0, TBT under 40 ms;
first-load JS 212 KB on home, 206 KB on the listing, 270 KB on the product page. The product page carries the reviews section
(the star picker, the review form and its validation are one client chunk with the page; the section is `defer-render`), which
is where its extra 50 KB or so comes from. `RatingStars` is plain markup and SVG on cards, so listings did not grow. The admin
area is a separate set of routes, so none of it is downloaded by shoppers.

Conventions that keep it this way: new overlays (dialog, sheet, dropdown, popover) go behind `next/dynamic` and a plain
trigger; keep schema libraries out of modules that browser code shares; do not use `scroll-smooth` on snap containers;
check with `make lighthouse` after touching the header or the home page.

Not done: statically generating the home page (it reads the API at request time, see Routes), and Lighthouse in CI
(runner variance would make a hard gate flaky; `make lighthouse` is the gate).
