import json
from pathlib import Path

import pytest

from app.safety import LANGUAGES, RED_FLAGS, normalize, scan

CASES = [
    (reason, lang, example)
    for reason, by_lang in RED_FLAGS.items()
    for lang, (_patterns, example) in by_lang.items()
]


def test_every_red_flag_covers_all_seven_languages():
    for reason, by_lang in RED_FLAGS.items():
        assert set(by_lang) == set(LANGUAGES), f"{reason} missing languages"


@pytest.mark.parametrize(
    ("reason", "lang", "example"), CASES, ids=[f"{r}-{lg}" for r, lg, _ in CASES]
)
def test_red_flag_example_triggers(reason, lang, example):
    assert reason in scan(example)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("I'M BLEEDING", "bleeding"),  # all caps + apostrophe
        ("bleding from my iv site", "bleeding"),  # misspelling
        ("im soooo dizzzy", "dizziness"),  # repeated letters
        ("cant brethe", "breathing"),
        ("my stiches opened", "wound"),
        ("tengo náuseas", "nausea_vomiting"),  # accent stripped
        ("ＨＥＬＰ ＰＬＥＡＳＥ", "help_emergency"),  # full-width
        ("help", "help_emergency"),
        ("NURSE NOW", "help_emergency"),
        ("i feel faint", "fainting"),
        ("pain is 8/10", "pain"),
    ],
)
def test_normalization_and_messy_text(text, expected):
    assert expected in scan(text)


def test_normalize_preserves_indic_vowel_signs():
    assert normalize("मुझे चक्कर आ रहा है") == "मुझे चक्कर आ रहा है"
    assert normalize("મને શ્વાસ") == "મને શ્વાસ"


@pytest.mark.parametrize(
    "text",
    [
        "extra pillow please",
        "Can I get some ice water and apple juice?",
        "The television remote isn't changing channels.",
        "My room is cold and the bathroom floor is sticky.",
        "I can't fall asleep, can I get an eye mask",
        "my blood sugar machine needs checking",
        "when is my pain medicine due",
        "Can someone help me reposition in bed",
        "the shower drain is clogged",
        "Quiero otra almohada",
        "请给我一个枕头",
        "मुझे पानी चाहिए",
    ],
)
def test_hospitality_and_routine_requests_do_not_raise_red_flags(text):
    assert scan(text) == []


def test_negation_never_suppresses_a_flag():
    # "no pain" still flags: false positives go to the nurse, which is the safe direction.
    assert "pain" in scan("I have no pain but I'm bleeding a little")
    assert "bleeding" in scan("I'm not bleeding much")


def test_rules_alone_catch_every_urgent_row_in_eval_set():
    path = Path(__file__).resolve().parents[1] / "eval" / "dataset.jsonl"
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    urgent = [r for r in rows if r["category"] == "URGENT_CLINICAL"]
    missed = [r["text"] for r in urgent if not scan(r["text"])]
    assert len(urgent) >= 40
    assert missed == []
