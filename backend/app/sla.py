"""Response-time targets: every request must be acknowledged, then resolved, within set minutes.

Missed acknowledgement → the request goes to a backup person, its priority rises one step and the
patient is told we're still looking for someone. Missed resolution → priority rises once and the
patient is told it's taking longer. TicketService.check_deadlines() applies these.
"""

from datetime import UTC, datetime, timedelta

from app.models import Priority, Ticket

ACK_MINUTES: dict[Priority, int] = {Priority.HIGH: 2, Priority.NORMAL: 5, Priority.LOW: 10}
RESOLVE_MINUTES: dict[Priority, int] = {Priority.HIGH: 15, Priority.NORMAL: 30, Priority.LOW: 60}

# Raised priority never reaches the urgent-clinical severity band (5) on lateness alone.
MAX_LATE_SEVERITY = 4
_NEXT: dict[Priority, Priority] = {
    Priority.LOW: Priority.NORMAL,
    Priority.NORMAL: Priority.HIGH,
    Priority.HIGH: Priority.HIGH,
}


def iso(t: datetime) -> str:
    return t.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def set_deadlines(ticket: Ticket, start: datetime) -> None:
    """Both deadlines from `start` (the request time) by the ticket's priority."""
    ticket.ack_due_at = iso(start + timedelta(minutes=ACK_MINUTES[ticket.priority]))
    ticket.resolve_due_at = iso(start + timedelta(minutes=RESOLVE_MINUTES[ticket.priority]))


def raise_priority(ticket: Ticket) -> None:
    ticket.priority = _NEXT[ticket.priority]
    if ticket.severity < MAX_LATE_SEVERITY:
        ticket.severity += 1
