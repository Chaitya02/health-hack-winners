"""Bedside intake: turn the clinical notes typed at admission into a patient profile.

Deterministic keyword rules (like the safety layer), not an LLM: the result decides safety-relevant
behaviour (NPO, fall risk) and must be predictable. Matches preceded by a negation ("no fall risk",
"denies dizziness") are ignored.
"""

import re
from dataclasses import dataclass, field

from app.models import Accessibility, PatientProfile
from app.safety import normalize

NPO_REASON = "Nothing to eat or drink for now. Ask your nurse if you have questions."

# Applied to normalize()d notes: lowercase, Latin accents stripped, apostrophes dropped (cant).
_NEGATION = re.compile(r"\b(no|not|denies|without|never|negative for)\b[\w\s,/-]{0,20}$")


@dataclass(frozen=True)
class Rule:
    flag: str
    pattern: str
    tile: str | None = None  # request button this makes a priority

    @property
    def rx(self) -> re.Pattern[str]:
        return re.compile(self.pattern)


# Order matters: earlier rules put their button higher in the patient's top 3.
RULES: list[Rule] = [
    Rule(
        "low_vision",
        r"\bblind|low vision|visually impaired|poor (eye)?sight|vision loss|macular|cataract|glaucoma|cant see",
    ),
    Rule(
        "cannot_write",
        r"cant write|cannot write|unable to write|cant read|cannot read|illiterate|tremor|arthritis (in |of )?(the |both )?hands",
    ),
    Rule(
        "speech_difficulty",
        r"aphasia|non[ -]?verbal|cant speak|cannot speak|unable to speak|intubated|tracheostomy|\btrach\b|slurred speech",
    ),
    Rule(
        "npo",
        r"\bnpo\b|nil by mouth|nothing by mouth|\bfasting\b|pre[ -]?op|before (the )?surgery|surgery (today|tomorrow)",
    ),
    Rule(
        "fall_risk",
        r"fall risk|\bfalls?\b|unsteady|dizz|walker|hip fracture|weak legs|poor balance",
    ),
    Rule(
        "frequent_bathroom",
        r"frequent urination|urinary frequency|incontinen|diuretic|furosemide|lasix|\buti\b|overactive bladder|bathroom (often|a lot|frequently)|\bbph\b|prostate",
        "bathroom",
    ),
    Rule("pain", r"\bpain\b|post[ -]?op|after surgery|analgesi", "medication"),
    Rule("dehydration", r"dehydrat|dry mouth|thirst", "water"),
    Rule("feels_cold", r"feels? cold|chills|always cold", "blanket"),
    Rule("anxiety", r"anxi|depress|lonely|grief|bereave|panic|stress", "counseling"),
    Rule("spiritual", r"chaplain|spiritual|prayer|religio", "spiritual"),
    Rule("sleep", r"insomnia|cant sleep|trouble sleeping|poor sleep", "pillow"),
]

DIETARY_TILES = frozenset({"water", "ice", "food"})


@dataclass
class IntakeResult:
    profile: PatientProfile
    flags: list[str] = field(default_factory=list)


def _matches(rule: Rule, text: str) -> bool:
    return any(not _NEGATION.search(text[: m.start()]) for m in rule.rx.finditer(text))


def derive_profile(notes: str) -> IntakeResult:
    text = normalize(notes or "")
    flags = [r.flag for r in RULES if _matches(r, text)]
    has = set(flags).__contains__
    tiles = [r.tile for r in RULES if r.tile and r.flag in flags]
    if has("npo"):
        tiles = [t for t in tiles if t not in DIETARY_TILES]
    profile = PatientProfile(
        npo=has("npo"),
        npo_reason=NPO_REASON if has("npo") else None,
        fall_risk=has("fall_risk"),
        accessibility=Accessibility(
            low_vision=has("low_vision"),
            speech_difficulty=has("speech_difficulty"),
            cannot_write=has("cannot_write"),
        ),
        dashboard="audio" if has("low_vision") else "standard",
        priority_tiles=list(dict.fromkeys(tiles)),
        notes_flags=flags,
    )
    return IntakeResult(profile=profile, flags=flags)
