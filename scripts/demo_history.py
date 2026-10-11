"""Demo helper: fill the last 7 days with realistic, finished requests so the admin page has data.

  uv run --project backend python scripts/demo_history.py [--days 7] [--per-day 30]

Each request goes through the real service (keyword classifier, safety rules, staff assignment),
then gets plausible timestamps: busier around meals and evenings, acknowledge and resolve times
that differ by team and priority. Most are resolved; some are cancelled, nudged, noted or
escalated; a few of today's stay open. Local DynamoDB only. Synthetic data, no real patients.
"""

import argparse
import os
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
os.environ.setdefault("AWS_ACCESS_KEY_ID", "local")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "local")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

from app.classifier import MockClassifier  # noqa: E402
from app.config import Settings  # noqa: E402
from app.models import (  # noqa: E402
    CLOSED_STATUSES,
    CreateRequest,
    Department,
    InputMode,
    Priority,
    Role,
    Status,
    StatusChange,
    TicketNote,
)
from app.profile_rules import ProfileRefusal  # noqa: E402
from app.realtime import NullPublisher  # noqa: E402
from app.repo import RoomRepository, TicketRepository, dynamo_resource  # noqa: E402
from app.services import TicketService  # noqa: E402
from app.sla import iso, set_deadlines  # noqa: E402
from app.staff import StaffRepository  # noqa: E402

# (weight, text or None for a button, tile or None)
SAMPLES: list[tuple[int, str | None, str | None]] = [
    (8, None, "water"), (7, None, "pillow"), (6, None, "blanket"), (5, None, "bathroom"),
    (4, None, "food"), (4, None, "medication"), (3, None, "tv"), (3, None, "temperature"),
    (2, None, "ice"), (2, None, "family"), (1, None, "counseling"), (1, None, "spiritual"),
    (3, "Can I get some ice water please", None), (3, "extra pillow please", None),
    (2, "I want to have salade", None), (2, "the tv is not working", None),
    (2, "my room is too cold", None), (2, "the toilet won't flush", None),
    (2, "can I see the menu", None), (2, "I need my pain medicine", None),
    (2, "my IV is beeping", None), (2, "I'm hungry and the remote is broken", None),
    (2, "¿Me puede traer agua con hielo?", None), (2, "tengo frío, otra cobija por favor", None),
    (1, "我想要一杯热水", None), (1, "电视坏了", None), (1, "Mwen bezwen yon lòt kouvèti", None),
    (1, "ટીવી ચાલતું નથી", None), (1, "मुझे तकिया चाहिए", None), (1, "quero um suco", None),
    (1, "My surgical incision is throbbing and I feel dizzy.", None),
    (1, "my chest feels tight", None), (1, "I feel sick", None), (1, "I'm scared about tomorrow", None),
    (1, "the wifi is down", None), (1, "there's water on the floor", None),
]  # fmt: skip

# Minutes to acknowledge, then to resolve (mean, spread), by team.
ACK = {"nursing": (2.0, 1.2), "housekeeping": (3.5, 2.0), "food": (4.5, 2.5), "it": (7.0, 4.0)}
DONE = {"nursing": (9.0, 5.0), "housekeeping": (12.0, 6.0), "food": (18.0, 8.0), "it": (25.0, 12.0)}
# Hour-of-day weights (local): quiet nights, peaks at meals and evening.
HOURS = [1, 1, 1, 1, 1, 2, 4, 7, 9, 8, 6, 6, 9, 8, 6, 5, 6, 8, 9, 8, 7, 5, 3, 2]


