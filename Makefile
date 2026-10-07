SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose -f infra/docker-compose.dev.yml --env-file .env
API     := cd apps/api &&
WEB     := cd apps/web &&

.PHONY: help install infra infra-down infra-reset infra-logs migrate api web \
        lint format typecheck test test-api test-web openapi

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

web: ## Run the Next.js dev server on :3000
	$(WEB) npm run dev

lint: ## Lint and format-check API (ruff) and web (eslint)
	$(API) uv run ruff check . && uv run ruff format --check .
	$(WEB) npm run lint

format: ## Auto-format and auto-fix the API
	$(API) uv run ruff format . && uv run ruff check --fix .

typecheck: ## Typecheck API (mypy) and web (tsc)
	$(API) uv run mypy
	$(WEB) npm run typecheck

test: test-api test-web ## Run all tests (API tests need `make infra` + `make migrate`)

test-api:
	$(API) uv run pytest

test-web:
	$(WEB) npm test

openapi: ## Write the API's OpenAPI schema to docs/openapi.json
	$(API) uv run python -m lookalike.openapi ../../docs/openapi.json
