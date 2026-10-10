"""Unit metrics computed from today's tickets (UTC day)."""

from collections import Counter
from datetime import UTC, datetime
from statistics import mean

from pydantic import BaseModel

from app.models import Category, Department, Status, Ticket


class Metrics(BaseModel):
    since: str
    total: int
    by_category: dict[str, int]
    by_department: dict[str, int]
    diverted_from_nursing: int
    diverted_pct: float
    avg_ack_seconds: dict[str, float | None]
    avg_resolve_seconds: dict[str, float | None]
    urgent_count: int
    urgent_avg_ack_seconds: float | None
    fallback_count: int
    open_by_department: dict[str, int]


def _ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _avg(values: list[float]) -> float | None:
    return round(mean(values), 1) if values else None


def start_of_day() -> str:
    now = datetime.now(UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")


def compute(tickets: list[Ticket], since: str) -> Metrics:
    by_cat = Counter(str(t.category) for t in tickets)
    # Diversion is judged on where the ticket was originally routed (before any escalation).
    origin = [t.escalated_from or t.department for t in tickets]
    by_dept = Counter(str(d) for d in origin)
    diverted = sum(1 for d in origin if d != Department.NURSING)

    ack: dict[str, list[float]] = {str(d): [] for d in Department}
    res: dict[str, list[float]] = {str(d): [] for d in Department}
    urgent_ack: list[float] = []
    for t in tickets:
        created = _ts(t.created_at)
        if t.acknowledged_at:
            secs = (_ts(t.acknowledged_at) - created).total_seconds()
            ack[str(t.department)].append(secs)
            if t.category == Category.URGENT_CLINICAL:
                urgent_ack.append(secs)
        if t.resolved_at and t.status == Status.RESOLVED:  # cancelled ones were never done
            res[str(t.department)].append((_ts(t.resolved_at) - created).total_seconds())

    open_by_dept = Counter(str(t.department) for t in tickets if t.resolved_at is None)
    return Metrics(
        since=since,
        total=len(tickets),
        by_category={str(c): by_cat.get(str(c), 0) for c in Category},
        by_department={str(d): by_dept.get(str(d), 0) for d in Department},
        diverted_from_nursing=diverted,
        diverted_pct=round(100 * diverted / len(tickets), 1) if tickets else 0.0,
        avg_ack_seconds={k: _avg(v) for k, v in ack.items()},
        avg_resolve_seconds={k: _avg(v) for k, v in res.items()},
        urgent_count=by_cat.get(str(Category.URGENT_CLINICAL), 0),
        urgent_avg_ack_seconds=_avg(urgent_ack),
        fallback_count=sum(1 for t in tickets if t.audit.fallback),
        open_by_department={str(d): open_by_dept.get(str(d), 0) for d in Department},
    )
