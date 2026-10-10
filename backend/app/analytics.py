"""Request insights for clinical and admin users (US-1): volumes, timings, escalations, rooms.

Works on stored tickets only; nothing here is patient-identifying beyond the room number.
"""

import csv
import io
from collections import Counter
from datetime import UTC, datetime, timedelta
from statistics import median

from pydantic import BaseModel

from app.models import Category, Department, Status, Ticket

MAX_DAYS = 30
TOP_ROOMS = 5

CSV_COLUMNS = [
    "ticket_id",
    "request_id",
    "created_at",
    "room_id",
    "input_mode",
    "detected_language",
    "category",
    "department",
    "escalated_from",
    "priority",
    "severity",
    "status",
    "ack_seconds",
    "resolve_seconds",
    "nudge_count",
    "note_count",
    "safety_reasons",
    "fallback",
    "model_id",
]


class DepartmentTimes(BaseModel):
    department: Department
    requests: int
    median_ack_seconds: float | None
    median_resolve_seconds: float | None


class RoomActivity(BaseModel):
    room_id: str
    requests: int
    nudges: int


class Escalations(BaseModel):
    total: int
    by_staff: int
    by_patient_note: int
    from_department: dict[str, int]


class Analytics(BaseModel):
    since: str
    days: int
    total: int
    by_category: dict[str, int]
    by_department: dict[str, int]
    by_severity: dict[str, int]
    by_hour: list[int]  # 24 buckets in the viewer's local time
    times: list[DepartmentTimes]
    escalations: Escalations
    cancelled: int
    nudged_requests: int
    nudges: int
    notes: int
    fallbacks: int
    npo_reroutes: int
    fall_risk_priority: int
    top_rooms: list[RoomActivity]


def _ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _seconds(start: str, end: str | None) -> float | None:
    return (_ts(end) - _ts(start)).total_seconds() if end else None


def _median(values: list[float]) -> float | None:
    return round(median(values), 1) if values else None


def window_start(days: int, now: datetime | None = None) -> str:
    """Start of the UTC day `days - 1` days ago, so days=1 means today."""
    now = now or datetime.now(UTC)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    return start.isoformat().replace("+00:00", "Z")


def compute(tickets: list[Ticket], since: str, days: int, tz_offset_minutes: int = 0) -> Analytics:
    """tz_offset_minutes follows JavaScript's Date.getTimezoneOffset() (UTC minus local)."""
    by_hour = [0] * 24
    for t in tickets:
        local = _ts(t.created_at) - timedelta(minutes=tz_offset_minutes)
        by_hour[local.hour] += 1

    times = []
    for dept in Department:
        mine = [t for t in tickets if t.department == dept]
        ack = [s for t in mine if (s := _seconds(t.created_at, t.acknowledged_at)) is not None]
        done = [
            s
            for t in mine
            if t.status == Status.RESOLVED
            and (s := _seconds(t.created_at, t.resolved_at)) is not None
        ]
        times.append(
            DepartmentTimes(
                department=dept,
                requests=len(mine),
                median_ack_seconds=_median(ack),
                median_resolve_seconds=_median(done),
            )
        )

    reasons = [set(t.safety_reasons) for t in tickets]
    escalated = [t for t in tickets if t.escalated_from or t.status == Status.ESCALATED]
    rooms = Counter(t.room_id for t in tickets)
    nudges_by_room = Counter()
    for t in tickets:
        nudges_by_room[t.room_id] += t.nudge_count

    return Analytics(
        since=since,
        days=days,
        total=len(tickets),
        by_category={str(c): sum(t.category == c for t in tickets) for c in Category},
        by_department={str(d): sum(t.department == d for t in tickets) for d in Department},
        by_severity={str(s): sum(t.severity == s for t in tickets) for s in range(1, 6)},
        by_hour=by_hour,
        times=times,
        escalations=Escalations(
            total=len(escalated),
            by_staff=sum("staff_escalation" in r for r in reasons),
            by_patient_note=sum("patient_note_red_flag" in r for r in reasons),
            from_department=dict(
                Counter(str(t.escalated_from) for t in escalated if t.escalated_from)
            ),
        ),
        cancelled=sum(t.status == Status.CANCELLED for t in tickets),
        nudged_requests=sum(t.nudge_count > 0 for t in tickets),
        nudges=sum(t.nudge_count for t in tickets),
        notes=sum(len(t.notes) for t in tickets),
        fallbacks=sum(bool(t.audit.fallback) for t in tickets),
        npo_reroutes=sum("npo_dietary_request" in r for r in reasons),
        fall_risk_priority=sum("fall_risk" in r for r in reasons),
        top_rooms=[
            RoomActivity(room_id=room, requests=n, nudges=nudges_by_room[room])
            for room, n in sorted(rooms.items(), key=lambda kv: (-kv[1], kv[0]))[:TOP_ROOMS]
        ],
    )


def _cell(value: object) -> str:
    text = "" if value is None else str(value)
    # Spreadsheet formula injection guard. Every column is system-generated today, but a cell
    # starting with =+-@ must never become a live formula if a free-text column is added later.
    return f"'{text}" if text[:1] in ("=", "+", "-", "@") else text


def to_csv(tickets: list[Ticket]) -> str:
    """One row per ticket. Leaves out the patient's words (original text, notes, and the
    English summary, which paraphrases them) and the patient alias."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(CSV_COLUMNS)
    for t in sorted(tickets, key=lambda t: t.created_at):
        row = {
            **t.model_dump(mode="json"),
            "ack_seconds": _seconds(t.created_at, t.acknowledged_at),
            "resolve_seconds": _seconds(t.created_at, t.resolved_at)
            if t.status == Status.RESOLVED
            else None,
            "note_count": len(t.notes),
            "safety_reasons": ";".join(t.safety_reasons),
            "fallback": t.audit.fallback,
        }
        writer.writerow([_cell(row.get(c)) for c in CSV_COLUMNS])
    return out.getvalue()
