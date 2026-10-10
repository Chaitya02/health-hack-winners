from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Category, Department, InputMode, Language, Priority, Status

MAX_TEXT_LEN = 500


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Room(BaseModel):
    room_id: str
    unit: str
    patient_alias: str
    preferred_language: Language = Language.EN
    primary_nurse: str


class TicketAudit(BaseModel):
    rules_pre: list[str] = Field(default_factory=list)
    rules_post: list[str] = Field(default_factory=list)
    llm_decision: dict[str, Any] | None = None
    final_decision: dict[str, Any] = Field(default_factory=dict)
    fallback: str | None = None


class Ticket(BaseModel):
    model_config = ConfigDict(use_enum_values=False)

    ticket_id: str
    request_id: str
    room_id: str
    patient_alias: str
    original_text: str = Field(max_length=MAX_TEXT_LEN)
    input_mode: InputMode
    detected_language: Language
    english_summary: str
    category: Category
    department: Department
    priority: Priority
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
    model_id: str
    prompt_version: str
    latency_ms: int = Field(ge=0)
    audit: TicketAudit = Field(default_factory=TicketAudit)


class PatientTicketView(BaseModel):
    """Reduced projection returned to the patient UI (no audit / internals)."""

    ticket_id: str
    department: Department
    category: Category
    priority: Priority
    status: Status
    english_summary: str
    patient_confirmation: str
    created_at: str


class CreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    room_id: str = Field(min_length=1, max_length=10, pattern=r"^[A-Za-z0-9-]+$")
    text: str = Field(min_length=1, max_length=MAX_TEXT_LEN)
    input_mode: InputMode = InputMode.TEXT
    language_hint: Language | None = None


class CreateRequestResponse(BaseModel):
    request_id: str
    tickets: list[Ticket]
    confirmation: str
    confirmation_language: Language
    is_clinical: bool
