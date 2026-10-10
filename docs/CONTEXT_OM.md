# Ting-ting: Context for Om

Read this first, then `docs/TEAM_PLAN.md` for the full task split. If you use an AI coding assistant, give it this file plus `docs/TEAM_PLAN.md` and `specs/design.md` as starting context.

## What we're building
Ting-ting is an AI call-bell router for hospital inpatients (HealthHack Ops Unleashed, Challenge 2).

**The problem:** 60–70% of call-bell presses are non-clinical (water, blanket, TV), and each one pulls a nurse away.

**What Ting-ting does:**
- The patient types, speaks, or taps a request on a bedside tablet, in any of 7 languages (en, es, hi, gu, zh, ht, pt).
- An AI router sends it straight to the right team: **Nursing, Housekeeping, Food or IT**.
- The staff dashboard updates in real time.

**The core idea we pitch:** the AI handles the pillows, and fixed safety rules protect the patients.
- Multilingual red-flag rules run before and after the LLM.
- They can only escalate a request toward nursing, never away from it.
- Any failure goes to the nurse: a timeout, bad output or low confidence.

**Synthetic data only. No real patient data.**

## Status
- **Phases 0–2 are done:** spec, classifier with safety rules, patient UI, staff dashboards, admin impact page, realtime updates and E2E tests.
- **Classifier:** CI and local runs use the **mock** keyword classifier. The real model is Claude Haiku 4.5 on Amazon Bedrock, which is pending AWS credentials.
- **Phase 3 (AWS deployment)** is on hold.
- **Now:** we're building the 8 user stories from `User Stories.xlsx`, split between Chaitya and you. See `docs/TEAM_PLAN.md`.

## Your tasks (track B: everything the patient sees and hears)

| # | Task | Waits for |
|---|---|---|
| O1 | Split `PatientPage.tsx` into `components/patient/*`, no behavior change | C0 (Phase 2 merged to `main`) |
| O2 | New buttons: Thirsty, Comfort, Food & meds, Emotional support (+ Bathroom) | C1 (data contract), O1 |
| O4 | "Mirror" status tracker: stepper, ETA, cancel / still waiting (**taken by Chaitya**) | C2 (status API), O1 |
| O3 | Gray out tiles for NPO patients with a reason, plus a fall-risk message | C3 (rules), O2 |
| O5 | Spoken status updates and waiting music, with on/off toggles | O4 |
| O6 | Accessibility layouts from the patient profile (**taken by Chaitya**) | O2 |
| O7 | Screensaver after 3 minutes idle (**taken by Chaitya**, see below) | O1 |

**Start with O1.** It only needs `main`, and it makes every later task easier.

If you're waiting on one of Chaitya's tasks, build against a mocked response in a test fixture (see `frontend/src/test/fixtures.ts`), or move to the next unblocked task.

