"""Table definitions for local/test environments. AWS tables are created by CDK (infra/)."""

from botocore.exceptions import ClientError

from app.config import Settings


def table_specs(settings: Settings) -> list[dict]:
    return [
        {
            "TableName": settings.tickets_table,
            "KeySchema": [{"AttributeName": "ticket_id", "KeyType": "HASH"}],
            "AttributeDefinitions": [
                {"AttributeName": "ticket_id", "AttributeType": "S"},
                {"AttributeName": "department", "AttributeType": "S"},
                {"AttributeName": "status_created", "AttributeType": "S"},
                {"AttributeName": "room_id", "AttributeType": "S"},
                {"AttributeName": "created_at", "AttributeType": "S"},
            ],
            "GlobalSecondaryIndexes": [
                {
                    "IndexName": "by_department",
                    "KeySchema": [
                        {"AttributeName": "department", "KeyType": "HASH"},
                        {"AttributeName": "status_created", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "by_room",
                    "KeySchema": [
                        {"AttributeName": "room_id", "KeyType": "HASH"},
                        {"AttributeName": "created_at", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            "BillingMode": "PAY_PER_REQUEST",
        },
        {
            "TableName": settings.rooms_table,
            "KeySchema": [{"AttributeName": "room_id", "KeyType": "HASH"}],
            "AttributeDefinitions": [{"AttributeName": "room_id", "AttributeType": "S"}],
            "BillingMode": "PAY_PER_REQUEST",
        },
        {
            "TableName": settings.staff_table,
            "KeySchema": [{"AttributeName": "staff_id", "KeyType": "HASH"}],
            "AttributeDefinitions": [{"AttributeName": "staff_id", "AttributeType": "S"}],
            "BillingMode": "PAY_PER_REQUEST",
        },
    ]


def ensure_tables(resource, settings: Settings) -> list[str]:
    """Create any missing tables; returns the names that were created."""
    created = []
    client = resource.meta.client
    for spec in table_specs(settings):
        try:
            client.describe_table(TableName=spec["TableName"])
        except ClientError as e:
            if e.response["Error"]["Code"] != "ResourceNotFoundException":
                raise
            client.create_table(**spec)
            client.get_waiter("table_exists").wait(TableName=spec["TableName"])
            created.append(spec["TableName"])
    return created
