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
  the catalogue has no size data. There is no add-to-cart or wishlist yet; those arrive with the cart phase.

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
  not slow content. Shrinking the header's client code is the next lever.
