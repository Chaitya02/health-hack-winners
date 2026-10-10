"""Bedside intake: notes → profile, dashboard and priority buttons; notes never sent back."""

import pytest

from app.intake import derive_profile
from app.models import Room
from tests.test_api import submit

LOW_VISION = (
    "82 y/o. Macular degeneration, poor eyesight. Uses the bathroom a lot at night "
    "(on furosemide). Unsteady on feet."
)
POST_OP = "Post-op day 1 after knee replacement. NPO for a second procedure tomorrow. Anxious."
COLD = "No fall risk. Denies pain. Feels cold, trouble sleeping. Dehydrated."


@pytest.fixture
def client(app, client):
    app.state.rooms.put(
        Room(
            room_id="400", unit="4 West", patient_alias="", primary_nurse="n", intake_complete=False
        )
    )
    return client


def intake(client, notes, name="Rosa", age=82, room="400", **extra):
    body = {"name": name, "age": age, "clinical_notes": notes, **extra}
    return client.put(f"/api/rooms/{room}/intake", json=body)


@pytest.mark.parametrize(
    ("notes", "flags", "dashboard", "tiles"),
    [
        (LOW_VISION, ["low_vision", "fall_risk", "frequent_bathroom"], "audio", ["bathroom"]),
        (POST_OP, ["npo", "pain", "anxiety"], "standard", ["medication", "counseling"]),
        (COLD, ["dehydration", "feels_cold", "sleep"], "standard", ["water", "blanket", "pillow"]),
        ("", [], "standard", []),
    ],
)
def test_notes_become_flags_dashboard_and_priority_buttons(notes, flags, dashboard, tiles):
    r = derive_profile(notes)
    assert r.flags == flags
    assert r.profile.dashboard == dashboard
    assert r.profile.priority_tiles == tiles


def test_negated_findings_are_ignored():
    r = derive_profile("No fall risk. Not NPO. Denies dizziness. Without pain.")
    assert r.flags == []


def test_npo_keeps_food_and_drink_out_of_the_top_buttons():
    r = derive_profile("NPO after midnight. Dry mouth, dehydrated. Frequent urination.")
    assert r.profile.npo and r.profile.npo_reason
    assert r.profile.priority_tiles == ["bathroom"]


def test_intake_saves_profile_and_never_returns_the_notes(client):
    assert client.get("/api/rooms/400").json()["intake_complete"] is False
    r = intake(client, LOW_VISION, preferred_language="es", gender="female")
    assert r.status_code == 200
    body = r.json()
    assert body["detected"] == ["low_vision", "fall_risk", "frequent_bathroom"]
    room = body["room"]
    assert (room["patient_alias"], room["age"], room["preferred_language"]) == ("Rosa", 82, "es")
    assert room["gender"] == "female"
    assert room["intake_complete"] is True and room["profile"]["dashboard"] == "audio"
    for r in (body, client.get("/api/rooms/400").json()):
        assert "clinical_notes" not in str(r) and "furosemide" not in str(r)
    # Saved on the server: the backend rules use it (fall risk raises bathroom requests).
    tapped = client.post(
        "/api/requests",
        json={"room_id": "400", "text": "b", "input_mode": "quick_tap", "tile": "bathroom"},
    ).json()["tickets"][0]
    assert tapped["priority"] == "HIGH"


def test_reset_starts_over_and_hides_the_previous_patients_requests(client):
    intake(client, COLD)
    submit(client, "extra pillow please", room="400")
    assert len(client.get("/api/rooms/400/tickets").json()) == 1
    r = client.delete("/api/rooms/400/intake").json()
    assert r["intake_complete"] is False and r["patient_alias"] == "" and r["age"] is None
    assert r["gender"] == "unspecified"
    assert r["profile"]["notes_flags"] == []
    assert client.get("/api/rooms/400/tickets").json() == []
    intake(client, POST_OP, name="Sam", age=54)
    assert client.get("/api/rooms/400/tickets").json() == []


@pytest.mark.parametrize(
    "body",
    [
        {"name": "", "age": 50},
        {"name": "A", "age": -1},
        {"name": "A", "age": 121},
        {"name": "A" * 41, "age": 50},
        {"name": "A", "age": 50, "clinical_notes": "x" * 1001},
        {"name": "A", "age": 50, "gender": "robot"},
    ],
)
def test_intake_validation(client, body):
    assert client.put("/api/rooms/400/intake", json=body).status_code == 422


def test_unknown_room(client):
    assert intake(client, "", room="999").status_code == 404


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_browser_preflight_allows_intake_methods(client, method):
    """The bedside page calls these cross-origin (Vite :5173 → API :8000)."""
    r = client.options(
        "/api/rooms/400/intake",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": method},
    )
    assert r.status_code == 200
    assert method in r.headers["access-control-allow-methods"]
