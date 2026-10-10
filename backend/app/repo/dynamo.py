"""DynamoDB repository. Works against DynamoDB Local (endpoint_url) and AWS."""

import json
import secrets
import time
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr, Key

from app.config import Settings
from app.models import Department, Room, Status, Ticket


def new_id(prefix: str = "") -> str:
    """Time-sortable id: 12 hex chars of epoch ms + 8 random hex chars."""
    return f"{prefix}{int(time.time() * 1000):012x}{secrets.token_hex(4)}"


def _to_dynamo(obj: Any) -> Any:
    # Round-trip through JSON so floats become Decimal and enums become strings.
    return json.loads(json.dumps(obj, default=str), parse_float=Decimal)


def _from_dynamo(obj: Any) -> Any:
    if isinstance(obj, list):
        return [_from_dynamo(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _from_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    return obj


def dynamo_resource(settings: Settings):
    kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.dynamodb_endpoint_url:
        kwargs["endpoint_url"] = settings.dynamodb_endpoint_url
        # DynamoDB Local accepts any credentials.
        kwargs.setdefault("aws_access_key_id", "local")
        kwargs.setdefault("aws_secret_access_key", "local")
    return boto3.resource("dynamodb", **kwargs)


class TicketRepository:
    def __init__(self, settings: Settings, resource=None):
        self._db = resource or dynamo_resource(settings)
        self.table = self._db.Table(settings.tickets_table)

    @staticmethod
    def _item(ticket: Ticket) -> dict[str, Any]:
        item = _to_dynamo(ticket.model_dump(mode="json"))
        item["status_created"] = f"{ticket.status}#{ticket.created_at}"
        return {k: v for k, v in item.items() if v is not None}

    @staticmethod
    def _ticket(item: dict[str, Any]) -> Ticket:
        data = _from_dynamo(item)
        data.pop("status_created", None)
        return Ticket.model_validate(data)

    def put(self, ticket: Ticket) -> Ticket:
        self.table.put_item(Item=self._item(ticket))
        return ticket

    def get(self, ticket_id: str) -> Ticket | None:
        item = self.table.get_item(Key={"ticket_id": ticket_id}).get("Item")
        return self._ticket(item) if item else None

    def by_department(
        self, department: Department, status: Status | None = None, limit: int = 200
    ) -> list[Ticket]:
        cond = Key("department").eq(str(department))
        if status:
            cond = cond & Key("status_created").begins_with(f"{status}#")
        items = self._query(IndexName="by_department", KeyConditionExpression=cond, limit=limit)
        tickets = [self._ticket(i) for i in items]
        return sorted(tickets, key=lambda t: t.created_at, reverse=True)

    def by_room(self, room_id: str, limit: int = 50) -> list[Ticket]:
        items = self._query(
            IndexName="by_room",
            KeyConditionExpression=Key("room_id").eq(room_id),
            ScanIndexForward=False,
            limit=limit,
        )
        return [self._ticket(i) for i in items]

    def since(self, created_after: str) -> list[Ticket]:
        """All tickets created after an ISO timestamp (metrics; small demo volumes)."""
        items: list[dict] = []
        kwargs: dict[str, Any] = {"FilterExpression": Attr("created_at").gte(created_after)}
        while True:
            resp = self.table.scan(**kwargs)
            items.extend(resp.get("Items", []))
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        return [self._ticket(i) for i in items]

    def _query(self, limit: int, **kwargs) -> list[dict]:
        items: list[dict] = []
        while len(items) < limit:
            resp = self.table.query(**kwargs)
            items.extend(resp.get("Items", []))
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        return items[:limit]


class RoomRepository:
    def __init__(self, settings: Settings, resource=None):
        self._db = resource or dynamo_resource(settings)
        self.table = self._db.Table(settings.rooms_table)

    def put(self, room: Room) -> None:
        self.table.put_item(Item=_to_dynamo(room.model_dump(mode="json")))

    def get(self, room_id: str) -> Room | None:
        item = self.table.get_item(Key={"room_id": room_id}).get("Item")
        return Room.model_validate(_from_dynamo(item)) if item else None

    def count(self) -> int:
        return self.table.scan(Select="COUNT")["Count"]