def minutes(mean_spread: tuple[float, float], urgent: bool) -> float:
    mean, spread = mean_spread
    value = max(0.3, random.gauss(mean, spread))
    return value * (0.35 if urgent else 1.0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--per-day", type=int, default=30)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    random.seed(args.seed)

    settings = Settings(
        dynamodb_endpoint_url=os.environ.get("DYNAMODB_ENDPOINT_URL", "http://localhost:8001"),
        app_env="local",
        classifier_mode="mock",
    )
    db = dynamo_resource(settings)
    tickets = TicketRepository(settings, db)
    rooms = [r for i in range(401, 419) if (r := RoomRepository(settings, db).get(str(i)))]
    staff = StaffRepository(settings, db)
    svc = TicketService(tickets, MockClassifier(), NullPublisher(), staff=staff)
    members = {d: staff.by_department(d) for d in Department}

    now = datetime.now(UTC)
    local_offset = datetime.now().astimezone().utcoffset() or timedelta()
    made = 0
    for day in range(args.days):
        date = (now + local_offset).date() - timedelta(days=day)
        count = args.per_day + random.randint(-6, 8)
        for _ in range(count):
            hour = random.choices(range(24), weights=HOURS)[0]
            local = datetime(date.year, date.month, date.day, hour, random.randint(0, 59), tzinfo=UTC)
            created = local - local_offset
            if created > now - timedelta(minutes=10):
                continue  # only the past
            _, text, tile = random.choices(SAMPLES, weights=[s[0] for s in SAMPLES])[0]
            room = random.choice(rooms)
            req = CreateRequest(
                room_id=room.room_id,
                text=text or tile.replace("_", " ").title(),
                input_mode=InputMode.QUICK_TAP if tile else InputMode.TEXT,
                tile=tile,
                language_hint=room.preferred_language if tile else None,
            )
            try:
                result = svc.create(req, room)
            except ProfileRefusal:
                continue  # e.g. water for an NPO room: the button is grayed out
            for t in result.tickets:
                dept = str(t.department)
                urgent = t.priority == Priority.HIGH
                if dept != "nursing" and random.random() < 0.04:
                    svc.apply_action(t, "escalate_to_nurse", Role.SYSTEM)
                    dept = "nursing"
                c = created
                ack = c + timedelta(minutes=minutes(ACK[dept], urgent))
                done = ack + timedelta(minutes=minutes(DONE[dept], urgent))
                t.created_at = iso(c)
                set_deadlines(t, c)
                if members.get(t.department):
                    who = random.choice(members[t.department])
                    t.assigned_to, t.assigned_name, t.assigned_at = who.staff_id, who.name, iso(c)
                history = [StatusChange(status=Status.NEW, at=iso(c), by_role=Role.PATIENT)]
                if t.escalated_from:
                    history.append(StatusChange(status=Status.ESCALATED, at=iso(c), by_role=Role.SYSTEM))
                still_open = done > now
                roll = random.random()
                if roll < 0.05 and t.department != Department.NURSING:
                    t.status = Status.CANCELLED
                    t.resolved_at = iso(c + timedelta(minutes=random.uniform(1, 4)))
                    history.append(StatusChange(status=Status.CANCELLED, at=t.resolved_at, by_role=Role.PATIENT))
                elif still_open:
                    if ack < now:
                        t.status, t.acknowledged_at = Status.ACKNOWLEDGED, iso(ack)
                        history.append(StatusChange(status=Status.ACKNOWLEDGED, at=iso(ack), by_role=Role.SYSTEM))
                else:
                    t.status = Status.RESOLVED
                    t.acknowledged_at, t.resolved_at = iso(ack), iso(done)
                    history += [
                        StatusChange(status=Status.ACKNOWLEDGED, at=iso(ack), by_role=Role.SYSTEM),
                        StatusChange(status=Status.RESOLVED, at=iso(done), by_role=Role.SYSTEM),
                    ]
                t.history = history
                if random.random() < 0.12:
                    t.nudge_count = random.randint(1, 2)
                    t.last_nudge_at = iso(c + timedelta(minutes=3))
                if random.random() < 0.05:
                    t.notes = [TicketNote(text="Please hurry if you can", at=iso(c + timedelta(minutes=2)), by_role=Role.PATIENT)]
                if t.status in CLOSED_STATUSES:
                    t.overdue = t.patient_notice = None
                tickets.put(t)
                made += 1
    print(f"created {made} tickets over {args.days} days")


if __name__ == "__main__":
    main()
