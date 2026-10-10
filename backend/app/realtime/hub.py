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

from app.models import Ticket
from app.realtime import EventType, channels_for

log = logging.getLogger("tingting.realtime")


def event_payload(event_type: str, ticket: Ticket) -> str:
    return json.dumps(
        {
            "type": event_type,
            "ticket": ticket.model_dump(mode="json"),
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

    async def _send(self, channels: list[str], message: str) -> None:
        targets = {ws for ch in channels for ws in self._subs.get(ch, ())}
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:  # client went away; clean up
                self.remove(ws)

    def publish(self, event_type: EventType, ticket: Ticket) -> None:
        """Thread-safe: called from sync request handlers running in the threadpool."""
        if self._loop is None:
            return
        message = event_payload(event_type, ticket)
        channels = channels_for(ticket)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self._loop:
            self._loop.create_task(self._send(channels, message))
        else:
            asyncio.run_coroutine_threadsafe(self._send(channels, message), self._loop)
