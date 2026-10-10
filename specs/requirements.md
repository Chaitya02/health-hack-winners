# Ting-ting — Requirements

AI-driven call bell router for inpatient units (HealthHack Ops Unleashed, Challenge 2).

Acceptance criteria use EARS patterns: **Ubiquitous** ("The system shall…"), **Event-driven** ("When…, the system shall…"), **State-driven** ("While…"), **Unwanted behaviour** ("If…, then the system shall…"), **Optional** ("Where…").

## 1. Problem

Up to 60–70% of call bell activations are for non-clinical needs (water, blankets, cleaning, TV). When all of them page the nurse, they cause alarm fatigue, interruptions and slower responses to real clinical needs. Ting-ting lets the patient say what they need, in their own language. An AI triage router sends each request straight to the right team, and anything that might be clinical always goes to the nurse.

## 2. Actors

| Actor | Device | Goal |
|---|---|---|
| Patient | Bedside tablet / own phone | Ask for help in their own words and language, and know who is coming |
| Primary Nurse | Nursing station / phone | See only clinical requests; never miss an urgent one |
| Housekeeping & Facilities | Phone / cart tablet | See cleaning, temperature and comfort-supply requests |
| Food Services | Phone / kitchen screen | See dietary requests |
| Unit Clerk / IT | Desk PC | See TV, phone, Wi-Fi and amenity requests |
| Admin / Charge Nurse | Desk PC | See unit-wide flow, diversion rate and impact |

## 3. Routing matrix

| Category | Example | Department | Priority |
|---|---|---|---|
| URGENT_CLINICAL | "My surgical incision is throbbing and I feel dizzy." | Primary Nurse (`nursing`) | HIGH |
| NON_URGENT_CLINICAL | "When is my next medication?" | Primary Nurse (`nursing`) | NORMAL |
| UNCLEAR | "the bed is wet" / low confidence | Primary Nurse (`nursing`) | NORMAL |
| ENVIRONMENT_CLEANING | "My room is cold and the bathroom floor is sticky." | Housekeeping & Facilities (`housekeeping`) | NORMAL |
| COMFORT_SUPPLIES | "Extra pillow please." | Housekeeping & Facilities (`housekeeping`) | NORMAL |
| DIETARY | "Can I get some ice water and apple juice?" | Food Services (`food`) | NORMAL |
| TECH_AMENITIES | "The television remote isn't changing channels." | Unit Clerk / IT (`it`) | LOW |

## 4. User stories and acceptance criteria

### 4.1 Patient

**US-P1** As a patient, I want to type or speak my request in my own words, so I don't have to work out who to ask.
- P1.1 The system shall accept free-text requests of 1–500 characters.
- P1.2 Where the browser supports the Web Speech API, the system shall offer a microphone button that transcribes speech in the selected language into the text box.
- P1.3 If speech recognition is unavailable or fails, then the system shall keep the text box and quick-tap tiles available and show a short message.
- P1.4 When a request is submitted, the system shall show a confirmation in the patient's language within 2 seconds (p95).

**US-P2** As a patient, I want big quick-tap buttons for common needs.
- P2.1 The patient screen shall show quick-tap tiles for Water, Ice, Pillow, Blanket, Bathroom help, Room temperature, TV/Remote, Food/Menu, and a visually distinct red "I need my nurse" tile.
- P2.2 When the "I need my nurse" tile is tapped, the system shall create a nursing ticket without calling the LLM.
- P2.3 Every touch target shall be at least 64×64 CSS px, and body text at least 24 px.

**US-P3** As a patient who speaks Spanish, Hindi, Gujarati, Chinese, Haitian Creole or Portuguese, I want the interface and the confirmation in my language.
- P3.1 The system shall support EN, ES, HI, GU, ZH, HT and PT for UI strings, voice input and confirmations.
- P3.2 When a request is submitted, the system shall detect its language and return the confirmation in that language.

**US-P4** As a patient, I want to know someone is coming.
- P4.1 The confirmation shall name the team (e.g. "Housekeeping is on the way").
- P4.2 When the request is clinical, the confirmation shall be shown in red: "Your nurse has been alerted".
- P4.3 While the patient has open requests, the screen shall show each one's live status (sent, acknowledged, on the way, done).

### 4.2 Primary Nurse

**US-N1** As a nurse, I want urgent clinical requests to reach me immediately and stand out.
- N1.1 When an URGENT_CLINICAL ticket is created, the system shall push it to the nursing dashboard within 1 s locally and within 2 s in AWS.
- N1.2 The nursing dashboard shall pin HIGH tickets at the top, play an audible alert and show a flashing banner until acknowledged.
- N1.3 If a HIGH ticket is not acknowledged within 2 minutes, then the system shall raise a CloudWatch alarm.

