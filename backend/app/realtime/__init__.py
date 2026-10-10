"""Realtime event publishing. Transport-agnostic: the service layer only calls publish()."""

from typing import Literal, Protocol

from app.models import Ticket

EventType = Literal["ticket.created", "ticket.updated", "ticket.escalated"]


class Publisher(Protocol):
    def publish(self, event_type: EventType, ticket: Ticket) -> None: ...


class NullPublisher:
    """Used in AWS, where DynamoDB Streams → broadcaster Lambda does the fan-out."""

    def publish(self, event_type: EventType, ticket: Ticket) -> None:
        return None


def channels_for(ticket: Ticket) -> list[str]:
    channels = [f"dept:{ticket.department}", f"room:{ticket.room_id}"]
    if ticket.escalated_from:
        channels.append(f"dept:{ticket.escalated_from}")
    return channels


def is_staff_channel(channel: str) -> bool:
    """dept:* channels require a staff login; room:* channels are open to the bedside screen."""
    return channel.startswith("dept:")
