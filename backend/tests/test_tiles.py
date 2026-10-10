import pytest

from app.models import Category, Department, route
from app.tiles import QUICK_TAP_TILES


def submit_tile(client, tile: str) -> dict:
    r = client.post(
        "/api/requests",
        json={"room_id": "401", "text": tile, "input_mode": "quick_tap", "tile": tile},
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.parametrize(
    ("tile", "department", "priority", "category"),
    [
        ("water", "food", "NORMAL", "DIETARY"),
        ("ice", "food", "NORMAL", "DIETARY"),
        ("pillow", "housekeeping", "NORMAL", "COMFORT_SUPPLIES"),
        ("blanket", "housekeeping", "NORMAL", "COMFORT_SUPPLIES"),
        ("temperature", "housekeeping", "NORMAL", "ENVIRONMENT_CLEANING"),
        ("tv", "it", "LOW", "TECH_AMENITIES"),
        ("food", "food", "NORMAL", "DIETARY"),
        ("medication", "nursing", "NORMAL", "NON_URGENT_CLINICAL"),
        ("family", "nursing", "NORMAL", "EMOTIONAL_SUPPORT"),
        ("counseling", "nursing", "NORMAL", "EMOTIONAL_SUPPORT"),
        ("spiritual", "nursing", "NORMAL", "EMOTIONAL_SUPPORT"),
        ("bathroom", "nursing", "NORMAL", "NON_URGENT_CLINICAL"),
        ("nurse", "nursing", "HIGH", "URGENT_CLINICAL"),
    ],
)
def test_every_tile_routes_deterministically(client, tile, department, priority, category):
    (t,) = submit_tile(client, tile)["tickets"]
    assert (t["department"], t["priority"], t["category"]) == (department, priority, category)
    assert t["model_id"] == "quick_tap"


def test_medication_never_leaves_nursing():
    category = QUICK_TAP_TILES["medication"][0]
    assert route(category)[0] == Department.NURSING


def test_tile_keys_fit_the_request_schema():
    # CreateRequest.tile: max 20 chars, ^[a-z_]+$
    for key in QUICK_TAP_TILES:
        assert len(key) <= 20 and key.replace("_", "").isalpha() and key.islower()


def test_only_the_nurse_tile_is_urgent():
    urgent = [k for k, (c, _, _) in QUICK_TAP_TILES.items() if c == Category.URGENT_CLINICAL]
    assert urgent == ["nurse"]
