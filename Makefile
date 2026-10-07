SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose -f infra/docker-compose.dev.yml --env-file .env
API     := cd apps/api &&
WEB     := cd apps/web &&

.PHONY: help install infra infra-down infra-reset infra-logs migrate api web ingest \
        lint format typecheck test test-api test-web test-ml openapi api-types browser-check latency

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
	$(API) uv run uvicorn lookalike.main:create_app --factory --reload --reload-dir src \
		--host 127.0.0.1 --port 8000 --no-access-log

ingest: ## Ingest the dataset (needs `make infra migrate`); e.g. make ingest ARGS="--limit 500"
	$(API) uv run python ../../scripts/ingest.py $(ARGS)

web: ## Run the Next.js dev server on :3000
	$(WEB) npm run dev

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

browser-check: ## Drive the running app in headless Chromium: screenshots + visual-search flows (needs make api and make web)
	$(WEB) node scripts/browser-check.mjs ../../docs/screenshots

latency: ## End-to-end API latency report on the real catalogue; e.g. make latency DEVICE=mps
	$(API) uv run python ../../scripts/measure_api_latency.py --device $(or $(DEVICE),cpu)

openapi: ## Write the API's OpenAPI schema to docs/openapi.json
	$(API) uv run python -m lookalike.openapi ../../docs/openapi.json
