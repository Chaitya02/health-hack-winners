"""Seed the synthetic unit "4 West Med-Surg": rooms 401–420, plus bedside demo room 400.

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

from app.config import Settings
from app.models import Accessibility, AttendantPreference, Language, PatientProfile, Room
from app.repo import RoomRepository, dynamo_resource, ensure_tables

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


# Demo patient profiles for the personalization stories (US-4, US-5). Rooms 401–405 are used by
# the Playwright suite, so profiles live on 410–418 to keep those flows unchanged.
PROFILES: dict[str, PatientProfile] = {
    "410": PatientProfile(npo=True, npo_reason="Nothing to eat or drink before surgery today."),
    "412": PatientProfile(fall_risk=True, attendant_preference=AttendantPreference.FEMALE),
    "414": PatientProfile(
        accessibility=Accessibility(low_vision=True), diet="Low sodium", dashboard="audio"
    ),
    "416": PatientProfile(accessibility=Accessibility(speech_difficulty=True), fall_risk=True),
    "418": PatientProfile(accessibility=Accessibility(cannot_write=True), diet="Diabetic"),
}


# Synthetic ages, one per room 401–420.
AGES = [67, 54, 71, 45, 82, 38, 76, 59, 63, 48, 88, 52, 69, 79, 41, 73, 57, 84, 66, 50]

# Room 400 is the bedside demo tablet: empty, so the home page starts at the intake form.
DEMO_ROOM = "400"


def build_rooms() -> list[Room]:
    demo = Room(
        room_id=DEMO_ROOM,
        unit=UNIT,
        patient_alias="",
        primary_nurse=NURSES[0],
        intake_complete=False,
    )
    return [
        demo,
        *(
            Room(
                room_id=str(401 + i),
                unit=UNIT,
                patient_alias=alias,
                preferred_language=lang,
                primary_nurse=NURSES[i // 5],
                profile=PROFILES.get(str(401 + i), PatientProfile()),
                age=AGES[i],
            )
            for i, (alias, lang) in enumerate(PATIENTS)
        ),
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
    print(f"  rooms: {rooms[1].room_id}–{rooms[-1].room_id}, demo bedside tablet: {DEMO_ROOM}")
    langs = Counter(str(r.preferred_language) for r in rooms)
    print("  preferred languages: " + ", ".join(f"{k}={v}" for k, v in sorted(langs.items())))
    nurses = Counter(r.primary_nurse for r in rooms)
    print(f"  patient profiles: rooms {', '.join(sorted(PROFILES))}")
    print("  primary nurses: " + ", ".join(f"{k}={v}" for k, v in nurses.items()))


if __name__ == "__main__":
    main()
