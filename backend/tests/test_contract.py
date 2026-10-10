"""C1 data contract: patient profile, severity, ETA/history fields, roles, emotional support."""

import pytest

from app.classifier.decision import _SEVERITY
from app.models import (
    CLINICAL_CATEGORIES,
    ROUTING,
    SEVERITY,
    Category,
    Department,
    PatientProfile,
    PatientTicketView,
    Priority,
    Role,
    Room,
    StatusChange,
    Ticket,
)
from app.repo import RoomRepository, TicketRepository
from app.tiles import QUICK_TAP_TILES
from tests.test_api import login, submit


def _ticket(**overrides) -> Ticket:
    data = {
        "ticket_id": "t_1",
        "request_id": "r_1",
        "room_id": "401",
        "patient_alias": "Maya",
        "original_text": "pillow",
        "input_mode": "text",
        "detected_language": "en",
        "english_summary": "Patient requests an extra pillow.",
        "category": "COMFORT_SUPPLIES",
        "department": "housekeeping",
        "priority": "NORMAL",
        "confidence": 0.9,
        "clinical_risk_flag": False,
        "patient_confirmation": "Housekeeping is on the way.",
        "model_id": "mock",
        "prompt_version": "test",
        "latency_ms": 1,
    }
    return Ticket.model_validate({**data, **overrides})


def test_every_category_has_routing_and_severity():
    assert set(ROUTING) == set(Category)
    assert set(SEVERITY) == set(Category)
    assert all(1 <= s <= 5 for s in SEVERITY.values())
    assert SEVERITY[Category.URGENT_CLINICAL] == 5
    assert max(SEVERITY, key=SEVERITY.get) == Category.URGENT_CLINICAL


def test_emotional_support_routes_to_nurse_and_never_outranks_clinical_in_merges():
    assert ROUTING[Category.EMOTIONAL_SUPPORT] == (Department.NURSING, Priority.NORMAL)
    assert Category.EMOTIONAL_SUPPORT not in CLINICAL_CATEGORIES
    # decision.py merges same-department intents by enum order; clinical must win.
    for clinical in CLINICAL_CATEGORIES:
        assert _SEVERITY.index(clinical) < _SEVERITY.index(Category.EMOTIONAL_SUPPORT)


def test_severity_is_derived_from_category_when_omitted():
    assert _ticket().severity == 2
    assert _ticket(category="URGENT_CLINICAL", department="nursing").severity == 5
    assert _ticket(severity=4).severity == 4
    with pytest.raises(ValueError):
        _ticket(severity=6)


def test_new_ticket_fields_default_empty():
    t = _ticket()
    assert t.eta_minutes is None and t.history == []


def test_room_without_profile_gets_safe_defaults():
    room = Room.model_validate(
        {"room_id": "401", "unit": "u", "patient_alias": "Maya", "primary_nurse": "n"}
    )
    assert room.profile == PatientProfile()
    assert not room.profile.npo and not room.profile.fall_risk
    assert room.profile.attendant_preference == "any"


def test_profile_and_history_round_trip_through_dynamodb(settings, dynamo, app):
    rooms = RoomRepository(settings, dynamo)
    profile = PatientProfile(
        npo=True,
        npo_reason="Surgery at 2 pm",
        fall_risk=True,
        accessibility={"low_vision": True},
    )
    rooms.put(
        Room(room_id="410", unit="u", patient_alias="Kiran", primary_nurse="n", profile=profile)
    )
    assert rooms.get("410").profile == profile

    tickets = TicketRepository(settings, dynamo)
    change = StatusChange(status="ACKNOWLEDGED", at="2026-10-10T10:00:00.000Z", by_role=Role.NURSE)
    tickets.put(_ticket(eta_minutes=7, history=[change]))
    stored = tickets.get("t_1")
    assert stored.eta_minutes == 7 and stored.history == [change] and stored.severity == 2


def test_api_exposes_profile_severity_and_patient_view_fields(client):
    assert client.get("/api/rooms/401").json()["profile"]["npo"] is False
    t = submit(client, "chest pain")["tickets"][0]
    assert t["severity"] == 5
    view = client.get("/api/rooms/401/tickets").json()[0]
    assert set(view) == set(PatientTicketView.model_fields)
    assert "eta_minutes" in view and "history" in view


def test_escalation_raises_severity_to_max(client):
    t = submit(client, "extra pillow please")["tickets"][0]
    assert t["severity"] == 2
    r = client.patch(
        f"/api/tickets/{t['ticket_id']}",
        json={"action": "escalate_to_nurse"},
        headers=login(client),
    ).json()
    assert r["severity"] == 5


def test_nurse_tile_is_still_urgent():
    assert QUICK_TAP_TILES["nurse"][0] == Category.URGENT_CLINICAL
