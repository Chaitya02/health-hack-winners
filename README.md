# Ting-ting — AI Call Bell Router

> HealthHack Ops Unleashed · Challenge 2 (Inpatient Services)
> **Synthetic data only. No PHI.**

Up to 60–70% of call bell presses are for non-clinical needs: water, a blanket, a TV that won't work. Ting-ting gives patients a large-font bedside interface where they can type, speak or tap their request in 7 languages. An AI triage router sends each request straight to the right team (Housekeeping, Food Services, Unit Clerk/IT or the Primary Nurse). A deterministic multilingual safety layer runs before and after the LLM, so anything that might be clinical always reaches the nurse.

## Quick start (local)

Prerequisites: Docker, [uv](https://docs.astral.sh/uv/), Node 22+.

```bash
cp .env.example .env    # optional; defaults work (mock classifier)
make dev                # DynamoDB Local + FastAPI (:8000) + Vite (:5173)
make seed               # synthetic unit "4 West Med-Surg", rooms 401–420
```

- Patient tablet (home page): http://localhost:5173/ shows room 401 (set `VITE_DEFAULT_ROOM` per device); any room: http://localhost:5173/patient/410
- Staff dashboards: http://localhost:5173/nursing, `/housekeeping`, `/food`, `/it` (demo PIN 2468)
- Admin / impact: http://localhost:5173/admin
- API health: http://localhost:8000/health

## Development

```bash
make test     # pytest + vitest
make lint     # ruff + eslint + tsc
make eval     # classifier evaluation on backend/eval/dataset.jsonl
```

## Repository layout

| Path | Contents |
|---|---|
| `specs/` | requirements (EARS), design, task list |
| `backend/` | FastAPI app: `api`, `classifier`, `safety`, `models`, `repo`, `realtime`; tests; eval dataset |
| `frontend/` | React + Vite + TypeScript + Tailwind SPA |
| `infra/` | AWS CDK app |
| `scripts/` | seed, eval, demo, deploy |
| `docs/` | architecture, eval report, impact model, demo script, pitch |

See `PHASE_STATUS.md` for build progress.
