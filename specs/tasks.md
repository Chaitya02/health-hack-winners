# Ting-ting — Task List

Tasks are built one at a time, in order. Each phase closes only when its exit criteria in `PHASE_STATUS.md` pass.

## Phase 0 — Spec, foundation and synthetic data
- 0.1 PHASE_STATUS.md with all exit criteria
- 0.2 specs/requirements.md (EARS)
- 0.3 specs/design.md (architecture, data model, API, events, safety, failures, AWS, thresholds)
- 0.4 specs/tasks.md (this file)
- 0.5 Ticket/classification schema: Pydantic models + TypeScript types
- 0.6 Backend skeleton: app factory, /health, settings, JSON logging, DynamoDB repository, pytest + ruff
- 0.7 Frontend skeleton: Vite + React + TS + Tailwind, 3 routes, API client, Vitest
- 0.8 docker-compose (backend, DynamoDB Local, frontend) + Makefile
- 0.9 scripts/seed.py: "4 West Med-Surg", rooms 401–420
- 0.10 backend/eval/dataset.jsonl: ≥150 labeled rows
- 0.11 GitHub Actions CI
- 0.12 README

## Phase 1 — AI classification engine and safety guardrails
- 1.1 Multilingual red-flag rules layer (`app/safety`) with normalization
- 1.2 Bedrock classifier: versioned prompt, delimiters, JSON validation, retry, timeout, mock classifier
- 1.3 Decision engine: rules + LLM merge, multi-intent, fallbacks, templated confirmations
- 1.4 API: POST /api/requests, queues, room tickets, PATCH ticket, metrics, auth, rate limit, CORS
- 1.5 Audit trail on tickets
- 1.6 scripts/eval.py → docs/eval_report.md
- 1.7 Tests: red flags × languages, schema, fallbacks, multi-intent, injection, low confidence

## Phase 2 — Patient UI, staff dashboards and real-time routing
- 2.1 Patient UI: large-font tiles, mic, text, language picker, i18n, confirmations, live status
- 2.2 Staff dashboards: live feed, timers, actions, escalate, nursing alerts, diverted counter, PIN login
- 2.3 Realtime: transport abstraction, local WS hub, reconnect, polling fallback
- 2.4 Admin / Impact page: live charts + calculator
- 2.5 scripts/demo.py scripted sequence
- 2.6 Component tests + Playwright E2E (a)–(e), Lighthouse, screenshots

## Phase 3 — AWS deployment, hardening and demo readiness
- 3.1 CDK: DataStack, ApiStack (HTTP + WebSocket + broadcaster), WebStack, ObservabilityStack, Bedrock IAM
- 3.2 make deploy / make destroy + credential docs
- 3.3 GitHub Actions deploy workflow (OIDC or documented manual deploy)
- 3.4 Live verification: Playwright against CloudFront, eval.py in bedrock mode against the live API
- 3.5 Docs: demo_script, architecture, impact_model, pitch_outline, qr_patient.png
- 3.6 Final README
