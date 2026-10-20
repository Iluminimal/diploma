SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose -f infra/docker-compose.dev.yml --env-file .env
API     := cd apps/api &&
WEB     := cd apps/web &&

.PHONY: help install infra infra-down infra-reset infra-logs migrate api web web-prod ingest create-admin e2e e2e-clean seed-e2e seed-demo seed-demo-clean lighthouse \
        lint format typecheck test test-api test-web test-ml openapi api-types latency

help: ## Командуудын жагсаалтыг харуулах
	@grep -E '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.env:
	cp .env.example .env
	@echo ".env файлыг .env.example-ээс үүсгэлээ"

install: ## API (uv) болон web (npm)-ийн сангуудыг суулгах
	$(API) uv sync
	$(WEB) npm ci

infra: .env ## Postgres (pgvector), Redis-ийг асааж, бэлэн болтол хүлээх
	$(COMPOSE) up -d --wait

infra-down: .env ## Infra-г зогсоох (өгөгдөл хадгалагдана)
	$(COMPOSE) down

infra-reset: .env ## Infra-г зогсоож, өгөгдлийн volume-г УСТГАХ
	$(COMPOSE) down -v

infra-logs: .env ## Infra-ийн логийг дагах
	$(COMPOSE) logs -f

migrate: ## Өгөгдлийн сангийн migration хийх (`make infra` шаардлагатай)
	$(API) uv run alembic upgrade head

api: ## FastAPI server-ийг :8000 дээр шууд ажиллуулах (код өөрчлөгдөхөд автоматаар дахин ачаална)
	$(API) uv run uvicorn angel.main:create_app --factory --reload --reload-dir src \
		--host 127.0.0.1 --port 8000 --no-access-log

create-admin: ## Админ үүсгэх эсвэл хэрэглэгчийг админ болгох: make create-admin EMAIL=you@example.com
	@test -n "$(EMAIL)" || { echo "usage: make create-admin EMAIL=you@example.com"; exit 2; }
	$(API) uv run python -m angel.cli.admin create-admin --email "$(EMAIL)" $(ARGS)

ingest: ## Датасетийг ачаалах (`make infra migrate` шаардлагатай); жишээ: make ingest ARGS="--limit 500"
	$(API) uv run python ../../scripts/ingest.py $(ARGS)

web: ## Next.js хөгжүүлэлтийн server-ийг :3000 дээр ажиллуулах
	$(WEB) npm run dev

web-prod: ## Web-ийг production хэлбэрээр build хийж :3000 дээр ажиллуулах (e2e, Lighthouse үүнийг хэмждэг)
	$(WEB) npm run build && npm run start

e2e-clean: ## E2E тестийн dev өгөгдлийн санд үлдээсэн хэрэглэгч, захиалга, барааг устгах
	$(API) uv run python ../../scripts/e2e_clean.py

seed-e2e: ## E2E-д зориулсан хиймэл каталог (CI): EMBEDDER=fake; prod дээр ажиллахгүй; жишээ: make seed-e2e ARGS="--count 60"
	$(API) uv run python ../../scripts/seed_e2e.py $(ARGS)

seed-demo: ## Админ самбарт зориулсан demo хэрэглэгч, бүх төлөвтэй ~80 захиалга, сэтгэгдэл (зөвхөн dev)
	$(API) uv run python ../../scripts/seed_demo.py $(ARGS)

seed-demo-clean: ## seed-demo-ийн үүсгэснийг устгах (нөөцийг буцаана)
	$(API) uv run python ../../scripts/seed_demo.py --clean

e2e: ## Ажиллаж буй stack дээр Playwright end-to-end тест; жишээ: make e2e ARGS="e2e/cart.spec.ts"
	@echo "Шаардлага: make infra migrate, API (RATE_LIMIT_ENABLED=false PAYMENTS_MODE=offline OAUTH_MODE=fake OTP_DEV_CODE=000000 OTP_RESEND_SECONDS=0 make api) болон make web-prod. Дэлгэрэнгүй: docs/e2e.md."
	$(WEB) npx playwright test $(ARGS)

lighthouse: ## Ажиллаж буй production build дээр Lighthouse (make web-prod); жишээ: make lighthouse ARGS="--runs 5"
	$(WEB) node scripts/lighthouse.mjs $(ARGS)

lint: ## API + scripts (ruff), web (eslint)-ийн lint ба форматын шалгалт
	$(API) uv run ruff check . ../../scripts && uv run ruff format --check . ../../scripts
	$(WEB) npm run lint

format: ## API болон scripts-ийг автоматаар форматлаж засах
	$(API) uv run ruff format . ../../scripts && uv run ruff check --fix . ../../scripts

typecheck: ## API (mypy), web (tsc)-ийн төрлийн шалгалт
	$(API) uv run mypy
	$(WEB) npm run typecheck

test: test-api test-web ## Бүх тест ажиллуулах (API тестэд `make infra` + `make migrate` хэрэгтэй)

test-api: ## Зөвхөн API-ийн тест
	$(API) uv run pytest

test-ml: ## Жинхэнэ FashionCLIP загвар ачаалдаг тест (анх удаа ~600 MB татна)
	$(API) uv run pytest -m model

test-web: ## Зөвхөн web-ийн тест
	$(WEB) npm test

api-types: openapi ## Web-ийн төрөлтэй API клиентийг дахин үүсгэх (apps/web/src/lib/api/schema.d.ts)
	$(WEB) npm run api:types

latency: ## Жинхэнэ каталог дээрх API-ийн бүтэн хугацааны тайлан; жишээ: make latency DEVICE=mps
	$(API) uv run python ../../scripts/measure_api_latency.py --device $(or $(DEVICE),cpu)

openapi: ## API-ийн OpenAPI schema-г docs/openapi.json руу бичих
	$(API) uv run python -m angel.cli.openapi ../../docs/openapi.json
