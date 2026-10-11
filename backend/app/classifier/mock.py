"""Deterministic keyword classifier for tests, CI and offline demos (CLASSIFIER_MODE=mock).

It produces the same LLMOutput shape as Bedrock, so its output goes through the same decision
engine and safety rules.
"""

import re

from app.classifier.confirmations import confirmation_for
from app.classifier.schema import LLMIntent, LLMOutput
from app.models import Category, Language, route
from app.safety import normalize, scan

PROMPT_VERSION = "mock-v2"

# Category keyword patterns, applied to normalize()d segment text. Order = precedence when a
# single segment matches several categories.
_KEYWORDS: list[tuple[Category, list[str]]] = [
    (
        Category.NON_URGENT_CLINICAL,
        [
            r"\bmedic\w*",
            r"\bmeds\b",
            r"\bpills?\b",
            r"\biv\b",
            r"\bdrip\b",
            r"\bpump\b",
            r"\bbeep\w*",
            r"\bdoctor\b",
            r"\bnurse\b",
            r"\b(help|take|walk|get)\s+(me\s+)?(getting\s+|going\s+)?to\s+the\s+(bathroom|toilet)",
            # The patient needs to go (mobility help), not the bathroom needing cleaning.
            r"\b(need|have|want|got)\s+to\s+(go|pee|poop|use\s+the\s+(bathroom|toilet|restroom))\b",
            r"\bgo(ing)?\s+to\s+the\s+(bathroom|toilet|restroom|loo)\b",
            r"\b(help|get)\s+(me\s+)?(out\s+of|into|in\s+to)\s+(bed|the\s+bed|the\s+chair)\b",
            r"\bsit\s+up\b",
            r"\bswallow\w*",
            r"\bin\s+pain\b",
            r"\bbedpan\b",
            r"\burinal\b",
            r"\breposition\w*",
            r"\blab\b",
            r"\bresults\b",
            r"\bdischarge\w*",
            r"\boxygen\b",
            r"\bblood sugar\b",
            r"\binsulin\b",
            r"\bcatheter\b",
            r"\bmedicina\b",
            r"\bmedicamento\b",
            r"\bpastilla\b",
            r"\benfermer[ao]\b",
            r"\bremedio\b",
            r"\benfermeira\b",
            r"\bmedikaman\b",
            r"\bdokte\b",
            "दवा",
            "डॉक्टर",
            "નર્સ",
            "દવા",
            "药",
            "医生",
            "护士",
        ],
    ),
    (
        Category.TECH_AMENITIES,
        [
            r"\btv\b",
            r"\btelevision\b",
            r"\bremote\b",
            r"\bwi-?fi\b",
            r"\binternet\b",
            r"\bphone\b",
            r"\bcharger\b",
            r"\btablet\b",
            r"\bnetflix\b",
            r"\bchannel\w*",
            r"\bthe game on\b",
            r"\bwi\s+fi\b",
            r"\bcall\s+bell\b",
            r"\bscreen\b",
            r"\btelevision\b",
            r"\btelevisao\b",
            r"\btelevizyon\b",
            "टीवी",
            "રિમોટ",
            "ટીવી",
            "电视",
            "遥控",
        ],
    ),
    (
        Category.ENVIRONMENT_CLEANING,
        [
            r"\bclean\w*",
            r"\bdirty\b",
            r"\bsticky\b",
            r"\btrash\b",
            r"\bgarbage\b",
            r"\bspill\w*",
            r"\bfloor\b",
            r"\bsink\b",
            r"\btoilet\b",
            r"\bshower\b",
            r"\bdrain\b",
            r"\bflush\w*",
            r"\b(room|bathroom|it|toilet)\s+smells?\b",
            r"\blights?\b",
            r"\bblinds\b",
            r"\bsheets\b",
            r"\bheat\w*",
            r"\bthermostat\b",
            r"\b(too|so|very|really)\s+(hot|cold|warm)\b",
            r"\b(room|it)\s+is\s+(\w+\s+)?(cold|hot|warm|freezing)\b",
            r"\b(hot|cold|freezing)\s+in\s+here\b",
            r"\b(close|shut|open)\s+the\s+(door|window)\b",
            r"\bbathroom\b",
            r"\bsucio\b",
            r"\bfrio\b",
            r"\bcalor\b",
            r"\blimpi\w*",
            r"\bquente\b",
            r"\bsujo\b",
            r"\bsal\b",
            r"\bfret\b",
            "गंदा",
            "सफाई",
            "ठंडा",
            "ગરમી",
            "ઠંડી",
            "સફાઈ",
            "冷",
            "热了",
            "脏",
            "打扫",
        ],
    ),
    (
        Category.COMFORT_SUPPLIES,
        [
            r"\bpill?ows?\b",
            r"\bblankets?\b",
            r"\btowels?\b",
            r"\btooth\w*",
            r"\bsocks?\b",
            r"\bcomb\b",
            r"\blotion\b",
            r"\btissues?\b",
            r"\beye mask\b",
            r"\bearplugs?\b",
            r"\bgown\b",
            r"\bshampoo\b",
            r"\bsoap\b",
            r"\balmohada\b",
            r"\bcobija\b",
            r"\bmanta\b",
            r"\btravesseiro\b",
            r"\bcobertor\b",
            r"\bkouveti\b",
            r"\bzorye\b",
            "तकिया",
            "कंबल",
            "ધાબળો",
            "ઓશીકું",
            "枕头",
            "毯子",
        ],
    ),
    (
        Category.DIETARY,
        [
            r"\bwater\b",
            r"\bice\b",
            r"\bjuice\b",
            r"\bdrinks?\b",
            r"\bcoffee\b",
            r"\btea\b",
            r"\bfood\b",
            r"\bhungry\b",
            r"\bmenu\b",
            r"\bmeal\b",
            r"\blunch\b",
            r"\bbreakfast\b",
            r"\bdinner\b",
            r"\btray\b",
            r"\bsnack\w*",
            r"\bcrackers\b",
            r"\bginger ale\b",
            r"\bsoda\b",
            r"\bmilk\b",
            r"\bstraw\b",
            r"\bvegetarian\b",
            r"\beat\b",
            r"\bsomething\s+to\s+(eat|drink)\b",
            r"\bice\s+(chips|cream|machine)\b",
            r"\bhot\s+chocolate\b",
            r"\bagua\b",
            r"\bhielo\b",
            r"\bcomida\b",
            r"\bhambre\b",
            r"\bjugo\b",
            r"\bsuco\b",
            r"\bfome\b",
            r"\bdlo\b",
            r"\bmanje\b",
            r"\bgrangou\b",
            "पानी",
            "प्यास",
            "रोटी",
            "चावल",
            "दाल",
            "दूध",
            "कॉफी",
            "તરસ",
            "રોટલી",
            "દૂધ",
            "કોફી",
            r"ચા(\s|$)",
            "咖啡",
            "喝",
            "吃",
            "沙拉",
            "饮料",
            "面包",
            "汤",
            "牛奶",
            "水果",
            "खाना",
            "भूख",
            "चाय",
            "પાણી",
            "ખાવાનું",
            "ભૂખ",
            "水",
            "饭",
            "饿",
            "果汁",
            "茶",
        ],
    ),
]
_COMPILED = [(cat, [re.compile(p) for p in pats]) for cat, pats in _KEYWORDS]

