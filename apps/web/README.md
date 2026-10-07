# Lookalike web

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
make browser-check  # headless Chromium against the running app: screenshots + upload/paste/camera/HEIC flows
```

- `src/app` routes and layout; Server Components by default, `providers.tsx` is the client boundary.
  `/`, `/products`, `/products/[id]/[[...slug]]` and `/search`; the home and search pages render per request
  because they read the API, which does not exist at build time.
- `src/features/<feature>` feature-based code (components, API calls, tests together):
  `catalog` (listing, filters, product page parts), `search` (visual search), `home`.
- `src/lib/api` generated OpenAPI types (`schema.d.ts`), the typed `openapi-fetch` client and RFC 7807 error handling.
- `src/lib/image-loader.ts` picks the API's pre-generated 400/800 px WebP, so Next's optimizer is not used.
- `src/components/ui` shadcn/ui primitives (add more with `npx shadcn@latest add <name>`).
- `src/lib/env.ts` validated environment (`NEXT_PUBLIC_API_URL`, see `.env.example`).
- Dark mode: class strategy via `next-themes`, defaults to the system preference.
- Tailwind runs through the PostCSS plugin (`postcss.config.mjs`).
