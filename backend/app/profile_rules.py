"""Patient-profile rules (US-5): NPO and fall risk.

Like the safety rules, these only move a request toward the nurse or toward higher priority:
- NPO: food/drink quick-tap tiles are refused (the patient UI grays them out); free-text
  food/drink requests are rerouted to the nurse, who can explain or decide (e.g. ice chips).
- Fall risk: a nurse-bound mobility request (bathroom, getting up, walking) becomes HIGH priority.
"""

import re
from dataclasses import dataclass, field

from app.classifier import FinalIntent
from app.models import Category, Department, PatientProfile, Priority
from app.safety import normalize

NPO_REASON = "npo_dietary_request"
FALL_RISK_REASON = "fall_risk"
FALL_RISK_SEVERITY = 4  # below 5, which is reserved for urgent clinical

MOBILITY_TILES = frozenset({"bathroom"})

# Matched against normalize()d text (lowercased, Latin accents stripped). Only applied to
# nurse-bound intents, so "the bathroom is dirty" (housekeeping) is never affected.
_MOBILITY = re.compile(
    r"bathroom|restroom|toilet|commode|bedpan|\bpee\b|\bpoop\b|\bwalk|get up|getting up|"
    r"stand up|out of (?:the )?bed|help me up"
    r"|\bbano\b|levantar|caminar|ir al bano"  # es
    r"|banheiro|levantar|andar|sair da cama"  # pt
    r"|twalet|leve|mache"  # ht
    r"|बाथरूम|शौचालय|टॉयलेट|उठ|चल"  # hi
    r"|બાથરૂમ|શૌચાલય|ટોયલેટ|ઊભ|ચાલ"  # gu
    r"|厕所|洗手间|卫生间|起床|下床|走路|站起"  # zh
)


class ProfileRefusal(Exception):
    """A request the patient's profile rules out (e.g. a drink tile while NPO)."""

    def __init__(self, code: str, reason: str | None):
        super().__init__(code)
        self.code = code
        self.reason = reason


@dataclass
class Adjustment:
    priority: Priority | None = None
    severity: int | None = None
    reasons: list[str] = field(default_factory=list)


@dataclass
class ProfileResult:
    adjustments: list[Adjustment]  # one per intent, same order
    flags: set[str] = field(default_factory=set)  # "npo", "fall_risk" for patient messaging


def check_tile(profile: PatientProfile, tile: str, category: Category) -> None:
    if profile.npo and category == Category.DIETARY:
        raise ProfileRefusal("npo", profile.npo_reason)


def is_mobility_request(text: str, tile: str | None) -> bool:
    return tile in MOBILITY_TILES or bool(_MOBILITY.search(normalize(text)))


def apply_profile(
    profile: PatientProfile, intents: list[FinalIntent], text: str, tile: str | None
) -> ProfileResult:
    """Mutates intents (NPO reroute) and returns per-intent priority/severity adjustments."""
    result = ProfileResult(adjustments=[Adjustment() for _ in intents])

    if profile.npo:
        for intent, adj in zip(intents, result.adjustments, strict=True):
            if intent.category == Category.DIETARY:
                intent.category = Category.NON_URGENT_CLINICAL
                intent.english_summary = (
                    f"NPO patient asks for food/drink: {intent.english_summary}"
                )
                intent.safety_reasons.append(NPO_REASON)
                adj.reasons.append(NPO_REASON)
                result.flags.add("npo")

    if profile.fall_risk and is_mobility_request(text, tile):
        for intent, adj in zip(intents, result.adjustments, strict=True):
            if intent.department == Department.NURSING and intent.priority != Priority.HIGH:
                adj.priority = Priority.HIGH
                adj.severity = FALL_RISK_SEVERITY
                adj.reasons.append(FALL_RISK_REASON)
                intent.safety_reasons.append(FALL_RISK_REASON)
                result.flags.add("fall_risk")

    return result