## Setup
**Prerequisites:** Docker, [uv](https://docs.astral.sh/uv/), Node 22+, and the GitHub CLI if you want it.

```bash
git clone https://github.com/Chaitya02/health-hack-winners.git   # ask Chaitya for access if needed
cd health-hack-winners
git checkout main && git pull
cp .env.example .env      # defaults are fine (mock classifier, no AWS needed)
make dev                  # DynamoDB Local + FastAPI :8000 + Vite :5173 (Docker)
make seed                 # demo unit "4 West Med-Surg", rooms 401–420
cd frontend && npm ci && cd ..   # for running lint, tests and Playwright outside Docker
```

**Where to look:**
- **Patient screen:** http://localhost:5173/ (the home page shows room 401). For another room use http://localhost:5173/patient/410. Rooms 410–418 have demo profiles: 410 NPO, 412 fall risk, 414 low vision, 416 speech difficulty, 418 can't write.
- **Staff dashboards:** http://localhost:5173/nursing (also `/housekeeping`, `/food` and `/it`). The demo PIN is **2468**.
- **Admin page:** http://localhost:5173/admin. The admin PIN is **1357**.
- **API health check:** http://localhost:8000/health
- **Quick demo:** open the patient screen and the housekeeping dashboard side by side, then tap "Pillow". It appears on Housekeeping within a second.

**Commands:**
```bash
make test     # pytest + vitest
make lint     # ruff + eslint + tsc
make eval     # classifier safety gate (must stay 100% urgent recall)
make e2e      # Playwright (needs make dev + make seed running)
make down     # stop containers
```

## How a request flows
```
Patient tablet ─POST /api/requests─▶ FastAPI
   ├─ quick-tap tile? → fixed mapping (no AI)       backend/app/services.py (tiles move to tiles.py in C1)
   └─ free text → safety rules → classifier → safety rules → decision
                                                     backend/app/safety/, backend/app/classifier/
   → one ticket per intent saved to DynamoDB         backend/app/repo/dynamo.py
   → realtime event on channels dept:<dept> and room:<room>
                                                     backend/app/realtime/, frontend/src/lib/realtime.ts
Staff dashboard ─PATCH /api/tickets/:id─▶ acknowledge / start / resolve / escalate_to_nurse
```
Ticket statuses are `NEW → ACKNOWLEDGED → IN_PROGRESS → RESOLVED`, plus `ESCALATED`. The patient UI already shows them as "Sent / Seen / …" (`strings.ts`).

## Files you'll work in

| File | What it is |
|---|---|
| `frontend/src/pages/PatientPage.tsx` | The whole patient screen today. O1 splits it. |
| `frontend/src/components/patient/*` | Created by you in O1, owned by you |
| `frontend/src/i18n/strings.ts` | All patient-facing text in 7 languages. TypeScript makes every language required. Shared with Chaitya, so rebase before pushing. |
| `frontend/src/hooks/useSpeech.ts` | Voice input (browser speech API) |
| `frontend/src/hooks/useLiveTickets.ts` | Live ticket list: WebSocket first, falls back to polling every 2s |
| `frontend/src/components/patient/Screensaver.tsx`, `hooks/useIdle.ts`, `i18n/screensaver.ts` | O7 screensaver (Chaitya). Mounted at the top of `PatientPage`; idle time is `IDLE_MS` (`VITE_IDLE_SECONDS`, default 180). It reuses your `NurseButton`. |
| `frontend/src/lib/accessibility.ts`, `lib/speak.ts` | O6 (Chaitya). `layoutFor(room.profile)` decides `showText` / `showMic` / `large` / `readAloud`; `InputPanel` and `RequestTiles` take these as optional props. **When you rebuild the tiles in O2, keep the `large` prop.** `speak()` is reusable for O5. |
| `frontend/src/components/patient/RequestTracker.tsx`, `i18n/tracker.ts` | O4 (Chaitya). `MyRequests` shows a tracker card per open request: label (tile name, else a category label, never free text), steps with times, ETA, "Still waiting?" and confirmed cancel. Tickets now carry `tile`. **O5 hook:** react to status changes in `RequestTracker`, and reuse `speak()`. |
| `frontend/src/lib/api.ts` | API client |
| `frontend/src/types/ticket.ts` | TypeScript mirror of the backend models. **Chaitya owns it**, so ask before changing it. |
| `backend/app/tiles.py` | Quick-tap tile → category mapping. Created in C1; owned by you from O2. |
| `frontend/src/pages/PatientPage.test.tsx` | Component tests (vitest + Testing Library) |
| `frontend/e2e/routing.spec.ts` | Playwright end-to-end tests |
| `specs/design.md` | Architecture, data model, API, error handling |

**Stack:** React 19, TypeScript, Vite, Tailwind 4 (custom colors in `src/index.css`, e.g. `bg-bell`, `bg-care`, `text-pine`). Patient UI conventions: large text (24px base), buttons at least 64px tall, accessible labels. Lighthouse accessibility is currently 100, so keep it there. ESLint includes the jsx-a11y accessibility rules.

## Rules that must not break
1. The red **"I need my nurse"** button is always visible and never disabled. That holds for every profile, layout, gray-out and screensaver.
2. Medication, clinical and unclear requests go to **nursing**.
3. Nothing the patient does can lower the priority of a clinical request.
4. All new patient text exists in all 7 languages.
5. `make eval` passes. Don't change `backend/app/safety/` without asking Chaitya.

## Git workflow
1. Branch from `main`, named `feat/<task-id>-<slug>`, e.g. `feat/O1-patient-components`.
2. Make small commits and rebase often: `git pull --rebase origin main`.
3. Open a PR to `main`. CI must be green; Chaitya reviews; squash-merge.
4. **Definition of done:** tests added, `make lint` and `make test` pass, e2e updated if a flow changed, and text in all 7 languages.

## Open questions affecting your tasks
These are from the team sheet; confirm them before building the affected piece.
- **Button count:** 3 or 4 main tiles? (O2)
- **Bathroom attendant gender:** is it practical? (O2)
- ~~**Low vision**~~ decided and built in O6: large buttons + read-aloud, mic kept, text box hidden.
