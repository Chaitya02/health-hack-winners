"""C2: status history, ETA, and patient actions while waiting (cancel / still waiting / note)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.models import Department, Priority, Status
from app.services import DEFAULT_ETA_MINUTES
from tests.test_api import login, submit
from tests.test_contract import _ticket


def act(client, ticket_id, action, note=None, room="401"):
    body = {"action": action} | ({"note": note} if note is not None else {})
    return client.patch(f"/api/rooms/{room}/tickets/{ticket_id}", json=body)


def staff(client, ticket_id, action, dept="housekeeping"):
    return client.patch(
        f"/api/tickets/{ticket_id}", json={"action": action}, headers=login(client, dept)
    )


def pillow(client):
    return submit(client, "extra pillow please")["tickets"][0]


# --- history -------------------------------------------------------------------------------


def test_new_ticket_starts_history_and_staff_actions_append_with_role(client):
    t = pillow(client)
    assert [(h["status"], h["by_role"]) for h in t["history"]] == [("NEW", "patient")]
    staff(client, t["ticket_id"], "acknowledge")
    staff(client, t["ticket_id"], "start")
    r = staff(client, t["ticket_id"], "resolve").json()
    assert [(h["status"], h["by_role"]) for h in r["history"]] == [
        ("NEW", "patient"),
        ("ACKNOWLEDGED", "housekeeping"),
        ("IN_PROGRESS", "housekeeping"),
        ("RESOLVED", "housekeeping"),
    ]


def test_patient_view_shows_history_and_eta(client):
    t = pillow(client)
    staff(client, t["ticket_id"], "acknowledge")
    view = client.get("/api/rooms/401/tickets").json()[0]
    assert [h["status"] for h in view["history"]] == ["NEW", "ACKNOWLEDGED"]
    assert view["eta_minutes"] == DEFAULT_ETA_MINUTES[Priority.NORMAL]


# --- ETA -----------------------------------------------------------------------------------


def test_eta_defaults_by_priority(client):
    assert pillow(client)["eta_minutes"] == DEFAULT_ETA_MINUTES[Priority.NORMAL]
    assert submit(client, "chest pain")["tickets"][0]["eta_minutes"] == 2


def test_eta_learns_median_from_todays_resolved_tickets(app):
    now = datetime.now(UTC).replace(microsecond=0)
    for i, minutes in enumerate([4, 6, 20]):
        created = now - timedelta(minutes=30)
        app.state.tickets.put(
            _ticket(
                ticket_id=f"t_{i}",
                status=Status.RESOLVED,
                created_at=created.isoformat().replace("+00:00", "Z"),
                resolved_at=(created + timedelta(minutes=minutes))
                .isoformat()
                .replace("+00:00", "Z"),
            )
        )
    svc = app.state.service
    assert svc.eta_minutes(Department.HOUSEKEEPING, Priority.NORMAL) == 6
    # Other priorities / departments don't borrow these samples.
    assert (
        svc.eta_minutes(Department.HOUSEKEEPING, Priority.LOW) == DEFAULT_ETA_MINUTES[Priority.LOW]
    )
    assert svc.eta_minutes(Department.FOOD, Priority.NORMAL) == DEFAULT_ETA_MINUTES[Priority.NORMAL]


# --- cancel --------------------------------------------------------------------------------


def test_patient_can_cancel_non_clinical_request(client):
    t = pillow(client)
    r = act(client, t["ticket_id"], "cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "CANCELLED"
    assert r.json()["history"][-1] == {**r.json()["history"][-1], "by_role": "patient"}
    # Closed for everyone.
    assert act(client, t["ticket_id"], "cancel").status_code == 409
    assert staff(client, t["ticket_id"], "acknowledge").status_code == 409


@pytest.mark.parametrize("text", ["chest pain", "I need help with my medication"])
def test_patient_cannot_cancel_clinical_request(client, text):
    t = submit(client, text)["tickets"][0]
    assert t["department"] == "nursing"
    r = act(client, t["ticket_id"], "cancel")
    assert r.status_code == 409
    assert "nurse" in r.json()["detail"]


def test_patient_cannot_cancel_after_staff_escalation(client):
    t = pillow(client)
    staff(client, t["ticket_id"], "escalate_to_nurse")
    assert act(client, t["ticket_id"], "cancel").status_code == 409


def test_cancelled_tickets_do_not_count_as_resolved_in_metrics(client):
    act(client, pillow(client)["ticket_id"], "cancel")
    m = client.get("/api/metrics").json()
    assert m["avg_resolve_seconds"]["housekeeping"] is None
    assert m["open_by_department"]["housekeeping"] == 0


# --- still waiting -------------------------------------------------------------------------


def test_still_waiting_counts_and_raises_severity_but_never_to_urgent(client):
    t = pillow(client)
    assert t["severity"] == 2
    for _ in range(4):
        assert act(client, t["ticket_id"], "still_waiting").status_code == 200
    stored = client.get("/api/queues/housekeeping", headers=login(client)).json()[0]
    assert stored["nudge_count"] == 4 and stored["last_nudge_at"]
    assert stored["severity"] == 4
    assert stored["priority"] == "NORMAL" and stored["department"] == "housekeeping"


# --- notes ---------------------------------------------------------------------------------


def test_benign_note_is_stored_and_routing_unchanged(client):
    t = pillow(client)
    r = act(client, t["ticket_id"], "add_note", "Two pillows if possible")
    assert r.status_code == 200 and r.json()["department"] == "housekeeping"
    stored = client.get("/api/queues/housekeeping", headers=login(client)).json()[0]
    assert stored["notes"][0]["text"] == "Two pillows if possible"
    assert stored["notes"][0]["by_role"] == "patient"


@pytest.mark.parametrize("note", ["now my chest hurts", "dolor de pecho", "I cant breathe"])
def test_red_flag_note_escalates_to_nurse(client, note):
    t = pillow(client)
    r = act(client, t["ticket_id"], "add_note", note).json()
    assert (r["department"], r["status"], r["priority"]) == ("nursing", "ESCALATED", "HIGH")
    assert r["history"][-1]["by_role"] == "system"
    nursing = client.get("/api/queues/nursing", headers=login(client, "nursing")).json()
    stored = next(x for x in nursing if x["ticket_id"] == t["ticket_id"])
    assert stored["escalated_from"] == "housekeeping"
    assert stored["severity"] == 5
    assert "patient_note_red_flag" in stored["safety_reasons"]
    # Gone from housekeeping.
    hk = client.get("/api/queues/housekeeping", headers=login(client)).json()
    assert t["ticket_id"] not in [x["ticket_id"] for x in hk]


def test_red_flag_note_on_already_urgent_ticket_adds_reasons_only(client):
    t = submit(client, "chest pain")["tickets"][0]
    r = act(client, t["ticket_id"], "add_note", "I cant breathe").json()
    assert r["status"] == "NEW"
    nursing = client.get("/api/queues/nursing", headers=login(client, "nursing")).json()
    stored = next(x for x in nursing if x["ticket_id"] == t["ticket_id"])
    assert "breathing" in stored["safety_reasons"]


# --- validation / scoping ------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {"action": "add_note"},
        {"action": "add_note", "note": "   "},
        {"action": "add_note", "note": "x" * 201},
        {"action": "cancel", "note": "why"},
        {"action": "delete"},
    ],
)
def test_patient_action_validation(client, body):
    t = pillow(client)
    assert client.patch(f"/api/rooms/401/tickets/{t['ticket_id']}", json=body).status_code == 422


def test_patient_action_is_scoped_to_the_room(app, client):
    from app.models import Room

    app.state.rooms.put(Room(room_id="402", unit="u", patient_alias="Sofia", primary_nurse="n"))
    t = pillow(client)
    assert act(client, t["ticket_id"], "cancel", room="402").status_code == 404
    assert act(client, "t_missing", "cancel").status_code == 404
