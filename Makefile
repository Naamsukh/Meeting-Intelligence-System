# Meeting Intelligence System — common commands
#
# Override host ports if 8000/3000 are taken (browser talks to the backend, so
# keep NEXT_PUBLIC_API_BASE in sync), e.g.:
#   make up BACKEND_PORT=8080 FRONTEND_PORT=3001 NEXT_PUBLIC_API_BASE=http://localhost:8080

COMPOSE ?= docker compose

# Defaults (exported so docker-compose substitution picks them up).
BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 3000
NEXT_PUBLIC_API_BASE ?= http://localhost:$(BACKEND_PORT)
export BACKEND_PORT FRONTEND_PORT NEXT_PUBLIC_API_BASE

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---- Setup ----
.PHONY: env
env: ## Create .env from .env.example (won't overwrite an existing one)
	@test -f .env || (cp .env.example .env && echo "Created .env — add your API keys")

# ---- Lifecycle ----
.PHONY: build
build: ## Build all images
	$(COMPOSE) build

.PHONY: up
up: env ## Build and start the full stack (db, redis, backend, worker, frontend)
	$(COMPOSE) up --build -d
	@echo "Frontend:  http://localhost:$(FRONTEND_PORT)"
	@echo "API docs:  http://localhost:$(BACKEND_PORT)/docs"

.PHONY: up-fg
up-fg: env ## Start the stack in the foreground (stream logs)
	$(COMPOSE) up --build

.PHONY: down
down: ## Stop and remove containers
	$(COMPOSE) down

.PHONY: clean
clean: ## Stop and remove containers + volumes (DESTROYS the database)
	$(COMPOSE) down -v

.PHONY: restart
restart: ## Restart the backend + worker
	$(COMPOSE) restart backend worker

.PHONY: ps
ps: ## Show running services
	$(COMPOSE) ps

# ---- Logs ----
.PHONY: logs
logs: ## Tail logs for all services
	$(COMPOSE) logs -f

.PHONY: logs-backend
logs-backend: ## Tail backend logs
	$(COMPOSE) logs -f backend

.PHONY: logs-worker
logs-worker: ## Tail worker logs
	$(COMPOSE) logs -f worker

# ---- Tests ----
.PHONY: test
test: test-backend test-frontend ## Run all tests

.PHONY: test-backend
test-backend: ## Run backend tests (uses an isolated *_test database)
	$(COMPOSE) exec backend pytest

.PHONY: test-frontend
test-frontend: ## Run frontend tests
	cd frontend && npm install && npm test

# ---- Database / migrations ----
.PHONY: migrate
migrate: ## Apply database migrations
	$(COMPOSE) exec backend alembic upgrade head

.PHONY: migration
migration: ## Autogenerate a migration: make migration m="add column"
	$(COMPOSE) exec backend alembic revision --autogenerate -m "$(m)"

.PHONY: downgrade
downgrade: ## Roll back the last migration
	$(COMPOSE) exec backend alembic downgrade -1

.PHONY: db-shell
db-shell: ## Open a psql shell on the dev database
	$(COMPOSE) exec db psql -U meeting -d meeting

# ---- Shells ----
.PHONY: backend-shell
backend-shell: ## Open a shell in the backend container
	$(COMPOSE) exec backend bash

.PHONY: seed
seed: ## Print the curl flow to sign up + upload the sample transcript
	@echo "BASE=http://localhost:$(BACKEND_PORT)"
	@echo "TOKEN=\$$(curl -s -X POST \$$BASE/auth/signup -H 'Content-Type: application/json' -d '{\"email\":\"me@example.com\",\"password\":\"secret123\"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)[\"access_token\"])')"
	@echo "curl -X POST \$$BASE/recordings -H \"Authorization: Bearer \$$TOKEN\" -F \"file=@docs/sample-meeting.txt\""
