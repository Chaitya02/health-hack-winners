"""Local realtime transport: in-process WebSocket hub (used by `make dev`).

In AWS the same events are produced by the DynamoDB Streams broadcaster and delivered through
API Gateway WebSocket; clients speak the same subscribe protocol to both.
"""

import asyncio
import json
import logging
from collections import defaultdict
from datetime import UTC, datetime

from fastapi import WebSocket

from app.models import PatientTicketView, Ticket
from app.realtime import EventType, channels_for, is_staff_channel

log = logging.getLogger("tingting.realtime")


def event_payload(event_type: str, ticket: Ticket, *, patient_view: bool = False) -> str:
    """Staff channels get the full ticket; room channels only the patient view."""
    body = (
        PatientTicketView.model_validate(ticket.model_dump()).model_dump(mode="json")
        if patient_view
        else ticket.model_dump(mode="json")
    )
    return json.dumps(
        {
            "type": event_type,
            "ticket": body,
            "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }
    )


class LocalHub:
    def __init__(self) -> None:
        self._subs: dict[str, set[WebSocket]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self, ws: WebSocket, channel: str) -> None:
        self._subs[channel].add(ws)

    def remove(self, ws: WebSocket) -> None:
        for subs in self._subs.values():
            subs.discard(ws)

    def subscriber_count(self, channel: str) -> int:
        return len(self._subs.get(channel, ()))

    async def _send(self, deliveries: list[tuple[set[WebSocket], str]]) -> None:
        for targets, message in deliveries:
            for ws in targets:
                try:
                    await ws.send_text(message)
                except Exception:  # client went away; clean up
                    self.remove(ws)

    def _deliveries(self, event_type: str, ticket: Ticket) -> list[tuple[set[WebSocket], str]]:
        """Each socket gets one message: the full ticket if it is on a staff channel for this
        ticket, otherwise the patient view."""
        channels = channels_for(ticket)
        staff = {ws for ch in channels if is_staff_channel(ch) for ws in self._subs.get(ch, ())}
        rooms = {
            ws for ch in channels if not is_staff_channel(ch) for ws in self._subs.get(ch, ())
        } - staff
        return [
            (staff, event_payload(event_type, ticket)),
            (rooms, event_payload(event_type, ticket, patient_view=True)),
        ]

    def publish(self, event_type: EventType, ticket: Ticket) -> None:
        """Thread-safe: called from sync request handlers running in the threadpool."""
        if self._loop is None:
            return
        deliveries = self._deliveries(event_type, ticket)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self._loop:
            self._loop.create_task(self._send(deliveries))
        else:
            asyncio.run_coroutine_threadsafe(self._send(deliveries), self._loop)
