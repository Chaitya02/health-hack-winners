"""Decision engine: every failure path fails safe to the Nurse; rules only escalate."""

import itertools

import pytest

from app.classifier import (
    ClassifierError,
    ClassifierTimeout,
    InvalidLLMOutput,
    LLMIntent,
    LLMOutput,
    MockClassifier,
    decide,
)
from app.models import Category, Department, Language, Priority


class FakeClassifier:
    model_id = "fake"
    prompt_version = "test"

    def __init__(self, result=None, exc: Exception | None = None):
        self.result = result
        self.exc = exc
        self.calls = 0

    def classify(self, text: str) -> LLMOutput:
        self.calls += 1
        if self.exc:
            raise self.exc
        return self.result


def out(*intents: tuple, lang: str = "en") -> LLMOutput:
    return LLMOutput(
        detected_language=lang,
        intents=[
            LLMIntent(
                category=cat,
                english_summary=summary,
                confidence=conf,
                clinical_risk=risk,
            )
            for cat, summary, conf, risk in intents
        ],
        patient_confirmation="ok",
    )


PILLOW = (Category.COMFORT_SUPPLIES, "Patient requests a pillow.", 0.95, False)


def only_nursing(d) -> bool:
    return d.departments == [Department.NURSING]


@pytest.mark.parametrize(
    ("exc", "reason"),
    [
        (ClassifierTimeout("slow"), "classifier_timeout"),
        (ClassifierError("throttled"), "classifier_error"),
        (InvalidLLMOutput("garbage"), "invalid_llm_output"),
        (RuntimeError("boom"), "classifier_error"),
    ],
)
@pytest.mark.parametrize("text", ["extra pillow please", "I'm bleeding"])
def test_classifier_failures_fail_safe_to_nurse(exc, reason, text):
    d = decide(text, FakeClassifier(exc=exc))
    assert only_nursing(d)
    assert d.fallback == reason
    assert reason in d.intents[0].safety_reasons
    if "bleeding" in text:
        assert d.intents[0].category == Category.URGENT_CLINICAL
        assert d.intents[0].priority == Priority.HIGH
    else:
        assert d.intents[0].category == Category.UNCLEAR


def test_low_confidence_goes_to_nurse_as_unclear():
    fake = FakeClassifier(out((Category.DIETARY, "Wants something.", 0.4, False)))
    d = decide("i want the thing", fake, confidence_threshold=0.7)
    assert only_nursing(d)
    assert d.intents[0].category == Category.UNCLEAR
    assert "low_confidence" in d.intents[0].safety_reasons


def test_threshold_is_configurable():
    fake = FakeClassifier(out((Category.DIETARY, "Wants juice.", 0.6, False)))
    assert decide("juice", fake, confidence_threshold=0.5).departments == [Department.FOOD]


def test_rules_override_llm_that_says_hospitality():
    """Compromised/mistaken LLM says 'pillow' but the patient is bleeding → nurse, HIGH."""
    d = decide("I'm bleeding, also a pillow", FakeClassifier(out(PILLOW)))
    assert only_nursing(d)
    assert d.intents[0].category == Category.URGENT_CLINICAL
    assert "red_flag:pre:bleeding" in d.intents[0].safety_reasons


def test_llm_clinical_risk_flag_escalates():
    fake = FakeClassifier(out((Category.DIETARY, "Wants water.", 0.9, True)))
    d = decide("water", fake)
    assert d.intents[0].category == Category.URGENT_CLINICAL
    assert "llm_clinical_risk" in d.intents[0].safety_reasons


def test_post_llm_rules_scan_english_summary():
    # Non-English text the rules don't know, but the LLM's summary reveals the red flag.
    fake = FakeClassifier(
        out((Category.ENVIRONMENT_CLEANING, "Patient reports chest pain.", 0.9, False))
    )
    d = decide("zzz unknown dialect", fake)
    assert d.intents[0].category == Category.URGENT_CLINICAL
    assert "red_flag:post:chest" in d.intents[0].safety_reasons


def test_multi_intent_keeps_hospitality_and_adds_nurse():
    fake = FakeClassifier(
        out(
            (Category.DIETARY, "Wants water.", 0.9, False),
            (Category.NON_URGENT_CLINICAL, "IV pump beeping.", 0.9, False),
        )
    )
    d = decide("I need water and my IV is beeping", fake)
    assert sorted(d.departments) == [Department.FOOD, Department.NURSING]


def test_pre_rules_hit_with_only_hospitality_intents_adds_urgent_ticket():
    fake = FakeClassifier(
        out(
            (Category.DIETARY, "Wants water.", 0.9, False),
            (Category.TECH_AMENITIES, "TV broken.", 0.9, False),
        )
    )
    d = decide("water and tv, also my chest hurts", fake)
    urgent = [i for i in d.intents if i.category == Category.URGENT_CLINICAL]
    assert len(urgent) == 1 and urgent[0].department == Department.NURSING
    assert {Department.FOOD, Department.IT} <= set(d.departments)


def test_pre_rules_upgrade_existing_nursing_intent():
    fake = FakeClassifier(
        out(
            (Category.DIETARY, "Wants water.", 0.9, False),
            (Category.NON_URGENT_CLINICAL, "Question for nurse.", 0.9, False),
        )
    )
    d = decide("water please and I feel dizzy", fake)
    nursing = [i for i in d.intents if i.department == Department.NURSING]
    assert len(nursing) == 1 and nursing[0].category == Category.URGENT_CLINICAL


def test_same_department_intents_are_merged():
    fake = FakeClassifier(
        out(
            (Category.DIETARY, "Wants water.", 0.9, False),
            (Category.DIETARY, "Wants juice.", 0.95, False),
        )
    )
    d = decide("water and juice", fake)
    assert d.departments == [Department.FOOD]
    assert "juice" in d.intents[0].english_summary


HOSPITALITY = ["extra pillow please", "can i get ice water", "tv remote broken", "room is too cold"]
RED_FLAGS = ["my chest hurts", "I'm bleeding", "I can't breathe", "me duele el pecho", "我胸口痛"]
JOINERS = [" and ", ". ", ", also ", " — "]


@pytest.mark.parametrize(
    ("h", "r", "j"), list(itertools.product(HOSPITALITY, RED_FLAGS, JOINERS))[:60]
)
def test_property_red_flag_always_yields_urgent_nurse_ticket(h, r, j):
    """Whatever a (possibly compromised) LLM returns, a red flag ⇒ urgent nurse ticket."""
    for llm_result in (out(PILLOW), out((Category.DIETARY, "Water.", 0.99, False)), None):
        fake = FakeClassifier(llm_result, exc=None if llm_result else ClassifierTimeout())
        d = decide(f"{h}{j}{r}", fake)
        assert any(
            i.category == Category.URGENT_CLINICAL and i.department == Department.NURSING
            for i in d.intents
        )


def test_mock_classifier_language_and_shape():
    d = decide("¿Me puede traer agua con hielo?", MockClassifier())
    assert d.detected_language == Language.ES
    assert d.departments == [Department.FOOD]
