"""Text normalization for the red-flag rules layer.

- lowercase, NFKC (full-width → ASCII)
- strip accents on Latin letters only (Devanagari/Gujarati vowel signs are combining marks
  and must be preserved)
- drop apostrophes ("can't" → "cant"), zero-width characters
- collapse runs of 3+ identical Latin letters to 2 ("pleeease" → "pleease")
- fix common misspellings of clinical words
"""

import re
import unicodedata

_ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍﻿"), None)
_APOSTROPHES = re.compile(r"['’‘`´]")
_REPEATS = re.compile(r"([a-z])\1{2,}")
_SPACES = re.compile(r"\s+")

MISSPELLINGS: dict[str, str] = {
    "bleding": "bleeding",
    "bleading": "bleeding",
    "bleeing": "bleeding",
    "brethe": "breathe",
    "breth": "breath",
    "stiches": "stitches",
    "stictches": "stitches",
    "incison": "incision",
    "insicion": "incision",
    "nausous": "nauseous",
    "nauseus": "nauseous",
    "vomitting": "vomiting",
    "feaver": "fever",
    "fevar": "fever",
    "dizy": "dizzy",
    "dizzi": "dizzy",
    "chesst": "chest",
    "alergic": "allergic",
    "allergik": "allergic",
    "emergancy": "emergency",
    "emergeny": "emergency",
    "swolen": "swollen",
    "numbb": "numb",
}
_MISSPELL_RE = re.compile(r"\b(" + "|".join(map(re.escape, MISSPELLINGS)) + r")\b")


def _strip_latin_accents(text: str) -> str:
    out: list[str] = []
    prev_base_latin = False
    for ch in unicodedata.normalize("NFD", text):
        if unicodedata.combining(ch):
            if prev_base_latin:
                continue  # drop accent on a Latin base letter
            out.append(ch)
            continue
        prev_base_latin = ord(ch) < 0x0250
        out.append(ch)
    return unicodedata.normalize("NFC", "".join(out))


def normalize(text: str) -> str:
    t = unicodedata.normalize("NFKC", text).translate(_ZERO_WIDTH).lower()
    t = _strip_latin_accents(t)
    t = _APOSTROPHES.sub("", t)
    t = _REPEATS.sub(r"\1\1", t)
    t = _MISSPELL_RE.sub(lambda m: MISSPELLINGS[m.group(1)], t)
    return _SPACES.sub(" ", t).strip()
