# Angel web

Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui.
See the [root README](../../README.md) for setup; from the repository root use `make web`.

```bash
npm run dev         # dev server on :3000
npm run lint
npm run typecheck   # next typegen && tsc --noEmit
npm test            # Vitest + Testing Library
npm run build
```

```bash
make api-types      # regenerate src/lib/api/schema.d.ts from the API's OpenAPI schema (committed)
make web-prod       # production build served on :3000: what e2e tests and Lighthouse measure
make e2e            # Playwright end-to-end tests (docs/e2e.md)
make lighthouse     # Lighthouse on the production build (results and method: docs/frontend.md)
```

- `src/app` routes and layout; Server Components by default, `providers.tsx` is the client boundary.
  storefront, account and checkout pages, `/admin/*` (administrators only, `docs/admin.md`), `sitemap.ts` and
  `robots.ts`; the home and search pages render per request because they read the API, which does not exist at build time.
- `src/features/<feature>` feature-based code (components, API calls, tests together):
  `catalog` (listing, filters, product page parts), `search` (visual search), `home`, `cart`, `checkout`, `account`,
  `orders`, `wishlist`, `auth`, `admin`, `seo`.
- `src/lib/api` generated OpenAPI types (`schema.d.ts`), the typed `openapi-fetch` client and RFC 7807 error handling.
- `src/lib/image-loader.ts` picks the API's pre-generated 400/800 px WebP and serves it through this site's `/media`
  route, so Next's optimizer is not used.
- Overlays (dialogs, sheets, dropdowns) load on first use behind `next/dynamic`; do not add `scroll-smooth` to a
  scroll-snap container. Both are explained in `docs/frontend.md` (Performance).
- `src/components/ui` shadcn/ui primitives (add more with `npx shadcn@latest add <name>`).
- `src/lib/env.ts` validated environment (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, see `.env.example`); plain
  TypeScript on purpose, because browser code imports it.
- `e2e/` Playwright specs, `scripts/lighthouse.mjs`.
- Dark mode: class strategy via `next-themes`, defaults to the system preference.
- Tailwind runs through the PostCSS plugin (`postcss.config.mjs`).
