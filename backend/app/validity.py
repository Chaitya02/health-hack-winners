"""Is this free text (typed or spoken) actually a request? Checked before classification.

Only clearly empty input is turned back: no letters, nothing but greetings or filler ("hello",
"ok", "test"), or keyboard mashing ("asdfgh", "xkcd"). Anything the safety rules flag always
counts as a request, and anything that could be a need ("I feel weird") goes on to the
classifier, which routes doubt to the nurse.
"""

import re

from app.safety import normalize, scan

# Greetings, fillers and test words, after normalize() (lowercase, accents stripped).
_FILLER_WORDS = """
hi hello hey hiya yo ok okay k yes yeah yep no nope um uh uhm hmm mm ah oh thanks thank you
bye goodbye test testing tested asdf qwerty abc xyz blah lol sorry what huh
hola oi ola si sim nao vale bueno gracias obrigado obrigada adios tchau prueba teste eh
bonjou bonswa wi non mesi orevwa
namaste haan ha nahi theek thik shukriya dhanyavad नमस्ते हाँ हां नहीं ठीक धन्यवाद
નમસ્તે હા ના આભાર
你好 喂 好 是 不 谢谢 再见 嗯 测试
"""
FILLER = frozenset(_FILLER_WORDS.split())

_WORD = re.compile(r"\w+")
_LATIN = re.compile(r"^[a-z]+$")
_VOWELS = set("aeiouy")
# Real requests without vowels.
_ABBREVIATIONS = {"tv", "pls", "plz", "rn", "md", "dr", "bp", "iv", "pt", "ht", "wc", "nj"}


_KEY_ROWS = ("qwertyuiop", "asdfghjkl", "zxcvbnm")


def _mashed(word: str) -> bool:
    """A Latin-letter token that can't be a word: a run along one keyboard row ("asdfgh"),
    no vowels at all ("xkcd", "zz"), or 6+ consonants in a row. normalize() has already
    collapsed long repeats ("aaaaaa" → "aa")."""
    if not _LATIN.match(word) or len(word) < 2:
        return False
    if len(set(word)) == 1:
        return True  # "aa", "zz": what's left of a held key
    if len(word) >= 4 and any(word in row or word in row[::-1] for row in _KEY_ROWS):
        return True
    if len(word) >= 2 and not any(c in _VOWELS for c in word) and word not in _ABBREVIATIONS:
        return True
    run = longest = 0
    for c in word:
        run = 0 if c in _VOWELS else run + 1
        longest = max(longest, run)
    return longest >= 6


def not_a_request(text: str) -> str | None:
    """Why `text` isn't a request ("empty", "filler" or "gibberish"), or None if it may be one."""
    if scan(text):
        return None  # safety first: a red flag is always a request
    words = _WORD.findall(normalize(text))
    words = [w for w in words if not w.isdigit()]
    if not words:
        return "empty"
    if all(w in FILLER for w in words):
        return "filler"
    # Every word is filler or mashing ("hi asdfgh"): one real word ("pls water") is enough to pass.
    if all(w in FILLER or _mashed(w) for w in words):
        return "gibberish"
    return None
