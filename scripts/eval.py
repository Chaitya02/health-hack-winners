"""Evaluate the classification pipeline (safety rules + classifier + decision engine).

Modes:
  mock     in-process, keyword MockClassifier (offline, CI)
  bedrock  in-process, BedrockClassifier using your local AWS credentials
  api      against a running API's POST /api/classify (local or deployed; staff PIN required)

Metrics: URGENT_CLINICAL recall (any urgent nurse ticket for an urgent row), routing accuracy
(predicted department set == expected, allowing listed extras), primary-category confusion
matrix with per-category precision/recall, false negatives, fallback count, latency p50/p95.

Examples:
  uv run --project backend python scripts/eval.py --mode mock
  uv run --project backend python scripts/eval.py --mode bedrock
  uv run --project backend python scripts/eval.py --mode api --api-url https://xyz.execute-api...
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.classifier import MockClassifier, decide  # noqa: E402
from app.config import Settings  # noqa: E402

DATASET = ROOT / "backend" / "eval" / "dataset.jsonl"
REPORT = ROOT / "docs" / "eval_report.md"
PRIMARY_ORDER = [
    "URGENT_CLINICAL",
    "NON_URGENT_CLINICAL",
    "UNCLEAR",
    "ENVIRONMENT_CLEANING",
    "COMFORT_SUPPLIES",
    "DIETARY",
    "TECH_AMENITIES",
]
SHORT = {
    "URGENT_CLINICAL": "URG",
    "NON_URGENT_CLINICAL": "NUC",
    "UNCLEAR": "UNC",
    "ENVIRONMENT_CLEANING": "ENV",
    "COMFORT_SUPPLIES": "COM",
    "DIETARY": "DIE",
    "TECH_AMENITIES": "TEC",
}


def primary(categories: list[str]) -> str:
    return min(categories, key=PRIMARY_ORDER.index)


def pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = max(0, min(len(s) - 1, round(q / 100 * (len(s) - 1))))
    return s[k]


class InProcess:
    def __init__(self, classifier, threshold: float):
        self.classifier = classifier
        self.threshold = threshold
        self.model_id = classifier.model_id
        self.prompt_version = classifier.prompt_version

    def __call__(self, text: str) -> dict:
        t0 = time.perf_counter()
        d = decide(text, self.classifier, self.threshold)
        return {
            "departments": sorted({str(x) for x in d.departments}),
            "categories": [str(i.category) for i in d.intents],
            "urgent_nurse": any(
                str(i.category) == "URGENT_CLINICAL" and str(i.department) == "nursing"
                for i in d.intents
            ),
            "fallback": d.fallback,
            "latency_ms": d.latency_ms,
            "e2e_ms": (time.perf_counter() - t0) * 1000,
            "language": str(d.detected_language),
        }


class Api:
    def __init__(self, base: str, pin: str):
        self.base = base.rstrip("/")
        body = json.dumps({"department": "nursing", "pin": pin}).encode()
        req = urllib.request.Request(
            f"{self.base}/api/auth/login", body, {"Content-Type": "application/json"}
        )
        self.token = json.load(urllib.request.urlopen(req, timeout=10))["token"]
        health = json.load(urllib.request.urlopen(f"{self.base}/health", timeout=10))
        self.model_id = f"api:{health.get('classifier_mode')}"
        self.prompt_version = "?"

    def __call__(self, text: str) -> dict:
        body = json.dumps({"text": text}).encode()
        req = urllib.request.Request(
            f"{self.base}/api/classify",
            body,
            {"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"},
        )
        t0 = time.perf_counter()
        r = json.load(urllib.request.urlopen(req, timeout=15))
        e2e = (time.perf_counter() - t0) * 1000
        self.model_id, self.prompt_version = r["model_id"], r["prompt_version"]
        return {
            "departments": r["departments"],
            "categories": r["categories"],
            "urgent_nurse": "URGENT_CLINICAL" in r["categories"] and "nursing" in r["departments"],
            "fallback": r["fallback"],
            "latency_ms": r["latency_ms"],
            "e2e_ms": e2e,
            "language": r["detected_language"],
        }


def run(runner, rows: list[dict]) -> list[dict]:
    results = []
    for i, row in enumerate(rows, 1):
        res = runner(row["text"])
        res["language_pred"] = res.pop("language")
        exp, got = set(row["departments"]), set(res["departments"])
        res["routing_ok"] = exp <= got <= exp | set(row["allow_extra"])
        res["primary"] = primary(res["categories"])
        results.append({**row, **res})
        if i % 25 == 0:
            print(f"  {i}/{len(rows)}", file=sys.stderr)
    return results


def summarize(results: list[dict]) -> dict:
    urgent = [r for r in results if r["category"] == "URGENT_CLINICAL"]
    lat = [r["latency_ms"] for r in results]
    e2e = [r["e2e_ms"] for r in results]
    cm: dict[str, Counter] = defaultdict(Counter)
    for r in results:
        cm[r["category"]][r["primary"]] += 1
    per_cat = {}
    for c in PRIMARY_ORDER:
        tp = cm[c][c]
        pred = sum(cm[e][c] for e in PRIMARY_ORDER)
        actual = sum(cm[c].values())
        per_cat[c] = {
            "support": actual,
            "precision": tp / pred if pred else None,
            "recall": tp / actual if actual else None,
        }
    non_en = [r for r in results if r["language"] != "en"]
    return {
        "n": len(results),
        "urgent_n": len(urgent),
        "urgent_recall": sum(r["urgent_nurse"] for r in urgent) / len(urgent),
        "routing_accuracy": sum(r["routing_ok"] for r in results) / len(results),
        "category_accuracy": sum(r["primary"] == r["category"] for r in results) / len(results),
        "non_en_routing_accuracy": sum(r["routing_ok"] for r in non_en) / len(non_en),
        "language_accuracy": sum(r["language"] == r["language_pred"] for r in results)
        / len(results),
        "false_negatives": [r for r in urgent if not r["urgent_nurse"]],
        "misroutes": [r for r in results if not r["routing_ok"]],
        "urgent_false_alarms": [
            r for r in results if r["category"] != "URGENT_CLINICAL" and r["urgent_nurse"]
        ],
        "fallbacks": Counter(r["fallback"] for r in results if r["fallback"]),
        "p50": pct(lat, 50),
        "p95": pct(lat, 95),
        "max": max(lat),
        "e2e_p50": pct(e2e, 50),
        "e2e_p95": pct(e2e, 95),
        "cm": cm,
        "per_cat": per_cat,
    }


def fmt_pct(x) -> str:
    return "—" if x is None else f"{100 * x:.1f}%"


def render(s: dict, mode: str, model_id: str, prompt_version: str, threshold: float) -> str:
    when = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Classifier Evaluation Report",
        "",
        f"- **Generated:** {when}",
        f"- **Mode:** `{mode}` · **Model:** `{model_id}` · **Prompt:** `{prompt_version}`",
        f"- **Dataset:** `backend/eval/dataset.jsonl` — {s['n']} synthetic rows, "
        f"{s['urgent_n']} URGENT_CLINICAL",
        f"- **Confidence threshold:** {threshold}",
        "",
        "## Headline",
        "",
        "| Metric | Result | Target |",
        "|---|---|---|",
        f"| URGENT_CLINICAL recall (urgent → Nurse HIGH) | **{fmt_pct(s['urgent_recall'])}** "
        "| 100% |",
        f"| Routing accuracy (correct department set) | **{fmt_pct(s['routing_accuracy'])}** "
        "| ≥ 90% |",
        f"| Routing accuracy, non-English rows | {fmt_pct(s['non_en_routing_accuracy'])} | — |",
        f"| Primary-category accuracy | {fmt_pct(s['category_accuracy'])} | — |",
        f"| Language detection accuracy | {fmt_pct(s['language_accuracy'])} | — |",
        f"| Classification latency p50 / p95 / max | {s['p50']:.0f} / **{s['p95']:.0f}** / "
        f"{s['max']:.0f} ms | p95 < 2000 ms |",
        f"| End-to-end latency p50 / p95 (incl. network) | {s['e2e_p50']:.0f} / "
        f"{s['e2e_p95']:.0f} ms | — |",
        f"| Fail-safe fallbacks | {sum(s['fallbacks'].values())} "
        f"{dict(s['fallbacks']) if s['fallbacks'] else ''} | — |",
        f"| Non-urgent rows raised to URGENT (over-triage) | {len(s['urgent_false_alarms'])} | "
        "safe direction |",
        "",
        "## Confusion matrix (expected primary category → predicted primary category)",
        "",
        "| expected \\ predicted | " + " | ".join(SHORT[c] for c in PRIMARY_ORDER) + " |",
        "|---|" + "---|" * len(PRIMARY_ORDER),
    ]
    for e in PRIMARY_ORDER:
        cells = [str(s["cm"][e][p]) if s["cm"][e][p] else "·" for p in PRIMARY_ORDER]
        lines.append(f"| **{SHORT[e]}** | " + " | ".join(cells) + " |")
    lines += [
        "",
        "## Per-category precision / recall (primary category)",
        "",
        "| Category | Support | Precision | Recall |",
        "|---|---|---|---|",
    ]
    for c, v in s["per_cat"].items():
        p, r = fmt_pct(v["precision"]), fmt_pct(v["recall"])
        lines.append(f"| {c} | {v['support']} | {p} | {r} |")
    lines += ["", "## False negatives (URGENT not routed to Nurse as urgent)", ""]
    if s["false_negatives"]:
        lines += [f"- `{r['id']}` {r['text']} → {r['departments']}" for r in s["false_negatives"]]
    else:
        lines.append("**None.** Every urgent row produced an URGENT_CLINICAL ticket for the Nurse.")
    lines += ["", "## Misroutes (department set differs from expected)", ""]
    if s["misroutes"]:
        lines += [
            f"- `{r['id']}` ({r['category']}) {r['text']} → got {r['departments']}, "
            f"expected {r['departments_expected']}"
            for r in s["misroutes"]
        ]
    else:
        lines.append("None.")
    lines += ["", "## Over-triage (non-urgent rows raised to URGENT, still routed to Nurse)", ""]
    lines += [f"- `{r['id']}` ({r['category']}) {r['text']}" for r in s["urgent_false_alarms"]] or [
        "None."
    ]
    lines += [
        "",
        "## Notes",
        "",
        "- Urgent recall counts a row as caught only if an URGENT_CLINICAL ticket was created for "
        "the Nurse. Routine nursing tickets don't count.",
        "- The deterministic red-flag rules layer alone catches every urgent row in this dataset "
        "(`tests/test_safety.py::test_rules_alone_catch_every_urgent_row_in_eval_set`), so urgent "
        "recall does not depend on the LLM.",
        "- The mock classifier was developed against this dataset, so its mock-mode accuracy "
        "proves the pipeline works, not how well it generalizes. Bedrock-mode results are the "
        "real measure.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["mock", "bedrock", "api"], default="mock")
    ap.add_argument("--api-url", default=os.environ.get("API_URL", "http://localhost:8000"))
    ap.add_argument("--pin", default=os.environ.get("STAFF_PIN", "2468"))
    ap.add_argument("--no-report", action="store_true")
    ap.add_argument("--gate", action="store_true", help="exit 1 if targets are missed")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    rows = [json.loads(line) for line in DATASET.read_text().splitlines() if line.strip()]
    if args.limit:
        rows = rows[: args.limit]
    for r in rows:
        r["departments_expected"] = r["departments"]

    settings = Settings(_env_file=None)
    if args.mode == "mock":
        runner = InProcess(MockClassifier(), settings.confidence_threshold)
    elif args.mode == "bedrock":
        from app.classifier.bedrock import BedrockClassifier

        clf = BedrockClassifier(
            settings.bedrock_model_id, settings.aws_region, timeout_s=settings.llm_timeout_s
        )
        runner = InProcess(clf, settings.confidence_threshold)
    else:
        runner = Api(args.api_url, args.pin)

    print(f"evaluating {len(rows)} rows in {args.mode} mode…", file=sys.stderr)
    results = run(runner, rows)
    s = summarize(results)

    print(
        f"URGENT recall {fmt_pct(s['urgent_recall'])} ({s['urgent_n']} urgent) | "
        f"routing accuracy {fmt_pct(s['routing_accuracy'])} | "
        f"category accuracy {fmt_pct(s['category_accuracy'])} | "
        f"p50 {s['p50']:.0f} ms p95 {s['p95']:.0f} ms | "
        f"fallbacks {dict(s['fallbacks'])} | false negatives {len(s['false_negatives'])}"
    )
    for r in s["misroutes"]:
        print(f"  misroute {r['id']}: {r['text']!r} → {r['departments']}", file=sys.stderr)

    if not args.no_report:
        REPORT.parent.mkdir(exist_ok=True)
        threshold = settings.confidence_threshold
        REPORT.write_text(render(s, args.mode, runner.model_id, runner.prompt_version, threshold))
        print(f"wrote {REPORT.relative_to(ROOT)}")

    if args.gate:
        ok = s["urgent_recall"] == 1.0 and s["routing_accuracy"] >= 0.9
        if args.mode != "mock":
            ok = ok and s["p95"] < 2000
        if not ok:
            print("GATE FAILED", file=sys.stderr)
            return 1
        print("GATE PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
