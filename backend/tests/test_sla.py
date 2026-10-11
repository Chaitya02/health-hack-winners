"""Response-time targets: late acknowledgement → backup + higher priority + patient told we're
still looking; late resolution → higher priority + patient told it's taking longer."""

from datetime import UTC, datetime, timedelta

from app.models import Priority
from app.sla import ACK_MINUTES, RESOLVE_MINUTES, parse
from tests.test_api import login, submit


def _later(ticket: dict, minutes: float) -> datetime:
    return parse(ticket["created_at"]) + timedelta(minutes=minutes)


def _get(app, ticket_id):
    return app.state.tickets.get(ticket_id)


def test_every_request_gets_both_deadlines_by_priority(client):
    t = submit(client, "extra pillow please")["tickets"][0]
    assert t["priority"] == "NORMAL"
    assert parse(t["ack_due_at"]) == _later(t, ACK_MINUTES[Priority.NORMAL])
    assert parse(t["resolve_due_at"]) == _later(t, RESOLVE_MINUTES[Priority.NORMAL])
    urgent = submit(client, "chest pain")["tickets"][0]
    assert parse(urgent["ack_due_at"]) == _later(urgent, ACK_MINUTES[Priority.HIGH])


def test_on_time_nothing_changes(app, client, staffed):
    t = submit(client, "extra pillow please")["tickets"][0]
    assert app.state.service.check_deadlines(_later(t, 4)) == 0
    assert _get(app, t["ticket_id"]).patient_notice is None


def test_late_acknowledgement_goes_to_a_backup_with_higher_priority(app, client, staffed):
    t = submit(client, "extra pillow please")["tickets"][0]
    first = t["assigned_name"]
    assert app.state.service.check_deadlines(_later(t, 5.1)) == 1
    late = _get(app, t["ticket_id"])
    assert late.assigned_name != first and late.assigned_name in {"Ana", "Marcus"}
    assert late.backup_from == first and late.backup_count == 1
    assert (late.priority, late.overdue, late.patient_notice) == (
        Priority.HIGH,
        "ack",
        "still_looking",
    )
    # The backup gets a fresh (now HIGH) window, so the next check doesn't bounce it straight back.
    assert app.state.service.check_deadlines(_later(t, 6)) == 0
    # The patient sees the notice; no staff names or patient words.
    [mine] = client.get("/api/rooms/401/tickets").json()
    assert mine["patient_notice"] == "still_looking" and "assigned_name" not in mine


def test_acknowledging_clears_the_patient_notice(app, client, staffed):
    t = submit(client, "extra pillow please")["tickets"][0]
    app.state.service.check_deadlines(_later(t, 6))
    hk = login(client, "housekeeping")
    r = client.patch(f"/api/tickets/{t['ticket_id']}", json={"action": "acknowledge"}, headers=hk)
    assert r.json()["patient_notice"] is None and r.json()["overdue"] is None


def test_nobody_else_available_keeps_the_assignee_and_still_tells_the_patient(app, client, staffed):
    t = submit(client, "I need help with my medication")["tickets"][0]
    assert t["assigned_name"] == "Nurse Priya"  # Jordan is on a break: no backup
    app.state.service.check_deadlines(_later(t, 5.1))
    late = _get(app, t["ticket_id"])
    assert late.assigned_name == "Nurse Priya" and late.backup_from is None
    assert late.patient_notice == "still_looking" and late.priority == Priority.HIGH


def test_late_resolution_raises_priority_once(app, client, staffed):
    t = submit(client, "extra pillow please")["tickets"][0]
    hk = login(client, "housekeeping")
    client.patch(f"/api/tickets/{t['ticket_id']}", json={"action": "acknowledge"}, headers=hk)
    assert app.state.service.check_deadlines(_later(t, 29)) == 0
    assert app.state.service.check_deadlines(_later(t, 31)) == 1
    late = _get(app, t["ticket_id"])
    assert (late.priority, late.overdue, late.patient_notice) == (
        Priority.HIGH,
        "resolve",
        "taking_longer",
    )
    assert late.severity <= 4  # lateness alone never reaches the urgent-clinical band
    assert app.state.service.check_deadlines(_later(t, 45)) == 0  # once only


def test_dashboards_apply_the_targets_when_they_load(app, client, staffed):
    t = submit(client, "extra pillow please")["tickets"][0]
    # Pretend it was created 10 minutes ago.
    old = _get(app, t["ticket_id"])
    old.ack_due_at = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
    app.state.tickets.put(old)
    queue = client.get("/api/queues/housekeeping", headers=login(client, "housekeeping")).json()
    assert next(q for q in queue if q["ticket_id"] == t["ticket_id"])["overdue"] == "ack"
