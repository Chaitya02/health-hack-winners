"""Staff schedules and assignment: available + least busy, primary nurse first, waiting requests
handed out when someone becomes available, urgent never left unassigned."""

from datetime import UTC, datetime, timedelta
from itertools import pairwise

import pytest

from app.models import Department, Room
from app.staff import (
    STAFFED_DEPARTMENTS,
    ScheduleBlock,
    StaffMember,
    choose_assignee,
    generate_roster,
    status_at,
)
from tests.test_api import login, submit
from tests.test_roles import admin, login_as

NOW = datetime(2026, 10, 10, 14, 7, tzinfo=UTC)


def iso(t: datetime) -> str:
    return t.isoformat().replace("+00:00", "Z")


def member(staff_id, name, dept=Department.NURSING, *, on_break=False, off=False):
    """On shift around now (or off shift), optionally on a break covering now."""
    start = NOW + timedelta(hours=1) if off else NOW - timedelta(hours=2)
    blocks = [ScheduleBlock(start=iso(start), end=iso(start + timedelta(hours=8)), kind="shift")]
    if on_break:
        blocks.append(
            ScheduleBlock(
                start=iso(NOW - timedelta(minutes=5)),
                end=iso(NOW + timedelta(minutes=25)),
                kind="break",
            )
        )
    return StaffMember(staff_id=staff_id, name=name, department=dept, schedule=blocks)


# --- schedule --------------------------------------------------------------------------------


def test_demo_roster_two_per_department_with_non_overlapping_breaks():
    roster = generate_roster(NOW, seed=3)
    assert sorted({m.department for m in roster}) == sorted(STAFFED_DEPARTMENTS)
    for dept in STAFFED_DEPARTMENTS:
        people = [m for m in roster if m.department == dept]
        assert len(people) == 2
        breaks = sorted((b.start, b.end) for m in people for b in m.schedule if b.kind == "break")
        assert all(a_end <= b_start for (_, a_end), (b_start, _) in pairwise(breaks))
    # Exactly one person is on a break right now; everyone else is available.
    statuses = [status_at(m, NOW)[0] for m in roster]
    assert statuses.count("break") == 1 and statuses.count("available") == 5
    assert generate_roster(NOW, seed=3) == roster  # reproducible with a seed


def test_status_and_when_it_changes():
    assert status_at(member("a", "A"), NOW)[0] == "available"
    status, until = status_at(member("a", "A", on_break=True), NOW)
    assert status == "break" and until == iso(NOW + timedelta(minutes=25))
    status, until = status_at(member("a", "A", off=True), NOW)
    assert status == "off" and until == iso(NOW + timedelta(hours=1))


# --- the rule --------------------------------------------------------------------------------


def test_available_and_least_busy_wins():
    a, b = member("a", "A"), member("b", "B")
    assert choose_assignee([a, b], {"a": 2, "b": 1}, NOW, urgent=False).staff_id == "b"


def test_primary_nurse_breaks_ties_but_not_workload():
    jordan, priya = member("j", "Nurse Jordan"), member("p", "Nurse Priya")
    assert (
        choose_assignee([jordan, priya], {}, NOW, urgent=False, preferred_name="Nurse Priya")
        is priya
    )
    pick = choose_assignee(
        [jordan, priya], {"p": 1}, NOW, urgent=False, preferred_name="Nurse Priya"
    )
    assert pick is jordan


def test_on_break_or_off_shift_people_are_skipped():
    a, b = member("a", "A", on_break=True), member("b", "B")
    assert choose_assignee([a, b], {"b": 5}, NOW, urgent=False) is b


def test_nobody_available_routine_waits_but_urgent_is_still_assigned():
    a, b = member("a", "A", on_break=True), member("b", "B", off=True)
    assert choose_assignee([a, b], {}, NOW, urgent=False) is None
    assert choose_assignee([a, b], {}, NOW, urgent=True) is a  # on shift (on break) beats off shift


# --- end to end ------------------------------------------------------------------------------


@pytest.fixture
def staffed(app):
    """Nursing: Jordan on a break, Priya available. Housekeeping: Ana and Marcus available."""
    now = datetime.now(UTC)
    shift = [
        ScheduleBlock(
            start=iso(now - timedelta(hours=2)), end=iso(now + timedelta(hours=6)), kind="shift"
        )
    ]
    brk = ScheduleBlock(
        start=iso(now - timedelta(minutes=5)), end=iso(now + timedelta(minutes=25)), kind="break"
    )
    roster = [
        StaffMember(
            staff_id="n-jordan", name="Nurse Jordan", department="nursing", schedule=[*shift, brk]
        ),
        StaffMember(staff_id="n-priya", name="Nurse Priya", department="nursing", schedule=shift),
        StaffMember(staff_id="h-ana", name="Ana", department="housekeeping", schedule=shift),
        StaffMember(staff_id="h-marcus", name="Marcus", department="housekeeping", schedule=shift),
    ]
    for m in roster:
        app.state.staff.put(m)
    app.state.rooms.put(
        Room(room_id="402", unit="u", patient_alias="Sofia", primary_nurse="Nurse Jordan")
    )
    return roster


def test_requests_go_to_whoever_is_available(client, staffed):
    t = submit(client, "I need help with my medication")["tickets"][0]
    assert (t["department"], t["assigned_name"]) == ("nursing", "Nurse Priya")  # Jordan on break
    hk = [submit(client, "extra pillow please")["tickets"][0]["assigned_name"] for _ in range(4)]
    assert sorted(hk) == ["Ana", "Ana", "Marcus", "Marcus"]  # least busy alternates
    it = submit(client, "the TV remote is broken")["tickets"][0]
    assert it["department"] == "it" and it["assigned_to"] is None  # IT keeps a shared queue


