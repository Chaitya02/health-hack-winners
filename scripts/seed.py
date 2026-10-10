"""Seed the synthetic unit "4 West Med-Surg" (rooms 401–420).

All names are invented first-name aliases. No real patient data.

Usage:
  uv run --project backend python scripts/seed.py                 # DynamoDB Local (localhost:8001)
  uv run --project backend python scripts/seed.py --aws           # tables in AWS (names from env)
"""

import argparse
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.config import Settings  # noqa: E402
from app.models import Language, Room  # noqa: E402
from app.repo import RoomRepository, dynamo_resource, ensure_tables  # noqa: E402

UNIT = "4 West Med-Surg"
NURSES = ["Nurse Jordan", "Nurse Priya", "Nurse Luis", "Nurse Mei"]

# (alias, preferred language) — synthetic only.
PATIENTS: list[tuple[str, Language]] = [
    ("Maya", Language.EN),
    ("Sofia", Language.ES),
    ("Arjun", Language.HI),
    ("Hetal", Language.GU),
    ("Wei", Language.ZH),
    ("Jean", Language.HT),
    ("Ana", Language.PT),
    ("Sam", Language.EN),
    ("Diego", Language.ES),
    ("Kiran", Language.HI),
    ("Nirav", Language.GU),
    ("Lin", Language.ZH),
    ("Marie", Language.HT),
    ("Joao", Language.PT),
    ("Alex", Language.EN),
    ("Lucia", Language.ES),
    ("Robin", Language.EN),
    ("Taylor", Language.EN),
    ("Rosa", Language.ES),
    ("Chris", Language.EN),
]


def build_rooms() -> list[Room]:
    return [
        Room(
            room_id=str(401 + i),
            unit=UNIT,
            patient_alias=alias,
            preferred_language=lang,
            primary_nurse=NURSES[i // 5],
        )
        for i, (alias, lang) in enumerate(PATIENTS)
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aws", action="store_true", help="seed AWS tables (no local endpoint)")
    args = parser.parse_args()

    overrides = {}
    if not args.aws:
        overrides["dynamodb_endpoint_url"] = os.environ.get(
            "DYNAMODB_ENDPOINT_URL", "http://localhost:8001"
        )
        overrides["app_env"] = "local"
    settings = Settings(**overrides)
    db = dynamo_resource(settings)
    if not args.aws:
        ensure_tables(db, settings)

    repo = RoomRepository(settings, db)
    rooms = build_rooms()
    for room in rooms:
        repo.put(room)

    print(f"Seeded unit '{UNIT}' into table {settings.rooms_table}")
    print(f"  rooms in table: {repo.count()}")
    print(f"  rooms: {rooms[0].room_id}–{rooms[-1].room_id}")
    langs = Counter(str(r.preferred_language) for r in rooms)
    print("  preferred languages: " + ", ".join(f"{k}={v}" for k, v in sorted(langs.items())))
    nurses = Counter(r.primary_nurse for r in rooms)
    print("  primary nurses: " + ", ".join(f"{k}={v}" for k, v in nurses.items()))


if __name__ == "__main__":
    main()
