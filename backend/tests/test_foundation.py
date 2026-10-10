from app.models import (
    Category,
    Department,
    InputMode,
    Language,
    Priority,
    Status,
    Ticket,
    route,
)
from app.repo import new_id


def make_ticket(**overrides) -> Ticket:
    data = {
        "ticket_id": new_id("t_"),
        "request_id": new_id("r_"),
        "room_id": "401",
        "patient_alias": "Maya",
        "original_text": "extra pillow please",
        "input_mode": InputMode.TEXT,
        "detected_language": Language.EN,
        "english_summary": "Patient requests an extra pillow.",
        "category": Category.COMFORT_SUPPLIES,
        "department": Department.HOUSEKEEPING,
        "priority": Priority.NORMAL,
        "confidence": 0.95,
        "clinical_risk_flag": False,
        "patient_confirmation": "Housekeeping is on the way.",
        "model_id": "mock",
        "prompt_version": "test",
        "latency_ms": 5,
    }
    data.update(overrides)
    return Ticket(**data)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["classifier_mode"] == "mock"


def test_routing_matrix_clinical_always_nursing():
    for cat in (Category.URGENT_CLINICAL, Category.NON_URGENT_CLINICAL, Category.UNCLEAR):
        assert route(cat)[0] == Department.NURSING
    assert route(Category.URGENT_CLINICAL)[1] == Priority.HIGH
    assert route(Category.TECH_AMENITIES) == (Department.IT, Priority.LOW)
    assert route(Category.COMFORT_SUPPLIES)[0] == Department.HOUSEKEEPING
    assert route(Category.DIETARY)[0] == Department.FOOD


def test_repo_roundtrip_and_queries(app):
    repo = app.state.tickets
    pillow = repo.put(make_ticket())
    urgent = repo.put(
        make_ticket(
            category=Category.URGENT_CLINICAL,
            department=Department.NURSING,
            priority=Priority.HIGH,
            confidence=0.88,
            clinical_risk_flag=True,
            safety_reasons=["red_flag:pre:bleeding"],
        )
    )
    assert repo.get(pillow.ticket_id) == pillow
    assert [t.ticket_id for t in repo.by_department(Department.HOUSEKEEPING)] == [pillow.ticket_id]
    assert [t.ticket_id for t in repo.by_department(Department.NURSING)] == [urgent.ticket_id]
    assert repo.by_department(Department.NURSING, Status.RESOLVED) == []
    assert len(repo.by_room("401")) == 2


def test_room_lookup(app):
    room = app.state.rooms.get("401")
    assert room is not None and room.patient_alias == "Maya"
    assert app.state.rooms.get("999") is None


def test_ids_are_time_sortable():
    a, b = new_id(), new_id()
    assert a[:12] <= b[:12]
