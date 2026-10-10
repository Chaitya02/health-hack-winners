from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.models.enums import (
    AttendantPreference,
    Category,
    Department,
    InputMode,
    Language,
    Priority,
    Role,
    Status,
)
from app.models.routing import default_severity

MAX_TEXT_LEN = 500
MAX_NOTE_LEN = 200
MAX_NOTES_LEN = 1000
MAX_PROCEDURES = 5

Gender = Literal["female", "male", "unspecified"]


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Accessibility(BaseModel):
    low_vision: bool = False
    speech_difficulty: bool = False
    cannot_write: bool = False


class PatientProfile(BaseModel):
    """Care-team-entered patient context (EMR-sourced later; seeded synthetic data for now)."""

    npo: bool = False
    npo_reason: str | None = Field(default=None, max_length=120)
    fall_risk: bool = False
    diet: str | None = Field(default=None, max_length=60)
    accessibility: Accessibility = Field(default_factory=Accessibility)
    attendant_preference: AttendantPreference = AttendantPreference.ANY
    # Set from the intake notes (app/intake.py): which dashboard to show and which request
    # buttons come first; notes_flags names what was recognised.
    dashboard: Literal["standard", "audio"] = "standard"
    priority_tiles: list[str] = Field(default_factory=list)
    notes_flags: list[str] = Field(default_factory=list)


class Procedure(BaseModel):
    """A scheduled procedure the patient is told about (name and time only)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=60)
    at: AwareDatetime


class Room(BaseModel):
    room_id: str
    unit: str
    patient_alias: str
    preferred_language: Language = Language.EN
    primary_nurse: str
    profile: PatientProfile = Field(default_factory=PatientProfile)
    age: int | None = Field(default=None, ge=0, le=120)
    # Only used to pick the bathroom icon on the bedside screen.
    gender: Gender = "unspecified"
    # Free-text notes from the intake form. Stored for re-deriving the profile, never returned by
    # the open room endpoints (see RoomView).
    clinical_notes: str | None = Field(default=None, max_length=MAX_NOTES_LEN)
    intake_complete: bool = True
    intake_at: str | None = None  # requests before this belong to the previous patient
    procedures: list[Procedure] = Field(default_factory=list, max_length=MAX_PROCEDURES)


class RoomView(BaseModel):
    """What the bedside screen gets for its room: everything except the clinical notes."""

    room_id: str
    unit: str
    patient_alias: str
    preferred_language: Language
    primary_nurse: str
    profile: PatientProfile
    age: int | None
    gender: Gender = "unspecified"
    intake_complete: bool
    intake_at: str | None
    procedures: list[Procedure] = Field(default_factory=list)


class TicketAudit(BaseModel):
    rules_pre: list[str] = Field(default_factory=list)
    rules_post: list[str] = Field(default_factory=list)
    llm_decision: dict[str, Any] | None = None
    final_decision: dict[str, Any] = Field(default_factory=dict)
    fallback: str | None = None


class StatusChange(BaseModel):
    status: Status
    at: str
    by_role: Role


class TicketNote(BaseModel):
    text: str = Field(max_length=MAX_NOTE_LEN)
    at: str
    by_role: Role


class Ticket(BaseModel):
    model_config = ConfigDict(use_enum_values=False)

    ticket_id: str
    request_id: str
    room_id: str
    patient_alias: str
    original_text: str = Field(max_length=MAX_TEXT_LEN)
    input_mode: InputMode
    # Quick-tap tile key (e.g. "pillow") so the patient UI can name the request without free text.
    tile: str | None = Field(default=None, max_length=20)
    detected_language: Language
    english_summary: str
    category: Category
    department: Department
    priority: Priority
    severity: int = Field(ge=1, le=5)  # derived from category when omitted
    confidence: float = Field(ge=0, le=1)
    clinical_risk_flag: bool
    safety_reasons: list[str] = Field(default_factory=list)
    requested_items: list[str] = Field(default_factory=list)
    patient_confirmation: str
    status: Status = Status.NEW
    created_at: str = Field(default_factory=utc_now_iso)
    acknowledged_at: str | None = None
    resolved_at: str | None = None
    escalated_from: Department | None = None
    # Who in the department has it (app/staff.py); None = waiting for someone to be available.
    assigned_to: str | None = None
    assigned_name: str | None = None
    assigned_at: str | None = None
    # US-6: the patient's preferred attendant for bathroom help, and whether the assignee matches.
    attendant_preference: AttendantPreference | None = None
    attendant_preference_met: bool | None = None
    eta_minutes: int | None = Field(default=None, ge=0)
    history: list[StatusChange] = Field(default_factory=list)
    notes: list[TicketNote] = Field(default_factory=list)
    nudge_count: int = Field(default=0, ge=0)  # times the patient tapped "still waiting"
    last_nudge_at: str | None = None
    model_id: str
    prompt_version: str
    latency_ms: int = Field(ge=0)
    audit: TicketAudit = Field(default_factory=TicketAudit)

    @model_validator(mode="before")
    @classmethod
    def _default_severity(cls, data: Any) -> Any:
        # Tickets stored before severity existed, and callers that don't set it.
        if isinstance(data, dict) and data.get("severity") is None and "category" in data:
            data = {**data, "severity": default_severity(Category(data["category"]))}
        return data


class PatientTicketView(BaseModel):
    """What the bedside screen may see. Room endpoints and the room WebSocket channel need no
    login, so this carries no patient words (original text, notes, English summary), no audit
    and no safety reasons. Pydantic drops every other Ticket field when validating from one."""

    ticket_id: str
    department: Department
    category: Category
    tile: str | None = None
    priority: Priority
    status: Status
    patient_confirmation: str
    created_at: str
    eta_minutes: int | None = None
    history: list[StatusChange] = Field(default_factory=list)


class CreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    room_id: str = Field(min_length=1, max_length=10, pattern=r"^[A-Za-z0-9-]+$")
    text: str = Field(min_length=1, max_length=MAX_TEXT_LEN)
    input_mode: InputMode = InputMode.TEXT
    language_hint: Language | None = None
    tile: str | None = Field(default=None, max_length=20, pattern=r"^[a-z_]+$")


class CreateRequestResponse(BaseModel):
    request_id: str
    tickets: list[Ticket]
    confirmation: str
    confirmation_language: Language
    is_clinical: bool
