# Phase Status

## Phase 0 — Spec, foundation and synthetic data
- [ ] specs/requirements.md, design.md, tasks.md complete
- [ ] `make dev` → GET /health returns 200
- [ ] `make seed` populates DynamoDB Local (print counts)
- [ ] dataset.jsonl: ≥150 rows, ≥40 urgent, ≥25 non-English
- [ ] `npm run build` succeeds; all 3 routes render
- [ ] lint + all tests pass; CI green on GitHub
- [ ] PHASE_STATUS.md updated; merged; tagged phase-0-complete; pushed

## Phase 1 — AI classification engine and safety guardrails
- [ ] URGENT_CLINICAL recall = 100% on eval set (bedrock mode)
- [ ] Overall routing accuracy ≥ 90%
- [ ] Classification p95 latency < 2s
- [ ] All fallback tests prove fail-safe-to-Nurse
- [ ] Prompt-injection tests pass
- [ ] /docs/eval_report.md committed
- [ ] All tests + CI green; merged; tagged phase-1-complete; pushed

## Phase 2 — Patient UI, staff dashboards and real-time routing
- [ ] Playwright E2E (a)–(e) pass locally
- [ ] Lighthouse accessibility ≥ 95 on /patient
- [ ] Patient → dashboard real-time latency < 1s locally
- [ ] Patient UI verified at 768px and 375px; screenshots in /docs/screenshots
- [ ] Impact page computes hours + $ saved
- [ ] All tests + CI green; merged; tagged phase-2-complete; pushed

## Phase 3 — AWS deployment, hardening and demo readiness
- [ ] `make deploy` succeeds; CloudFront URL, HTTP API URL, WebSocket URL printed
- [ ] Playwright E2E passes against the LIVE URL
- [ ] eval.py (bedrock, live API): urgent recall 100%, accuracy ≥ 90%, p95 < 2s
- [ ] Pillow request from a phone appears on Housekeeping on another device in < 2s and NOT on Nursing
- [ ] CloudWatch dashboard + alarms exist
- [ ] All /docs demo + pitch assets committed
- [ ] PHASE_STATUS.md fully checked; merged; tagged phase-3-complete and v1.0.0; pushed
