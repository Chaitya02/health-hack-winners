"""Department staff, their shift schedule, and who gets which request.

Demo roster: two people each in nursing, housekeeping and food (IT keeps a shared queue). Each has
today's shift with breaks; availability follows from the schedule. New requests go to an available
person with the fewest open tasks (nursing prefers the patient's primary nurse); if nobody is
available they wait as unassigned and are handed out as soon as someone is. Urgent clinical
requests are never left unassigned.
"""

import random
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.config import Settings
from app.models import OPEN_STATUSES, Category, Department, Ticket

StaffStatus = Literal["available", "break", "off"]

STAFFED_DEPARTMENTS = (Department.NURSING, Department.HOUSEKEEPING, Department.FOOD)

DEMO_STAFF: dict[Department, list[tuple[str, str]]] = {
    Department.NURSING: [("n-jordan", "Nurse Jordan"), ("n-priya", "Nurse Priya")],
    Department.HOUSEKEEPING: [("h-ana", "Ana"), ("h-marcus", "Marcus")],
    Department.FOOD: [("f-leo", "Leo"), ("f-grace", "Grace")],
}


class ScheduleBlock(BaseModel):
    start: str  # ISO UTC
    end: str
    kind: Literal["shift", "break"]


class StaffMember(BaseModel):
    staff_id: str
    name: str
    department: Department
    schedule: list[ScheduleBlock] = Field(default_factory=list)


class StaffView(StaffMember):
    """A staff member as the dashboards see them right now."""

    status: StaffStatus
    status_until: str | None  # when the status next changes
    open_tasks: int


def _iso(t: datetime) -> str:
    return t.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def generate_roster(
    now: datetime, seed: int | None = None, *, break_now: bool = True
) -> list[StaffMember]:
    """A random demo schedule around `now`: a 12-hour shift from 3 hours ago, with a 30-minute
    and a 15-minute break each. Breaks within a department never overlap, so one person is
    always on the floor during the shift. With `break_now`, one random person is on their
    30-minute break right now, so the demo shows requests going to the colleague."""
    rng = random.Random(seed)
    shift_start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=3)
    shift_end = shift_start + timedelta(hours=12)
    on_break_now = rng.choice([sid for people in DEMO_STAFF.values() for sid, _ in people])
    roster: list[StaffMember] = []
    for dept, people in DEMO_STAFF.items():
        taken: list[tuple[datetime, datetime]] = []
        for staff_id, name in people:
            blocks = [ScheduleBlock(start=_iso(shift_start), end=_iso(shift_end), kind="shift")]
            todo = (30, 15)
            if break_now and staff_id == on_break_now:
                start = now.replace(second=0, microsecond=0) - timedelta(minutes=10)
                taken.append((start, start + timedelta(minutes=30)))
                blocks.append(
                    ScheduleBlock(
                        start=_iso(start), end=_iso(start + timedelta(minutes=30)), kind="break"
                    )
                )
                todo = (15,)
            for minutes in todo:
                for _ in range(50):
                    offset = rng.randrange(30, 12 * 60 - minutes - 30, 15)
                    start = shift_start + timedelta(minutes=offset)
                    end = start + timedelta(minutes=minutes)
                    if all(end <= a or start >= b for a, b in taken):
                        taken.append((start, end))
                        blocks.append(ScheduleBlock(start=_iso(start), end=_iso(end), kind="break"))
                        break
            roster.append(
                StaffMember(staff_id=staff_id, name=name, department=dept, schedule=blocks)
            )
    return roster


def status_at(member: StaffMember, now: datetime) -> tuple[StaffStatus, str | None]:
    """Status at `now` and when it next changes."""
    shifts = [b for b in member.schedule if b.kind == "shift"]
    breaks = [b for b in member.schedule if b.kind == "break"]
    on_shift = next((b for b in shifts if _ts(b.start) <= now < _ts(b.end)), None)
    if on_shift is None:
        upcoming = sorted(_ts(b.start) for b in shifts if _ts(b.start) > now)
        return "off", _iso(upcoming[0]) if upcoming else None
    on_break = next((b for b in breaks if _ts(b.start) <= now < _ts(b.end)), None)
    if on_break:
        return "break", on_break.end
    upcoming = sorted(_ts(b.start) for b in breaks if _ts(b.start) > now)
    nxt = min([*upcoming, _ts(on_shift.end)])
    return "available", _iso(nxt)


def open_counts(tickets: list[Ticket]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for t in tickets:
        if t.assigned_to and t.status in OPEN_STATUSES:
            counts[t.assigned_to] = counts.get(t.assigned_to, 0) + 1
    return counts


def choose_assignee(
    staff: list[StaffMember],
    open_by_staff: dict[str, int],
    now: datetime,
    *,
    urgent: bool,
    preferred_name: str | None = None,
) -> StaffMember | None:
    """Available + least busy; ties go to the preferred person (the primary nurse), then by name.
    Nobody available: urgent → the least busy person still on shift (else anyone); otherwise None
    (the request waits as unassigned)."""

    def rank(m: StaffMember) -> tuple[int, int, str]:
        return (open_by_staff.get(m.staff_id, 0), 0 if m.name == preferred_name else 1, m.name)

    status = {m.staff_id: status_at(m, now)[0] for m in staff}
    available = [m for m in staff if status[m.staff_id] == "available"]
    if available:
        return min(available, key=rank)
    if not urgent or not staff:
        return None
    on_shift = [m for m in staff if status[m.staff_id] != "off"]
    return min(on_shift or staff, key=rank)


class StaffRepository:
    def __init__(self, settings: Settings, resource):
        self.table = resource.Table(settings.staff_table)

    def put(self, member: StaffMember) -> None:
        self.table.put_item(Item=member.model_dump(mode="json"))

    def all(self) -> list[StaffMember]:
        items: list[dict[str, Any]] = []
        kwargs: dict[str, Any] = {}
        while True:
            resp = self.table.scan(**kwargs)
            items.extend(resp.get("Items", []))
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        return sorted((StaffMember.model_validate(i) for i in items), key=lambda m: m.staff_id)

    def by_department(self, department: Department) -> list[StaffMember]:
        return [m for m in self.all() if m.department == department]


def is_urgent(ticket: Ticket) -> bool:
    return ticket.category == Category.URGENT_CLINICAL
