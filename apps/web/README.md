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

- `src/app` routes and layout; Server Components by default, `providers.tsx` is the client boundary.
- `src/features/<feature>` feature-based code (components, API calls, tests together).
- `src/components/ui` shadcn/ui primitives (add more with `npx shadcn@latest add <name>`).
- `src/lib/env.ts` validated environment (`NEXT_PUBLIC_API_URL`, see `.env.example`).
- Dark mode: class strategy via `next-themes`, defaults to the system preference.
- Tailwind runs through the PostCSS plugin (`postcss.config.mjs`).
