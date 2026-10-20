# Angel web

Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui.
Суулгах заавар үндсэн [README](../../README.md)-д байна. Repository-ийн root-оос `make web` гэж ажиллуулна.

```bash
npm run dev         # хөгжүүлэлтийн server :3000
npm run lint
npm run typecheck   # next typegen && tsc --noEmit
npm test            # Vitest + Testing Library
npm run build
```

```bash
make api-types      # API-ийн OpenAPI-аас src/lib/api/schema.d.ts-ийг дахин үүсгэнэ (commit хийгддэг)
make web-prod       # production build-ийг :3000 дээр ажиллуулна (e2e, Lighthouse үүнийг хэмждэг)
make e2e            # Playwright end-to-end тест (docs/e2e.md)
make lighthouse     # production build дээрх Lighthouse (үр дүн, арга: docs/frontend.md)
```

## Folder бүтэц

- `src/app` — route-ууд ба layout. Анхдагчаар Server Component; `providers.tsx` нь client хил.
  Дэлгүүр, бүртгэл, checkout хуудсууд, `/admin/*` (зөвхөн админ, `docs/admin.md`), `sitemap.ts`, `robots.ts`.
  Нүүр болон хайлтын хуудас хүсэлт болгонд шинээр үүсдэг, учир нь API-аас уншдаг бөгөөд build хийх үед API байдаггүй.
- `src/features/<нэр>` — үйлдэл бүрийн код (component, API дуудлага, тест нэг дор):
  `catalog` (жагсаалт, шүүлтүүр, барааны хуудас), `search` (зургаар хайх), `home`, `cart`, `checkout`, `account`,
  `orders`, `wishlist`, `auth`, `admin`, `seo`.
- `src/components/ui` — shadcn/ui-ийн суурь хэсгүүд (шинэ нэмэх: `npx shadcn@latest add <нэр>`).
- `src/lib/api` — OpenAPI-аас үүссэн төрлүүд (`schema.d.ts`), төрөлтэй `openapi-fetch` клиент, RFC 7807 алдааны боловсруулалт.
- `src/lib/image-loader.ts` — API-ийн урьдчилан үүсгэсэн 400/800 px WebP-г сонгож, энэ сайтын `/media` route-оор дамжуулна.
  Тиймээс Next-ийн зургийн optimizer ашиглагддаггүй.
- `src/lib/env.ts` — шалгагдсан орчны хувьсагчид (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `.env.example`-ийг харна).
  Browser код импортлодог тул зориудаар энгийн TypeScript.
- `e2e/` — Playwright тестүүд, `scripts/lighthouse.mjs` — Lighthouse скрипт.

## Анхаарах зүйл

- Dialog, sheet, dropdown зэрэг давхарга хэсгүүд анх ашиглах үедээ `next/dynamic`-аар ачаалагддаг. Scroll-snap
  container-д `scroll-smooth` нэмж болохгүй. Хоёулангийнх нь шалтгаан `docs/frontend.md` (Performance) хэсэгт бий.
- Dark mode: class стратеги (`components/theme`), анхдагчаар системийн тохиргоог дагана.
- Tailwind нь PostCSS plugin-оор (`postcss.config.mjs`) ажиллана.
