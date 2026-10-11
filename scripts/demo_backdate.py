"""Demo helper: make a request miss its acknowledge deadline now (local DynamoDB only).

  uv run --project backend python scripts/demo_backdate.py <ticket_id>

The backend's deadline check (every 15 s, and on every dashboard load) then hands it to a backup,
raises its priority and tells the patient. Used by frontend/scripts/demo-video.mjs.
"""

import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
os.environ.setdefault("AWS_ACCESS_KEY_ID", "local")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "local")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

from app.config import Settings  # noqa: E402
from app.repo import TicketRepository, dynamo_resource  # noqa: E402

settings = Settings(
    dynamodb_endpoint_url=os.environ.get("DYNAMODB_ENDPOINT_URL", "http://localhost:8001"),
    app_env="local",
)
repo = TicketRepository(settings, dynamo_resource(settings))
ticket = repo.get(sys.argv[1])
if ticket is None:
    sys.exit(f"no ticket {sys.argv[1]}")
ticket.ack_due_at = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
repo.put(ticket)
print(f"{ticket.ticket_id} is now overdue for acknowledgement")
