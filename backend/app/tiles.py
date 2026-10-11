"""Quick-tap tile → category mapping."""

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
    # Medication is always clinical: it sits under "Food & medication" but routes to nursing.
    "medication": (
        Category.NON_URGENT_CLINICAL,
        "Patient has a question or request about their medication.",
        [],
    ),
    "family": (Category.EMOTIONAL_SUPPORT, "Patient would like help contacting family.", []),
    "counseling": (Category.EMOTIONAL_SUPPORT, "Patient would like someone to talk to.", []),
    "spiritual": (Category.EMOTIONAL_SUPPORT, "Patient requests spiritual care.", []),
    "nurse": (
        Category.URGENT_CLINICAL,
        "Patient pressed 'I need my nurse'.",
        [],
    ),
}
