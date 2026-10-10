.PHONY: dev down logs test lint fmt seed eval eval-bedrock demo e2e build deploy destroy

PY := uv run --project backend python
API_URL ?= http://localhost:8000

dev: ## Start DynamoDB Local, backend and frontend; wait for /health
	docker compose up -d --build
	@echo "waiting for backend..."
	@for i in $$(seq 1 60); do curl -fsS http://localhost:8000/health >/dev/null 2>&1 && break; sleep 1; done
	@curl -fsS -w "\nGET /health -> %{http_code}\n" http://localhost:8000/health
	@echo "frontend: http://localhost:5173  backend: http://localhost:8000"

down:
	docker compose down

logs:
	docker compose logs -f backend

test:
	cd backend && uv run pytest
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint && npm run typecheck

fmt:
	cd backend && uv run ruff format . && uv run ruff check --fix .

seed:
	$(PY) scripts/seed.py

eval: ## Offline eval (mock classifier, in-process)
	$(PY) scripts/eval.py --mode mock

eval-bedrock: ## Eval against a running API (local or deployed): make eval-bedrock API_URL=https://...
	$(PY) scripts/eval.py --mode api --api-url $(API_URL)

demo:
	$(PY) scripts/demo.py --api-url $(API_URL)

e2e:
	cd frontend && npx playwright test

build:
	cd frontend && npm run build

deploy:
	./scripts/deploy.sh

destroy:
	./scripts/destroy.sh
