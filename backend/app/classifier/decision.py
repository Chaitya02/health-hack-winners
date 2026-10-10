"""Decision engine: combine the deterministic safety rules with the classifier output.

Invariants (property-tested):
- rules can only move routing TOWARD the nurse, never away from it;
- if the pre-LLM rules hit, at least one final intent is URGENT_CLINICAL → nursing / HIGH;
- every classifier failure ends in a nursing intent with the failure reason recorded.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.classifier.mock import detect_language
from app.classifier.schema import (
    ClassifierError,
    ClassifierTimeout,
    InvalidLLMOutput,
    LLMOutput,
)
from app.models import CLINICAL_CATEGORIES, Category, Department, Language, Priority, route
from app.safety import scan

log = logging.getLogger("tingting.decision")

_SEVERITY = list(Category)  # enum order: URGENT_CLINICAL first


class Classifier(Protocol):
    model_id: str
    prompt_version: str

    def classify(self, text: str) -> LLMOutput: ...


@dataclass
class FinalIntent:
    category: Category
    english_summary: str
    confidence: float
    clinical_risk_flag: bool
    requested_items: list[str] = field(default_factory=list)
    safety_reasons: list[str] = field(default_factory=list)
    rules_post: list[str] = field(default_factory=list)

    @property
    def department(self) -> Department:
        return route(self.category)[0]

    @property
    def priority(self) -> Priority:
        return route(self.category)[1]

    def as_dict(self) -> dict[str, Any]:
        return {
            "category": str(self.category),
            "department": str(self.department),
            "priority": str(self.priority),
            "confidence": self.confidence,
            "clinical_risk_flag": self.clinical_risk_flag,
        }


@dataclass
class Decision:
    detected_language: Language
    intents: list[FinalIntent]
    rules_pre: list[str]
    llm_output: dict[str, Any] | None
    fallback: str | None
    latency_ms: int
    model_id: str
    prompt_version: str

    @property
    def is_clinical(self) -> bool:
        return any(i.category == Category.URGENT_CLINICAL for i in self.intents)

    @property
    def departments(self) -> list[Department]:
        return [i.department for i in self.intents]


def _escalate(intent: FinalIntent, reasons: list[str]) -> None:
    intent.category = Category.URGENT_CLINICAL
    intent.clinical_risk_flag = True
    for r in reasons:
        if r not in intent.safety_reasons:
            intent.safety_reasons.append(r)


def _merge_same_department(intents: list[FinalIntent]) -> list[FinalIntent]:
    merged: dict[Department, FinalIntent] = {}
    for it in intents:
        prev = merged.get(it.department)
        if prev is None:
            merged[it.department] = it
            continue
        prev.category = min(prev.category, it.category, key=_SEVERITY.index)
        prev.english_summary = f"{prev.english_summary} / {it.english_summary}"[:200]
        prev.confidence = min(prev.confidence, it.confidence)
        prev.clinical_risk_flag = prev.clinical_risk_flag or it.clinical_risk_flag
        prev.requested_items += [x for x in it.requested_items if x not in prev.requested_items]
        prev.safety_reasons += [r for r in it.safety_reasons if r not in prev.safety_reasons]
        prev.rules_post += [r for r in it.rules_post if r not in prev.rules_post]
    return list(merged.values())


def decide(text: str, classifier: Classifier, confidence_threshold: float = 0.7) -> Decision:
    rules_pre = scan(text)
    pre_reasons = [f"red_flag:pre:{r}" for r in rules_pre]

    started = time.perf_counter()
    llm: LLMOutput | None = None
    fallback: str | None = None
    try:
        llm = classifier.classify(text)
    except ClassifierTimeout:
        fallback = "classifier_timeout"
    except InvalidLLMOutput:
        fallback = "invalid_llm_output"
    except ClassifierError:
        fallback = "classifier_error"
    except Exception:  # anything unexpected must still fail safe
        log.exception("unexpected classifier failure")
        fallback = "classifier_error"
    latency_ms = int((time.perf_counter() - started) * 1000)

    if llm is None:
        category = Category.URGENT_CLINICAL if rules_pre else Category.UNCLEAR
        summary = (
            f"Safety rules flagged: {', '.join(rules_pre)}. Classifier unavailable."
            if rules_pre
            else "Classifier unavailable — please review the patient's message."
        )
        intents = [
            FinalIntent(
                category=category,
                english_summary=summary,
                confidence=0.0,
                clinical_risk_flag=bool(rules_pre),
                safety_reasons=[fallback, *pre_reasons],  # type: ignore[list-item]
            )
        ]
        language = detect_language(text)
    else:
        language = llm.detected_language
        intents = []
        for raw in llm.intents:
            post = scan(raw.english_summary)
            it = FinalIntent(
                category=raw.category,
                english_summary=raw.english_summary,
                confidence=raw.confidence,
                clinical_risk_flag=raw.clinical_risk,
                requested_items=list(raw.requested_items),
                rules_post=post,
            )
            if raw.category == Category.URGENT_CLINICAL or raw.clinical_risk or post:
                reasons = [f"red_flag:post:{r}" for r in post]
                if raw.clinical_risk:
                    reasons.append("llm_clinical_risk")
                _escalate(it, reasons)
            elif raw.confidence < confidence_threshold:
                it.category = Category.UNCLEAR
                it.safety_reasons.append("low_confidence")
            intents.append(it)

        if rules_pre and not any(i.category == Category.URGENT_CLINICAL for i in intents):
            nursing = [i for i in intents if i.category in CLINICAL_CATEGORIES]
            if len(intents) == 1:
                _escalate(intents[0], pre_reasons)  # sole intent: the rules override the LLM
            elif nursing:
                _escalate(nursing[0], pre_reasons)
            else:
                intents.append(
                    FinalIntent(
                        category=Category.URGENT_CLINICAL,
                        english_summary=f"Safety rules flagged: {', '.join(rules_pre)}.",
                        confidence=1.0,
                        clinical_risk_flag=True,
                        safety_reasons=list(pre_reasons),
                    )
                )
        elif rules_pre:
            for i in intents:
                if i.category == Category.URGENT_CLINICAL:
                    _escalate(i, pre_reasons)

        intents = _merge_same_department(intents)

    # Invariant: rules hit ⇒ an urgent nursing ticket exists.
    if rules_pre and not any(
        i.category == Category.URGENT_CLINICAL and i.department == Department.NURSING
        for i in intents
    ):  # pragma: no cover - defensive; guaranteed by the logic above
        intents.append(
            FinalIntent(
                category=Category.URGENT_CLINICAL,
                english_summary="Safety rules flagged clinical risk.",
                confidence=1.0,
                clinical_risk_flag=True,
                safety_reasons=list(pre_reasons),
            )
        )

    return Decision(
        detected_language=language,
        intents=intents,
        rules_pre=rules_pre,
        llm_output=llm.model_dump(mode="json") if llm else None,
        fallback=fallback,
        latency_ms=latency_ms,
        model_id=classifier.model_id,
        prompt_version=classifier.prompt_version,
    )
