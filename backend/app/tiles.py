"""Quick-tap tile → category mapping. Owned by the patient-UI track (see docs/TEAM_PLAN.md)."""

from app.models import Category

# Quick-tap tiles are deterministic: no LLM call, instant and demo-proof.
QUICK_TAP_TILES: dict[str, tuple[Category, str, list[str]]] = {
    "water": (Category.DIETARY, "Patient requests water.", ["water"]),
    "ice": (Category.DIETARY, "Patient requests ice.", ["ice"]),
    "pillow": (Category.COMFORT_SUPPLIES, "Patient requests an extra pillow.", ["pillow"]),
    "blanket": (Category.COMFORT_SUPPLIES, "Patient requests a blanket.", ["blanket"]),
    "bathroom": (
        Category.NON_URGENT_CLINICAL,
        "Patient needs help getting to the bathroom (mobility / fall risk).",
        [],
    ),
    "temperature": (
        Category.ENVIRONMENT_CLEANING,
        "Patient asks to adjust the room temperature.",
        [],
    ),
    "tv": (Category.TECH_AMENITIES, "Patient needs help with the TV / remote.", ["tv remote"]),
    "food": (Category.DIETARY, "Patient asks about food / the menu.", ["menu"]),
    "nurse": (
        Category.URGENT_CLINICAL,
        "Patient pressed 'I need my nurse'.",
        [],
    ),
}
