"""C5 (US-1): request insights and CSV export for nurses and admins only."""

import csv
import io
from datetime import UTC, datetime

import pytest

from app import analytics
from app.models import PatientProfile, Room
from tests.test_api import submit
from tests.test_contract import _ticket
from tests.test_roles import admin, login_as
from tests.test_status_api import act, staff


def get(client, path="/api/analytics", headers=None, **params):
    return client.get(path, params=params, headers=headers or admin(client))


# --- access --------------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/api/analytics", "/api/analytics/export.csv"])
def test_only_nurses_and_admins_can_read_insights(client, path):
    assert client.get(path).status_code == 401
    for role in ("housekeeping", "food", "it"):
        assert client.get(path, headers=login_as(client, role=role)).status_code == 403
    assert client.get(path, headers=login_as(client, role="nurse")).status_code == 200
    assert client.get(path, headers=admin(client)).status_code == 200


@pytest.mark.parametrize("days", [0, 31])
def test_days_is_bounded(client, days):
    assert get(client, days=days).status_code == 422


# --- content -------------------------------------------------------------------------------


def test_insights_summarise_requests_timings_and_escalations(app, client):
    app.state.rooms.put(
        Room(
            room_id="412",
            unit="u",
            patient_alias="Lin",
            primary_nurse="n",
            profile=PatientProfile(fall_risk=True),
        )
    )
    pillow = submit(client, "extra pillow please")["tickets"][0]
    submit(client, "extra pillow please")
    blanket = submit(client, "a blanket please", room="412")["tickets"][0]
    submit(client, "chest pain")
    client.post(
        "/api/requests",
        json={"room_id": "412", "text": "bathroom", "input_mode": "quick_tap", "tile": "bathroom"},
    )
    staff(client, pillow["ticket_id"], "acknowledge")
    staff(client, pillow["ticket_id"], "resolve")
    act(client, blanket["ticket_id"], "still_waiting", room="412")
    act(client, blanket["ticket_id"], "add_note", "now my chest hurts", room="412")

    a = get(client).json()
    assert a["days"] == 1 and a["total"] == 5
    assert a["by_department"] == {"nursing": 3, "housekeeping": 2, "food": 0, "it": 0}
    assert sum(a["by_hour"]) == 5 and len(a["by_hour"]) == 24
    assert a["by_severity"]["5"] == 2  # chest pain + red-flag note escalation
    assert a["escalations"] == {
        "total": 1,
        "by_staff": 0,
        "by_patient_note": 1,
        "from_department": {"housekeeping": 1},
    }
    assert (a["nudged_requests"], a["nudges"], a["notes"]) == (1, 1, 1)
    assert a["fall_risk_priority"] == 1
    hk = next(x for x in a["times"] if x["department"] == "housekeeping")
    assert hk["requests"] == 2
    assert hk["median_ack_seconds"] is not None and hk["median_resolve_seconds"] is not None
    assert a["top_rooms"][0] == {"room_id": "401", "requests": 3, "nudges": 0}


def test_by_hour_uses_the_viewers_timezone():
    t = _ticket(created_at="2026-10-10T14:30:00.000Z")
    since = "2026-10-10T00:00:00Z"
    assert analytics.compute([t], since, 1).by_hour[14] == 1
    # New York in October: UTC-4 → getTimezoneOffset() = 240.
    assert analytics.compute([t], since, 1, tz_offset_minutes=240).by_hour[10] == 1


def test_window_start_covers_whole_days():
    now = datetime(2026, 10, 10, 15, 0, tzinfo=UTC)
    assert analytics.window_start(1, now) == "2026-10-10T00:00:00Z"
    assert analytics.window_start(7, now) == "2026-10-04T00:00:00Z"


def test_cancelled_requests_are_counted_but_not_timed(client):
    t = submit(client, "extra pillow please")["tickets"][0]
    act(client, t["ticket_id"], "cancel")
    a = get(client).json()
    assert a["cancelled"] == 1
    hk = next(x for x in a["times"] if x["department"] == "housekeeping")
    assert hk["median_resolve_seconds"] is None


# --- CSV -----------------------------------------------------------------------------------


def test_csv_export_has_one_row_per_ticket_and_no_patient_words(client):
    submit(client, "my secret words: extra pillow please")
    submit(client, "chest pain")
    r = get(client, "/api/analytics/export.csv")
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="tingting-requests-1d.csv"' in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) == 2 and list(rows[0]) == analytics.CSV_COLUMNS
    assert "secret" not in r.text and "Maya" not in r.text
    assert {row["department"] for row in rows} == {"housekeeping", "nursing"}


def test_csv_cells_neutralise_formula_injection():
    assert analytics._cell('=HYPERLINK("http://x")') == '\'=HYPERLINK("http://x")'
    assert analytics._cell("@SUM(A1)").startswith("'")
    assert analytics._cell("nursing") == "nursing" and analytics._cell(None) == ""
