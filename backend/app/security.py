"""Demo staff auth (per-department PIN → HMAC token) and per-room rate limiting.

StaffAuth is an interface so Cognito / hospital SSO can replace the PIN check later.
"""

import base64
import hashlib
import hmac
import threading
import time
from collections import defaultdict, deque

from app.models import Department


class StaffAuth:
    def __init__(self, pin: str, secret: str, ttl_s: int):
        self._pin = pin
        self._secret = secret.encode()
        self._ttl = ttl_s

    def _sign(self, payload: str) -> str:
        mac = hmac.new(self._secret, payload.encode(), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(mac).decode().rstrip("=")

    def login(self, department: Department, pin: str) -> str | None:
        if not hmac.compare_digest(pin.encode(), self._pin.encode()):
            return None
        payload = f"{department}.{int(time.time()) + self._ttl}"
        return f"{payload}.{self._sign(payload)}"

    def verify(self, token: str) -> Department | None:
        try:
            dept, exp, sig = token.rsplit(".", 2)
        except ValueError:
            return None
        payload = f"{dept}.{exp}"
        if not hmac.compare_digest(sig, self._sign(payload)):
            return None
        if not exp.isdigit() or int(exp) < time.time():
            return None
        try:
            return Department(dept)
        except ValueError:
            return None


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