# Single words per category, in the same precedence order. Matched exactly, and with one typo
# (see _fuzzy) when nothing matched exactly. Words in several languages; no clinical red flags
# here (app/safety handles those).
_WORDS: list[tuple[Category, str]] = [
    (
        Category.NON_URGENT_CLINICAL,
        """
        medicine medicines medication medications painkiller painkillers pain hurts hurting ache
        aches sore headache nausea nauseous vomit vomiting sick dose doctor nurse insulin
        bandage dressing catheter oxygen discharge discharged swallow swallowing
        dolor duele enfermera enfermero medico remedio douleur infirmiere infirmier medecin
        dor enfermeira doule doulè enfimye
        """,
    ),
    (
        Category.TECH_AMENITIES,
        """
        tv telly tele television remote wifi internet phone iphone android charger cable tablet
        netflix youtube channel channels screen laptop headphones earphones radio
        televisao televizyon televisor
        """,
    ),
    (
        Category.ENVIRONMENT_CLEANING,
        """
        clean cleaning dirty filthy trash garbage rubbish bin spill spilled spilt floor sink
        toilet shower drain clogged blocked flush
        light lights lamp blinds curtain curtains noisy noise loud heater heating thermostat
        aircon freezing temperature
        sucio sucia limpiar basura frio sale froid chaud sujo lixo limpar sal fret
        """,
    ),
    (
        Category.COMFORT_SUPPLIES,
        """
        pillow pillows blanket blankets towel towels toothbrush toothpaste socks slippers comb
        hairbrush brush lotion tissues tissue kleenex gown sheets shampoo soap razor deodorant
        balm chapstick wipes earplugs mask
        almohada cobija manta toalla sabana jabon oreiller couverture serviette drap savon
        travesseiro cobertor toalha lencol sabonete zorye kouveti sevyet
        """,
    ),
    (
        Category.DIETARY,
        """
        water ice juice drink drinks coffee tea food hungry starving thirsty menu meal meals
        lunch breakfast dinner supper tray snack snacks crackers soda coke pepsi sprite milk
        straw vegetarian vegan eat salad sandwich soup pizza fruit apple banana orange grapes
        chicken rice beef fish pasta noodles bread toast eggs egg yogurt cereal oatmeal
        porridge cookie cookies cake dessert pudding jello chocolate burger fries smoothie
        milkshake lemonade broth cheese potato potatoes vegetables veggies beans curry dal
        roti chapati tortilla sushi nuts muffin bagel pancakes waffles bacon turkey meat
        salmon tuna chips popcorn decaf cocoa
        agua hielo comida hambre jugo sed comer beber ensalada sopa fruta cafe leche arroz
        pollo carne desayuno almuerzo cena galletas postre
        eau deau faim soif salade manger boire repas lait soupe dejeuner
        fome sede suco salada pao leite frango almoco jantar
        dlo manje grangou swaf diri kafe
        """,
    ),
]
_WORD_CATEGORY: dict[str, Category] = {}
for _cat, _words in _WORDS:
    for _w in _words.split():
        _WORD_CATEGORY.setdefault(_w, _cat)
