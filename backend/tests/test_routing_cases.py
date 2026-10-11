"""Everyday phrasings route to the right team with the keyword classifier (routing_cases.py)."""

import pytest

from app.classifier import MockClassifier, decide
from tests.routing_cases import CASES

_CLF = MockClassifier()


@pytest.mark.parametrize(("text", "departments"), CASES, ids=[c[0] for c in CASES])
def test_routes_to_the_right_team(text, departments):
    assert {str(d) for d in decide(text, _CLF).departments} == departments


@pytest.mark.parametrize(
    "text", ["that's nice", "I want to go home", "thank you so much", "where is my daughter"]
)
def test_typo_matching_leaves_everyday_words_alone(text):
    """Nothing to match → unclear → the nurse, never a guess from a near-miss spelling."""
    assert [str(d) for d in decide(text, _CLF).departments] == ["nursing"]
