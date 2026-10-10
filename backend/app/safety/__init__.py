"""Deterministic multilingual clinical red-flag detector (runs pre- and post-LLM)."""

import re

from app.safety.lexicon import LANGUAGES, RED_FLAGS
from app.safety.normalize import normalize

_COMPILED: list[tuple[str, re.Pattern[str]]] = [
    (reason, re.compile(pattern))
    for reason, by_lang in RED_FLAGS.items()
    for patterns, _example in by_lang.values()
    for pattern in patterns
]


def scan(text: str) -> list[str]:
    """Return sorted, unique red-flag reasons found in text (all languages always checked)."""
    t = normalize(text)
    return sorted({reason for reason, rx in _COMPILED if rx.search(t)})


__all__ = ["LANGUAGES", "RED_FLAGS", "normalize", "scan"]
