SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose -f infra/docker-compose.dev.yml --env-file .env
API     := cd apps/api &&
WEB     := cd apps/web &&

.PHONY: help install infra infra-down infra-reset infra-logs migrate api web web-prod ingest create-admin e2e e2e-clean seed-e2e seed-demo seed-demo-clean lighthouse \
        lint format typecheck test test-api test-web test-ml openapi api-types latency

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.env:
	cp .env.example .env
	@echo "Created .env from .env.example"

install: ## Install API (uv) and web (npm) dependencies
	$(API) uv sync
	$(WEB) npm ci

infra: .env ## Start Postgres (pgvector) and Redis, wait until healthy
	$(COMPOSE) up -d --wait

infra-down: .env ## Stop infra (data is kept)
	$(COMPOSE) down

infra-reset: .env ## Stop infra and DELETE its data volumes
	$(COMPOSE) down -v

infra-logs: .env ## Follow infra logs
	$(COMPOSE) logs -f

migrate: ## Apply database migrations (needs `make infra`)
	$(API) uv run alembic upgrade head

api: ## Run the FastAPI server natively on :8000 (auto-reload)
	$(API) uv run uvicorn angel.main:create_app --factory --reload --reload-dir src \
		--host 127.0.0.1 --port 8000 --no-access-log

create-admin: ## Create or promote an administrator: make create-admin EMAIL=you@example.com
	@test -n "$(EMAIL)" || { echo "usage: make create-admin EMAIL=you@example.com"; exit 2; }
	$(API) uv run python -m angel.cli.admin create-admin --email "$(EMAIL)" $(ARGS)

ingest: ## Ingest the dataset (needs `make infra migrate`); e.g. make ingest ARGS="--limit 500"
	$(API) uv run python ../../scripts/ingest.py $(ARGS)

web: ## Run the Next.js dev server on :3000
	$(WEB) npm run dev

web-prod: ## Build and serve the web app as in production on :3000 (what e2e and Lighthouse measure)
	$(WEB) npm run build && npm run start

e2e-clean: ## Remove the customers, orders and products the e2e tests left in the dev database
	$(API) uv run python ../../scripts/e2e_clean.py

seed-e2e: ## Synthetic catalogue for e2e (CI): EMBEDDER=fake; refuses prod; e.g. make seed-e2e ARGS="--count 60"
	$(API) uv run python ../../scripts/seed_e2e.py $(ARGS)

seed-demo: ## Demo customers, ~80 orders in every state and reviews, for the admin dashboard (dev only)
	$(API) uv run python ../../scripts/seed_demo.py $(ARGS)

seed-demo-clean: ## Remove what seed-demo made (and put its stock back)
	$(API) uv run python ../../scripts/seed_demo.py --clean

e2e: ## Playwright end-to-end tests against the running stack; e.g. make e2e ARGS="e2e/cart.spec.ts"
	@echo "Needs: make infra migrate, the API (RATE_LIMIT_ENABLED=false PAYMENTS_MODE=offline OAUTH_MODE=fake OTP_DEV_CODE=000000 OTP_RESEND_SECONDS=0 make api) and make web-prod. See docs/e2e.md."
	$(WEB) npx playwright test $(ARGS)

lighthouse: ## Lighthouse on the running production build (make web-prod); e.g. make lighthouse ARGS="--runs 5"
	$(WEB) node scripts/lighthouse.mjs $(ARGS)

lint: ## Lint and format-check API + scripts (ruff) and web (eslint)
	$(API) uv run ruff check . ../../scripts && uv run ruff format --check . ../../scripts
	$(WEB) npm run lint

format: ## Auto-format and auto-fix the API and scripts
	$(API) uv run ruff format . ../../scripts && uv run ruff check --fix . ../../scripts

typecheck: ## Typecheck API (mypy) and web (tsc)
	$(API) uv run mypy
	$(WEB) npm run typecheck

test: test-api test-web ## Run all tests (API tests need `make infra` + `make migrate`)

test-api:
	$(API) uv run pytest

test-ml: ## Tests that load the real FashionCLIP model (downloads ~600 MB once)
	$(API) uv run pytest -m model

test-web:
	$(WEB) npm test

api-types: openapi ## Regenerate the web app's typed API client (apps/web/src/lib/api/schema.d.ts)
	$(WEB) npm run api:types



latency: ## End-to-end API latency report on the real catalogue; e.g. make latency DEVICE=mps
	$(API) uv run python ../../scripts/measure_api_latency.py --device $(or $(DEVICE),cpu)

openapi: ## Write the API's OpenAPI schema to docs/openapi.json
	$(API) uv run python -m angel.cli.openapi ../../docs/openapi.json
