import os
from datetime import UTC, datetime, timedelta

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.config import Settings
from app.main import create_app
from app.models import Language, Room
from app.staff import ScheduleBlock, StaffMember

os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")


@pytest.fixture
def settings() -> Settings:
    return Settings(app_env="test", classifier_mode="mock", _env_file=None)


@pytest.fixture
def dynamo():
    with mock_aws():
        yield boto3.resource("dynamodb", region_name="us-east-1")


@pytest.fixture
def app(settings, dynamo):
    application = create_app(settings, dynamo)
    application.state.rooms.put(
        Room(
            room_id="401",
            unit="4 West Med-Surg",
            patient_alias="Maya",
            preferred_language=Language.EN,
            primary_nurse="Nurse Jordan",
        )
    )
    return application


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


@pytest.fixture
def staffed(app):
    """Nursing: Jordan on a break, Priya available. Housekeeping: Ana and Marcus available."""
    now = datetime.now(UTC)
    shift = [
        ScheduleBlock(
            start=_iso(now - timedelta(hours=2)), end=_iso(now + timedelta(hours=6)), kind="shift"
        )
    ]
    brk = ScheduleBlock(
        start=_iso(now - timedelta(minutes=5)), end=_iso(now + timedelta(minutes=25)), kind="break"
    )
    roster = [
        StaffMember(
            staff_id="n-jordan", name="Nurse Jordan", department="nursing", schedule=[*shift, brk]
        ),
        StaffMember(staff_id="n-priya", name="Nurse Priya", department="nursing", schedule=shift),
        StaffMember(staff_id="h-ana", name="Ana", department="housekeeping", schedule=shift),
        StaffMember(staff_id="h-marcus", name="Marcus", department="housekeeping", schedule=shift),
    ]
    for m in roster:
        app.state.staff.put(m)
    app.state.rooms.put(
        Room(room_id="402", unit="u", patient_alias="Sofia", primary_nurse="Nurse Jordan")
    )
    return roster


def _iso(t):
    return t.isoformat().replace("+00:00", "Z")
