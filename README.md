# Tink Tink — AI Call Bell Router

**The right help, right away.**

> Rutgers Health Hack 2026 · Ops Unleashed track
> **Synthetic data only. No real patient information.**

## What is it?

In a hospital, the call bell next to every bed goes to one person: the nurse. But **60–70% of call-bell presses are not medical**. The patient wants water, a blanket, or help with the TV. The nurse walks over, asks what's needed, then passes the job on to someone else. Patients wait, nurses are pulled away from medical care, and the constant alarms wear everyone out ("alarm fatigue").

**Tink Tink is a smarter call bell.** A tablet sits at the bedside. The patient asks for what they need, and Tink Tink sends the request straight to the team that handles it:

| The patient says… | It goes to… |
|---|---|
| "Can I have some water?" | Food services |
| "I need another blanket" | Housekeeping |
| "The TV isn't working" | IT |
| "I need help getting to the bathroom" / "I'm in pain" | The nurse |
| "My chest hurts" | The nurse, marked **urgent** |

**Safety comes first.** Anything medical, unclear or urgent always goes to the nurse.

## What the patient sees

- **Big, simple buttons** for common needs (water, pillow, blanket, bathroom, TV…), plus a red **"I need my nurse"** button.
- **Type or talk**: tap the microphone and say it in your own words.
- **7 languages**: English, Spanish, Chinese, Haitian Creole, Gujarati, Hindi and Portuguese. The tablet can read messages aloud.
- **Live updates**: "Priya has seen your request", "Someone is on the way — about 4 minutes".
- **Never forgotten**: if nobody responds in time, the request goes to a backup person and the patient is told: "We're still looking for someone to help you."
- **Reminders** before tests and procedures (for example "Blood test in 15 minutes").
- **Personal safety rules**: a patient at risk of falling has bathroom requests sent to their nurse. A patient who must not eat or drink before surgery can't order food or water.

## What the staff see

- Each team (nursing, housekeeping, food services, IT) has a **live list of requests** showing the room, the patient and what they need.
- **One button moves a request along**: Acknowledge → On my way → Done.
- If a request turns out to be medical, staff tap **"Send to nurse"**.
- A countdown shows how long until each request is overdue (urgent requests: 2 minutes to acknowledge).
- An **admin page** shows the number of requests, response times and busy hours over the last 7 days.

## How it decides where to send a request

1. **Is it a real request?** Gibberish like "asdfgh" gets a friendly "please try again", and no request is created.
2. **Safety check first.** Words that signal danger, such as chest pain, trouble breathing, falls or bleeding, go straight to the nurse as **HIGH PRIORITY**, in any of the 7 languages.
3. **Understand the request — decision model first, not GenAI.** Our own lightweight, open-source decision model (multilingual keyword rules, tolerant of typos; the code is in this repo) handles common requests instantly, at no cost and with no AI service involved.
4. **Low confidence → LLM.** Only when the decision model can't place a request confidently do we ask an LLM: **Claude Haiku 5.5** (model `claude-haiku-5-5`, Anthropic API). If the LLM's own confidence is below 0.7, the request goes to the nurse.
5. **Fail safe.** If the AI is slow (more than 3 seconds) or fails, the request goes to the nurse.

Routing is checked on 177 test phrases: 100% go to the right team, and every urgent one reaches the nurse. Every code change has to keep that score.

## Try it on your computer

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/). For development you also need [uv](https://docs.astral.sh/uv/) and Node 22+.

```bash
git clone https://github.com/Chaitya02/health-hack-winners.git
cd health-hack-winners
make dev     # starts the database, the server (:8000) and the app (:5173)
make seed    # adds a pretend hospital unit "4 West Med-Surg" (rooms 401–420) and staff
```

Then open these pages in your browser:

| Who | Link |
|---|---|
| **Patient tablet** | http://localhost:5173/ (fill in the short welcome form, or tap a demo patient) |
| Another patient room | http://localhost:5173/patient/410 |
| **Nurse dashboard** | http://localhost:5173/nursing |
| Other teams | http://localhost:5173/housekeeping · `/food` · `/it` |
| **Admin** | http://localhost:5173/admin |

Staff screens sign in automatically in demo mode. With `VITE_AUTO_SIGN_IN=false`, the staff PIN is 2468 and the admin PIN is 1357.

**Optional:** to turn on Claude AI for hard-to-understand requests, put `ANTHROPIC_API_KEY=...` in `.env`. Without a key, Tink Tink uses keyword matching only and sends anything unclear to the nurse.

### Open it on a real tablet or phone

The app and the server share one address, so a single [ngrok](https://ngrok.com/) tunnel is enough:

```bash
docker compose up -d
ngrok http 5173      # prints an https://….ngrok-free.app link
```

Open the link on the tablet and tap **Visit Site** once. HTTPS lets the microphone work. Anyone with the link can open the staff screens, so use demo patients only and stop the tunnel when you're done.

## How it's built (for developers)

| Part | Technology |
|---|---|
| Patient tablet and staff dashboards | React 19, TypeScript, Vite, Tailwind; live updates over WebSockets |
| Server | FastAPI (Python 3.12), Pydantic v2 |
| Database | DynamoDB (DynamoDB Local in development) |
| AI routing | Safety rules → open-source decision model (multilingual keywords, no GenAI) → only on low confidence: Claude Haiku 5.5 (`claude-haiku-5-5`), 3 s limit, falls back to the nurse |
| Tests | pytest + moto, vitest, Playwright end-to-end; GitHub Actions CI |
| Cloud design (AWS) | CloudFront, API Gateway (HTTP and WebSocket), Lambda, DynamoDB Streams, Bedrock, CloudWatch; see `specs/design.md` |

```bash
make test     # pytest + vitest
make lint     # ruff + eslint + tsc
make eval     # routing accuracy check on the test phrases
```

| Folder | Contents |
|---|---|
| `specs/` | requirements, design, task list |
| `backend/` | the server: API, classifier, safety rules, deadlines; tests and evaluation data |
| `frontend/` | the patient and staff apps |
| `scripts/` | seed data, evaluation, demo helpers |
| `docs/` | evaluation report, screenshots, team notes |

## What's next

- Connect to **Epic** (the hospital's patient record system) to load each patient's details and safety notes automatically.
- Connect to the hospital's existing **nurse-call system**.
- Run a **one-unit pilot** and measure fewer nurse interruptions, faster responses and higher patient satisfaction (HCAHPS) scores.