**US-N2** As a nurse, I want non-clinical requests kept off my queue.
- N2.1 The system shall route ENVIRONMENT_CLEANING, COMFORT_SUPPLIES, DIETARY and TECH_AMENITIES tickets only to their departments, never to nursing, unless a clinical flag is also raised.
- N2.2 The nursing dashboard shall show a "Requests diverted from nurses today" counter.

**US-N3** As a nurse, I want to see why something was routed to me.
- N3.1 Each nursing ticket shall show its safety reasons (e.g. `red_flag:bleeding`, `classifier_timeout`, `low_confidence`).

### 4.3 Housekeeping & Facilities, Food Services, Unit Clerk / IT

**US-D1** As department staff, I want a scannable live feed of only my requests.
- D1.1 Each card shall show room number, English summary, a language flag, a priority badge and a time-waiting timer.
- D1.2 The timer shall be green under 5 minutes, amber under 10 and red at 10 or more.
- D1.3 The card shall let staff toggle to the patient's original text.
- D1.4 When a ticket for my department is created or updated, the feed shall update without a page reload.

**US-D2** As department staff, I want to update a request with one tap.
- D2.1 Each card shall offer Acknowledge, Start and Resolve, according to its state.
- D2.2 Each card shall offer "This is clinical → Escalate to Nurse". When pressed, the system shall move the ticket to nursing with status ESCALATED and priority HIGH.

**US-D3** As department staff, I want basic access control.
- D3.1 Staff dashboards shall require a per-department demo PIN.
- D3.2 Staff actions (queue reads and ticket updates) shall be rejected without a valid staff token.

### 4.4 Admin / Charge Nurse

**US-A1** As a charge nurse, I want live unit metrics.
- A1.1 The admin page shall show volume by category, % diverted from nurses, average time to acknowledge and resolve per department, and urgent-alert response time.

**US-A2** As an admin, I want to quantify impact.
- A2.1 The admin page shall include an impact calculator with editable assumptions: beds, call bells per bed per day, % non-clinical, minutes per nurse interruption, nurse hourly cost.
- A2.2 The calculator shall output annual nursing hours saved and dollars saved for this unit, and scaled to a 500-bed hospital.

## 5. Safety requirements (fail-safe, never fail-open)

- S1 The system shall run a deterministic multilingual clinical red-flag rules layer on the patient text **before** the LLM, and again on the LLM's English summary **after** it.
- S2 If the rules layer or the LLM flags clinical risk, then the final routing shall be URGENT_CLINICAL / HIGH / nursing.
- S3 If the LLM errors, times out (3 s), returns invalid JSON after one retry, or returns confidence below 0.7, then the system shall route to nursing and record the reason.
- S4 The rules layer may only make routing **more** clinical, never less.
- S5 If a request has several intents, then the system shall create one ticket per intent, and any clinical intent shall go to nursing.
- S6 Patient text shall be treated as untrusted data. Instructions inside it ("ignore your rules…") shall not change routing, and injection attempts shall be routed to nursing whenever any clinical content is present.
- S7 Nothing that might be clinical may land only in a non-clinical queue.
- S8 Every ticket shall carry an audit trail: model_id, prompt_version, latency_ms, rule hits, the raw LLM decision and the final decision.

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NF1 | Classification latency p95 < 2 s (bedrock mode, eval set). |
| NF2 | Patient UI meets WCAG 2.1 AA; Lighthouse accessibility ≥ 95. |
| NF3 | Large-font UI: body ≥ 24 px, touch targets ≥ 64 px, works at 375 px and 768 px widths. |
| NF4 | 7 languages: EN, ES, HI, GU, ZH, HT, PT. |
| NF5 | No PHI. Only synthetic data in code, seeds, logs, tests and screenshots. Logs never contain full patient text. |
| NF6 | No secrets in git; the cloud uses IAM roles and generated secrets. |
| NF7 | Real-time: WebSocket push with automatic reconnect and a 2 s polling fallback. |
| NF8 | Demo resilience: `CLASSIFIER_MODE=mock` works with no AI dependency and still enforces the safety layer. |
| NF9 | Input limits: 500 characters; per-room rate limit (10 requests / minute). |
| NF10 | Eval: URGENT_CLINICAL recall = 100%, overall accuracy ≥ 90%. |
