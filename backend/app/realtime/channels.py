"""Channel authorization, shared by the local WebSocket and the AWS subscribe Lambda.

- room:<id>        open (a patient's own request status; contains no other patients' data)
- dept:<department> requires a staff token for that department
"""

import re

from app.models import Department
from app.security import StaffAuth

_ROOM = re.compile(r"^room:[A-Za-z0-9-]{1,10}$")
MAX_CHANNELS = 8


def authorize_channels(
    channels, token: str | None, auth: StaffAuth
) -> tuple[list[str], str | None]:
    if not isinstance(channels, list) or not channels or len(channels) > MAX_CHANNELS:
        return [], "channels must be a non-empty list"
    staff_dept = auth.verify(token) if token else None
    allowed: list[str] = []
    for ch in channels:
        if not isinstance(ch, str):
            return [], "invalid channel"
        if _ROOM.match(ch):
            allowed.append(ch)
            continue
        if ch.startswith("dept:"):
            try:
                dept = Department(ch.removeprefix("dept:"))
            except ValueError:
                return [], f"unknown channel {ch}"
            if staff_dept != dept:
                return [], f"staff login required for {ch}"
            allowed.append(ch)
            continue
        return [], f"unknown channel {ch}"
    return allowed, None
