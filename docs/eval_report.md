# Classifier Evaluation Report

- **Generated:** 2026-10-10 05:05 UTC
- **Mode:** `mock` · **Model:** `mock-keyword` · **Prompt:** `mock-v1`
- **Dataset:** `backend/eval/dataset.jsonl` — 167 synthetic rows, 55 URGENT_CLINICAL
- **Confidence threshold:** 0.7

## Headline

| Metric | Result | Target |
|---|---|---|
| URGENT_CLINICAL recall (urgent → Nurse HIGH) | **100.0%** | 100% |
| Routing accuracy (correct department set) | **100.0%** | ≥ 90% |
| Routing accuracy, non-English rows | 100.0% | — |
| Primary-category accuracy | 100.0% | — |
| Language detection accuracy | 100.0% | — |
| Classification latency p50 / p95 / max | 0 / **0** / 0 ms | p95 < 2000 ms |
| End-to-end latency p50 / p95 (incl. network) | 0 / 0 ms | — |
| Fail-safe fallbacks | 0  | — |
| Non-urgent rows raised to URGENT (over-triage) | 0 | safe direction |

## Confusion matrix (expected primary category → predicted primary category)

| expected \ predicted | URG | NUC | UNC | ENV | COM | DIE | TEC |
|---|---|---|---|---|---|---|---|
| **URG** | 55 | · | · | · | · | · | · |
| **NUC** | · | 20 | · | · | · | · | · |
| **UNC** | · | · | 11 | · | · | · | · |
| **ENV** | · | · | · | 21 | · | · | · |
| **COM** | · | · | · | · | 24 | · | · |
| **DIE** | · | · | · | · | · | 20 | · |
| **TEC** | · | · | · | · | · | · | 16 |

## Per-category precision / recall (primary category)

| Category | Support | Precision | Recall |
|---|---|---|---|
| URGENT_CLINICAL | 55 | 100.0% | 100.0% |
| NON_URGENT_CLINICAL | 20 | 100.0% | 100.0% |
| UNCLEAR | 11 | 100.0% | 100.0% |
| ENVIRONMENT_CLEANING | 21 | 100.0% | 100.0% |
| COMFORT_SUPPLIES | 24 | 100.0% | 100.0% |
| DIETARY | 20 | 100.0% | 100.0% |
| TECH_AMENITIES | 16 | 100.0% | 100.0% |

## False negatives (URGENT not routed to Nurse as urgent)

**None.** Every urgent row produced an URGENT_CLINICAL ticket for the Nurse.

## Misroutes (department set differs from expected)

None.

## Over-triage (non-urgent rows raised to URGENT, still routed to Nurse)

None.

## Notes

- Urgent recall counts a row as caught only if an URGENT_CLINICAL ticket was created for the Nurse. Routine nursing tickets don't count.
- The deterministic red-flag rules layer alone catches every urgent row in this dataset (`tests/test_safety.py::test_rules_alone_catch_every_urgent_row_in_eval_set`), so urgent recall does not depend on the LLM.
- The mock classifier was developed against this dataset, so its mock-mode accuracy proves the pipeline works, not how well it generalizes. Bedrock-mode results are the real measure.
