"""C3 (US-5): NPO and fall-risk patient-profile rules. They only move requests toward the nurse
or toward higher priority."""

import pytest

from app.models import Accessibility, PatientProfile, Room
from app.profile_rules import is_mobility_request
from tests.test_api import login, submit

NPO_ROOM, FALL_ROOM = "410", "412"


@pytest.fixture
def client(app, client):
    app.state.rooms.put(
        Room(
            room_id=NPO_ROOM,
            unit="u",
            patient_alias="Kiran",
            primary_nurse="n",
            profile=PatientProfile(npo=True, npo_reason="Surgery at 2 pm"),
        )
    )
    app.state.rooms.put(
        Room(
            room_id=FALL_ROOM,
            unit="u",
            patient_alias="Lin",
            primary_nurse="n",
            profile=PatientProfile(fall_risk=True, accessibility=Accessibility(low_vision=True)),
        )
    )
    return client


def tap(client, tile, room, **extra):
    body = {"room_id": room, "text": tile, "input_mode": "quick_tap", "tile": tile, **extra}
    return client.post("/api/requests", json=body)


# --- NPO -----------------------------------------------------------------------------------


@pytest.mark.parametrize("tile", ["water", "ice", "food"])
def test_npo_refuses_food_and_drink_tiles(client, tile):
    r = tap(client, tile, NPO_ROOM)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "npo" and detail["reason"] == "Surgery at 2 pm"
    assert "can't eat or drink" in detail["message"]
    assert client.get(f"/api/rooms/{NPO_ROOM}/tickets").json() == []


def test_npo_refusal_message_is_in_the_patients_language(client):
    r = tap(client, "water", NPO_ROOM, language_hint="es")
    assert "no puede comer ni beber" in r.json()["detail"]["message"]


@pytest.mark.parametrize("tile", ["pillow", "nurse", "bathroom"])
def test_npo_leaves_other_tiles_alone(client, tile):
    assert tap(client, tile, NPO_ROOM).status_code == 201


def test_npo_free_text_drink_request_goes_to_nurse(client):
    body = submit(client, "can I have some water", room=NPO_ROOM)
    [t] = body["tickets"]
    assert (t["department"], t["category"], t["priority"]) == (
        "nursing",
        "NON_URGENT_CLINICAL",
        "NORMAL",
    )
    assert "npo_dietary_request" in t["safety_reasons"]
    assert t["english_summary"].startswith("NPO patient asks for food/drink")
    assert "nurse will check with you first" in body["confirmation"]


def test_npo_multi_intent_only_reroutes_the_food_part(client):
    body = submit(client, "water and a pillow please", room=NPO_ROOM)
    assert sorted(t["department"] for t in body["tickets"]) == ["housekeeping", "nursing"]


def test_water_still_goes_to_food_without_npo(client):
    assert submit(client, "can I have some water")["tickets"][0]["department"] == "food"
    assert tap(client, "water", "401").status_code == 201


# --- fall risk -----------------------------------------------------------------------------


def test_fall_risk_bathroom_tile_is_high_priority_for_nurse(client):
    body = tap(client, "bathroom", FALL_ROOM).json()
    [t] = body["tickets"]
    assert (t["department"], t["category"], t["priority"], t["severity"]) == (
        "nursing",
        "NON_URGENT_CLINICAL",
        "HIGH",
        4,
    )
    assert "fall_risk" in t["safety_reasons"]
    assert t["eta_minutes"] == 2
    assert "stay in bed" in body["confirmation"]
    queue = client.get("/api/queues/nursing", headers=login(client, "nursing")).json()
    assert queue[0]["priority"] == "HIGH"


@pytest.mark.parametrize(
    "text",
    ["I need help getting up to walk to the toilet", "necesito ir al baño", "मुझे बाथरूम जाना है"],
)
def test_fall_risk_free_text_mobility_is_high_priority(client, text):
    [t] = submit(client, text, room=FALL_ROOM)["tickets"]
    assert t["department"] == "nursing" and t["priority"] == "HIGH"
    assert "fall_risk" in t["safety_reasons"]


def test_fall_risk_does_not_touch_non_nurse_requests(client):
    [t] = submit(client, "the bathroom is dirty", room=FALL_ROOM)["tickets"]
    assert (t["department"], t["priority"]) == ("housekeeping", "NORMAL")
    assert "fall_risk" not in t["safety_reasons"]


def test_bathroom_tile_without_fall_risk_stays_normal(client):
    [t] = tap(client, "bathroom", "401").json()["tickets"]
    assert t["priority"] == "NORMAL" and t["severity"] == 3


def test_fall_risk_never_lowers_an_urgent_request(client):
    [t] = submit(client, "chest pain, I need to get up", room=FALL_ROOM)["tickets"]
    assert (t["category"], t["priority"], t["severity"]) == ("URGENT_CLINICAL", "HIGH", 5)


@pytest.mark.parametrize(
    ("text", "tile", "expected"),
    [
        ("anything", "bathroom", True),
        ("help me up please", None, True),
        ("quiero levantarme", None, True),
        ("我想下床", None, True),
        ("the TV remote is broken", None, False),
        ("extra blanket", None, False),
    ],
)
def test_mobility_detection(text, tile, expected):
    assert is_mobility_request(text, tile) is expected