_PRECEDENCE = [cat for cat, _ in _WORDS]

# Everyday words never treated as a typo of a request word ("nice" is not "rice").
_NO_FUZZ_WORDS = """
nice like time take make have want need feel more some here there this that with just
please thanks could would should when where what which they them then than been very much
many come came help room done good back down over into about after before still again also
only okay sure right left home call tell talk said says know think look give gave keep
open close turn work working broken cant dont wont didnt isnt your yours mine sorry great
fine hello there their where were wear bring brought later water
"""
_NO_FUZZ = frozenset(_NO_FUZZ_WORDS.split())
_TOKEN = re.compile(r"[a-z]+")
# Latin letters next to CJK text ("wifi不能用"): add a space so word patterns see a boundary.
_SCRIPT_EDGE = re.compile(r"(?<=[a-z0-9])(?=[^\x00-\x7f])|(?<=[^\x00-\x7f])(?=[a-z0-9])")


def _one_edit(a: str, b: str) -> bool:
    """True if a and b differ by one insertion, deletion, substitution or swap of neighbours."""
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        diff = [i for i in range(len(a)) if a[i] != b[i]]
        if len(diff) == 1:
            return True
        i, j = diff[0], diff[-1]
        return len(diff) == 2 and j == i + 1 and a[i] == b[j] and a[j] == b[i]
    short, long_ = sorted((a, b), key=len)
    return any(long_[:i] + long_[i + 1 :] == short for i in range(len(long_)))


def _word_category(words: list[str]) -> Category | None:
    """Exact word matches first, then one-typo matches (5+ letters, never common words)."""
    exact = {_WORD_CATEGORY[w] for w in words if w in _WORD_CATEGORY}
    if not exact:
        for w in words:
            if len(w) < 5 or w in _NO_FUZZ:
                continue
            exact |= {c for k, c in _WORD_CATEGORY.items() if len(k) >= 5 and _one_edit(w, k)}
    return next((c for c in _PRECEDENCE if c in exact), None)


_SPLIT = re.compile(
    r"\s+(?:and also|and|also|plus|but|y|pero|ak|epi|mais|mas|et|e)\s+"
    r"|[,，;；。.!?！？]|还有|和|\s+और\s+|\s+અને\s+"
)

