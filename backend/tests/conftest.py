import os

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.config import Settings
from app.main import create_app
from app.models import Language, Room

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
