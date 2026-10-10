"""Demo staff auth (role PIN → HMAC token carrying the role) and per-room rate limiting.

StaffAuth is an interface so Cognito / hospital SSO can replace the PIN check later.
"""

import base64
import hashlib
import hmac
import threading
import time
from collections import defaultdict, deque

from app.models import LOGIN_ROLES, Role


class StaffAuth:
    def __init__(self, pin: str, secret: str, ttl_s: int, admin_pin: str):
        self._pin = pin
        self._admin_pin = admin_pin
        self._secret = secret.encode()
        self._ttl = ttl_s

    def _sign(self, payload: str) -> str:
        mac = hmac.new(self._secret, payload.encode(), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(mac).decode().rstrip("=")

    def login(self, role: Role, pin: str) -> str | None:
        if role not in LOGIN_ROLES:
            return None
        expected = self._admin_pin if role == Role.ADMIN else self._pin
        if not hmac.compare_digest(pin.encode(), expected.encode()):
            return None
        payload = f"{role}.{int(time.time()) + self._ttl}"
        return f"{payload}.{self._sign(payload)}"

    def verify(self, token: str) -> Role | None:
        try:
            role, exp, sig = token.rsplit(".", 2)
        except ValueError:
            return None
        payload = f"{role}.{exp}"
        if not hmac.compare_digest(sig, self._sign(payload)):
            return None
        if not exp.isdigit() or int(exp) < time.time():
            return None
        try:
            verified = Role(role)
        except ValueError:
            return None
        return verified if verified in LOGIN_ROLES else None


class RateLimiter:
    """Sliding-window limiter per key (room). In-memory per process; API Gateway throttling
    is the outer limit in AWS."""

    def __init__(self, limit: int, window_s: float = 60.0):
        self.limit = limit
        self.window = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True
