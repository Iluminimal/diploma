# Lookalike: image-based similar clothing recommendation + e-commerce

Monorepo: `apps/web` (Next.js, ALREADY CREATED with create-next-app 16: React Compiler on,
Tailwind, src dir, App Router. Do not recreate it), `apps/api` (FastAPI, to be created),
`scripts/`, `docs/`, `infra/`.
Full requirements live in `@docs/SPEC.md`. Read the relevant sections before each phase.

## Stack (use latest stable versions; check current docs, don't rely on memory)
- Web: Next.js App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui,
  TanStack Query, Zustand, React Hook Form + Zod
- API: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 async, asyncpg, Alembic, uv, Ruff
- DB: PostgreSQL + pgvector (HNSW, cosine), Redis
- ML: `patrickjohncyh/fashion-clip` via transformers/PyTorch, 512-dim, L2-normalized

## Architecture rules
- Backend layers: routes -> services -> repositories -> models. No business logic in routes.
- Pydantic schemas separate from ORM models. ML behind an interface (`ml/`), model loaded
  once in lifespan, inference run in a threadpool.
- Frontend: feature-based folders, Server Components by default, typed API client
  generated from OpenAPI.
- API versioned under `/api/v1`, errors in RFC 7807 style, structured JSON logs.

## Working rules
- Work ONE PHASE at a time. Never start the next phase until I say so.
- Start each phase in plan mode: show a short plan and assumptions, wait for approval.
- No TODO stubs or placeholder code in finished work. Everything must run end to end.
- Add tests for critical logic. Run lint, typecheck, and tests before saying "done".
- Never commit secrets. Keep `.env.example` updated.
- End each phase with: what was built, key decisions, how to verify, what's next.
- Commit at the end of each phase with a clear message.
- Do not run `npm audit fix --force`.

## Commands
- `make infra`: start Postgres (pgvector) and Redis via docker compose
- `make api`: run FastAPI locally (native, so PyTorch can use Apple MPS)
- `make web`: run Next.js locally
- `make test`, `make lint`, `make typecheck`
- `make ingest`: run the dataset ingestion script
- Full-stack `docker compose` is for deployment, not daily development

## Environment
- Developer machine: Apple Silicon (M1) Mac. Use the `mps` device for PyTorch, fall back
  to CPU. All Docker images must support linux/arm64.

## Gotchas
- Kaggle `styles.csv` has malformed rows: parse with `on_bad_lines="skip"`.
- Dataset has no prices or stock: generate them deterministically (seeded) in the seed script.
- pgvector filtered search: verify iterative scan support in the installed version.
- Never persist user-uploaded search images unless the user opts in.
- Never commit venvs, `node_modules`, `.next`, model weights, or the dataset images.