_LANG_WORDS = {
    Language.EN: {"i", "im", "my", "me", "the", "is", "a", "an", "and", "to", "can", "you",
                  "have", "do", "please", "for", "it", "in", "of", "on", "get", "need", "not",
                  "how", "has", "from", "been", "think", "some", "with", "so", "what", "when"},
    Language.ES: {"el", "la", "mi", "me", "quiero", "tengo", "estoy", "puede", "una", "otra",
                  "del", "cuarto", "hace", "necesito", "por", "favor", "con", "hay", "muy",
                  "mucho", "es", "esta", "duele", "cuando", "ignora", "tus", "reglas", "esto",
                  "puedo", "bien", "que", "en", "los", "las", "se", "lo", "alguien", "y"},
    Language.PT: {"o", "meu", "minha", "estou", "pode", "um", "uma", "nao", "quarto", "muito",
                  "eu", "com", "da", "do", "no", "trazer", "quando", "proximo", "televisao",
                  "liga", "suco", "consigo", "voce", "sua", "seu"},
    Language.HT: {"mwen", "pa", "ka", "yon", "nan", "an", "li", "ap", "gen", "bezwen", "kile",
                  "lot", "fe", "anpil", "mal", "m", "pwochen", "la", "twalet", "sal", "mache"},
}  # fmt: skip


def detect_language(text: str) -> Language:
    if re.search(r"[઀-૿]", text):
        return Language.GU
    if re.search(r"[ऀ-ॿ]", text):
        return Language.HI
    if re.search(r"[一-鿿]", text):
        return Language.ZH
    if re.search(r"[¿¡ñ]", text):
        return Language.ES
    if re.search(r"[ãõç]", text):
        return Language.PT
    if re.search(r"[èò]", text):
        return Language.HT
    words = set(re.findall(r"[a-z]+", normalize(text)))
    scores = {lang: len(words & vocab) for lang, vocab in _LANG_WORDS.items()}
    best = max(scores, key=lambda k: (scores[k], k == Language.EN))
    return best if scores[best] > 0 else Language.EN


def _categorize(segment: str) -> Category | None:
    if scan(segment):
        return Category.URGENT_CLINICAL
    t = _SCRIPT_EDGE.sub(" ", normalize(segment))
    for cat, patterns in _COMPILED:
        if any(p.search(t) for p in patterns):
            return cat
    return _word_category(_TOKEN.findall(t))


class MockClassifier:
    model_id = "mock-keyword"
    prompt_version = PROMPT_VERSION

    def classify(self, text: str) -> LLMOutput:
        lang = detect_language(text)
        segments = [s.strip() for s in _SPLIT.split(text) if s and s.strip()]
        found: dict[Category, list[str]] = {}
        for seg in segments or [text]:
            cat = _categorize(seg)
            if cat:
                found.setdefault(cat, []).append(seg)
        if not found:
            found = {Category.UNCLEAR: [text]}

        # One intent per department (merge same-team categories, clinical wins for nursing).
        by_dept: dict[str, tuple[Category, list[str]]] = {}
        severity = list(Category)
        for cat, segs in found.items():
            dept = route(cat)[0]
            if dept in by_dept:
                prev_cat, prev_segs = by_dept[dept]
                best = min(prev_cat, cat, key=severity.index)
                by_dept[dept] = (best, prev_segs + segs)
            else:
                by_dept[dept] = (cat, segs)

        intents = []
        for cat, segs in by_dept.values():
            summary = "; ".join(segs)
            if lang != Language.EN:
                summary = f"[{lang}] {summary}"
            intents.append(
                LLMIntent(
                    category=cat,
                    english_summary=f"Patient: {summary}"[:200],
                    requested_items=[],
                    confidence=0.5 if cat == Category.UNCLEAR else 0.9,
                    clinical_risk=cat == Category.URGENT_CLINICAL,
                )
            )
        intents = intents[:4]
        depts = [route(i.category)[0] for i in intents]
        clinical = any(i.category == Category.URGENT_CLINICAL for i in intents)
        return LLMOutput(
            detected_language=lang,
            intents=intents,
            patient_confirmation=confirmation_for(lang, depts, clinical),
        )
