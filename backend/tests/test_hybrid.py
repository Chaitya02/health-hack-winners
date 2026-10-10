"""Hybrid classifier: keywords answer what they can (free, instant); the LLM only sees the rest,
and a failing LLM never loses the request."""

from types import SimpleNamespace

import anthropic
import httpx
import pytest

from app.classifier import MockClassifier, build_classifier, decide
from app.classifier.anthropic_llm import AnthropicClassifier
from app.classifier.hybrid import HybridClassifier
from app.config import Settings


def _tool_reply(category: str, summary: str = "Patient wants a snack.") -> SimpleNamespace:
    payload = {
        "detected_language": "en",
        "intents": [
            {
                "category": category,
                "english_summary": summary,
                "requested_items": [],
                "confidence": 0.95,
                "clinical_risk": False,
            }
        ],
        "patient_confirmation": "Food Services is on the way.",
    }
    usage = SimpleNamespace(input_tokens=1200, output_tokens=80, cache_read_input_tokens=1100)
    block = SimpleNamespace(type="tool_use", name="route_request", input=payload)
    return SimpleNamespace(content=[block], usage=usage)


class FakeMessages:
    def __init__(self, reply=None, error: Exception | None = None):
        self.reply, self.error, self.calls = reply, error, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.reply


def _llm(reply=None, error=None) -> tuple[AnthropicClassifier, FakeMessages]:
    messages = FakeMessages(reply, error)
    client = SimpleNamespace(messages=messages)
    return AnthropicClassifier("claude-haiku-5-5", None, client=client), messages


def test_confident_keywords_never_call_the_llm():
    llm, calls = _llm(_tool_reply("DIETARY"))
    clf = HybridClassifier(llm)
    d = decide("can I get a sandwich", clf)
    assert [str(x) for x in d.departments] == ["food"]
    assert calls.calls == [] and d.model_id == MockClassifier.model_id


def test_unplaced_text_goes_to_the_llm_with_a_cached_prompt():
    llm, calls = _llm(_tool_reply("DIETARY"))
    clf = HybridClassifier(llm)
    d = decide("I'm peckish", clf)
    assert [str(x) for x in d.departments] == ["food"]
    assert d.model_id == "claude-haiku-5-5"
    [call] = calls.calls
    assert call["model"] == "claude-haiku-5-5" and call["temperature"] == 0
    assert call["max_tokens"] <= 400
    assert call["tool_choice"] == {"type": "tool", "name": "route_request"}
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert call["tools"][0]["cache_control"] == {"type": "ephemeral"}
    assert "<patient_message>I'm peckish</patient_message>" in call["messages"][0]["content"]


@pytest.mark.parametrize(
    "error",
    [
        anthropic.APITimeoutError(request=httpx.Request("POST", "https://api.anthropic.com")),
        anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com")),
    ],
)
def test_llm_failure_keeps_the_keyword_answer_and_the_nurse_gets_it(error):
    llm, _ = _llm(error=error)
    d = decide("I'm peckish", HybridClassifier(llm))
    assert [str(x) for x in d.departments] == ["nursing"]  # unplaced → nurse, never dropped
    assert d.model_id.endswith("(llm-fallback)")


def test_safety_rules_still_win_over_the_llm():
    llm, _ = _llm(_tool_reply("DIETARY", "Patient wants food."))
    d = decide("I'm peckish and my chest hurts", HybridClassifier(llm))
    assert "nursing" in [str(x) for x in d.departments]
    assert any(i.category == "URGENT_CLINICAL" for i in d.intents)


def test_without_an_api_key_hybrid_is_keywords_only():
    clf = build_classifier(Settings(app_env="test", classifier_mode="hybrid", _env_file=None))
    assert isinstance(clf, MockClassifier)


def test_with_an_api_key_hybrid_uses_the_llm():
    s = Settings(
        app_env="test", classifier_mode="hybrid", anthropic_api_key="sk-test", _env_file=None
    )
    clf = build_classifier(s)
    assert isinstance(clf, HybridClassifier) and clf.llm.model_id == "claude-haiku-5-5"