def test_waiting_requests_are_handed_out_when_someone_is_available(app, client, staffed):
    # Priya goes on break too: nobody available → routine nursing requests wait.
    priya = staffed[1].model_copy(deep=True)
    now = datetime.now(UTC)
    priya.schedule.append(
        ScheduleBlock(
            start=iso(now - timedelta(minutes=1)),
            end=iso(now + timedelta(minutes=30)),
            kind="break",
        )
    )
    app.state.staff.put(priya)
    waiting = submit(client, "I need help with my medication")["tickets"][0]
    assert waiting["assigned_to"] is None
    urgent = submit(client, "chest pain", room="402")["tickets"][0]
    assert urgent["assigned_to"] is not None  # urgent is never left waiting
    # Priya back from break → loading the staff panel hands her the waiting request.
    app.state.staff.put(staffed[1])
    nurse = login_as(client, role="nurse")
    staff = client.get("/api/staff/nursing", headers=nurse).json()
    assert {m["name"]: m["status"] for m in staff} == {
        "Nurse Jordan": "break",
        "Nurse Priya": "available",
    }
    queue = client.get("/api/queues/nursing", headers=nurse).json()
    assert (
        next(t for t in queue if t["ticket_id"] == waiting["ticket_id"])["assigned_name"]
        == "Nurse Priya"
    )


def test_escalation_reassigns_to_an_available_nurse(client, staffed):
    t = submit(client, "extra pillow please")["tickets"][0]
    r = client.patch(
        f"/api/tickets/{t['ticket_id']}",
        json={"action": "escalate_to_nurse"},
        headers=login(client),
    ).json()
    assert (r["department"], r["assigned_name"]) == ("nursing", "Nurse Priya")


def test_staff_panel_access_and_admin_workload(client, staffed):
    assert client.get("/api/staff/nursing").status_code == 401
    assert (
        client.get("/api/staff/nursing", headers=login_as(client, role="food")).status_code == 403
    )
    assert len(client.get("/api/staff/nursing", headers=admin(client)).json()) == 2
    submit(client, "I need help with my medication")
    a = client.get("/api/analytics", headers=admin(client)).json()
    priya = next(s for s in a["staff"] if s["name"] == "Nurse Priya")
    assert (priya["status"], priya["open_tasks"], priya["department"]) == (
        "available",
        1,
        "nursing",
    )
    assert priya["schedule"] and {s["name"] for s in a["staff"]} >= {
        "Ana",
        "Marcus",
        "Nurse Jordan",
    }


# --- US-6: attendant preference for bathroom help -----------------------------------------


def test_attendant_preference_picks_matching_gender_first():
    jordan = member("j", "Nurse Jordan").model_copy(update={"gender": "male"})
    priya = member("p", "Nurse Priya").model_copy(update={"gender": "female"})
    # Priya is busier but matches the preference.
    pick = choose_assignee([jordan, priya], {"p": 3}, NOW, urgent=False, attendant="female")
    assert pick is priya
    # Nobody matching is available → still someone available (never left waiting).
    priya_break = member("p", "Nurse Priya", on_break=True).model_copy(update={"gender": "female"})
    assert (
        choose_assignee([jordan, priya_break], {}, NOW, urgent=False, attendant="female") is jordan
    )


@pytest.fixture
def preferring_room(app, staffed):
    """Room 403 asks for a female attendant; both nurses available (Jordan's break removed)."""
    jordan = staffed[0].model_copy(
        update={"gender": "male", "schedule": [b for b in staffed[0].schedule if b.kind == "shift"]}
    )
    priya = staffed[1].model_copy(update={"gender": "female"})
    app.state.staff.put(jordan)
    app.state.staff.put(priya)
    app.state.rooms.put(
        Room(
            room_id="403",
            unit="u",
            patient_alias="Hetal",
            primary_nurse="Nurse Jordan",
            profile={"attendant_preference": "female"},
        )
    )
    return jordan, priya


def tap(client, tile, room="403"):
    return client.post(
        "/api/requests",
        json={"room_id": room, "text": tile, "input_mode": "quick_tap", "tile": tile},
    ).json()["tickets"][0]


def test_bathroom_help_goes_to_a_matching_attendant(client, preferring_room):
    t = tap(client, "bathroom")
    assert (t["assigned_name"], t["attendant_preference"], t["attendant_preference_met"]) == (
        "Nurse Priya",
        "female",
        True,
    )
    # Not a bathroom / mobility request → no preference applied (primary nurse Jordan, tie).
    other = tap(client, "medication")
    assert other["attendant_preference"] is None and other["attendant_preference_met"] is None


def test_preference_not_met_is_flagged_but_never_waits(app, client, preferring_room):
    _, priya = preferring_room
    now = datetime.now(UTC)
    on_break = priya.model_copy(deep=True)
    on_break.schedule.append(
        ScheduleBlock(
            start=iso(now - timedelta(minutes=1)),
            end=iso(now + timedelta(minutes=20)),
            kind="break",
        )
    )
    app.state.staff.put(on_break)
    t = tap(client, "bathroom")
    assert (t["assigned_name"], t["attendant_preference_met"]) == ("Nurse Jordan", False)


def test_intake_saves_attendant_preference(app, client):
    app.state.rooms.put(
        Room(room_id="400", unit="u", patient_alias="", primary_nurse="n", intake_complete=False)
    )
    body = {"name": "Rosa", "age": 82, "clinical_notes": "", "attendant_preference": "female"}
    room = client.put("/api/rooms/400/intake", json=body).json()["room"]
    assert room["profile"]["attendant_preference"] == "female"
    bad = {**body, "attendant_preference": "robot"}
    assert client.put("/api/rooms/400/intake", json=bad).status_code == 422
