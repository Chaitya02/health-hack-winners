from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app import analytics
from app.classifier import decide, not_a_request_message, profile_note
from app.intake import derive_profile
from app.metrics import Metrics, compute, start_of_day
from app.models import (
    MAX_NOTE_LEN,
    MAX_NOTES_LEN,
    MAX_TEXT_LEN,
    ROLE_DEPARTMENT,
    STAFF_ROLE,
    AttendantPreference,
    CreateRequest,
    CreateRequestResponse,
    Department,
    Language,
    PatientProfile,
    PatientTicketView,
    Role,
    Room,
    RoomView,
    Status,
    Ticket,
    utc_now_iso,
)
from app.profile_rules import ProfileRefusal
from app.services import InvalidTransition, NotARequest, TicketService
from app.staff import StaffView

router = APIRouter(prefix="/api")


class LoginBody(BaseModel):
    """Log in as a role, or as a department (shorthand for that department's staff role)."""

    role: Role | None = None
    department: Department | None = None
    pin: str = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def _role_or_department(self) -> "LoginBody":
        if (self.role is None) == (self.department is None):
            raise ValueError("send exactly one of role or department")
        return self

    @property
    def resolved_role(self) -> Role:
        return self.role if self.role is not None else STAFF_ROLE[self.department]


class ActionBody(BaseModel):
    action: Literal["acknowledge", "start", "resolve", "escalate_to_nurse"]


class PatientActionBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    action: Literal["cancel", "still_waiting", "add_note"]
    note: str | None = Field(default=None, min_length=1, max_length=MAX_NOTE_LEN)

    @model_validator(mode="after")
    def _note_only_with_add_note(self) -> "PatientActionBody":
        if (self.action == "add_note") != (self.note is not None):
            raise ValueError("note is required for add_note and only allowed there")
        return self


class ClassifyBody(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LEN)


def _service(request: Request) -> TicketService:
    return request.app.state.service


def _room(request: Request, room_id: str) -> Room:
    room = request.app.state.rooms.get(room_id)
    if room is None:
        raise HTTPException(404, "Unknown room. Please ask staff for help.")
    return room


def current_role(request: Request, authorization: Annotated[str | None, Header()] = None) -> Role:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Staff login required")
    role = request.app.state.auth.verify(authorization.removeprefix("Bearer ").strip())
    if role is None:
        raise HTTPException(401, "Invalid or expired staff token")
    return role


SignedIn = Annotated[Role, Depends(current_role)]


def staff_department(role: SignedIn) -> Department:
    """The department queue this role works. Admin has none."""
    dept = ROLE_DEPARTMENT.get(role)
    if dept is None:
        raise HTTPException(403, "This account has no department queue")
    return dept


StaffDept = Annotated[Department, Depends(staff_department)]


class IntakeBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=40)
    age: int = Field(ge=0, le=120)
    gender: Literal["female", "male", "unspecified"] = "unspecified"
    # US-6: who should help with the bathroom.
    attendant_preference: AttendantPreference = AttendantPreference.ANY
    clinical_notes: str = Field(default="", max_length=MAX_NOTES_LEN)
    preferred_language: Language | None = None


def _view(room: Room) -> RoomView:
    return RoomView.model_validate(room.model_dump())


@router.get("/rooms/{room_id}", response_model=RoomView)
def get_room(room_id: str, request: Request) -> RoomView:
    return _view(_room(request, room_id))


@router.put("/rooms/{room_id}/intake")
def save_intake(room_id: str, body: IntakeBody, request: Request) -> dict:
    """Bedside intake (hackathon: the patient fills it in, no login). The notes set the profile,
    dashboard and priority buttons; the raw notes are stored but never sent back."""
    room = _room(request, room_id)
    if not request.app.state.rate_limiter.allow(room.room_id):
        raise HTTPException(429, "Too many requests from this room. Tap 'I need my nurse'.")
    result = derive_profile(body.clinical_notes)
    updated = room.model_copy(
        update={
            "patient_alias": body.name,
            "age": body.age,
            "gender": body.gender,
            "clinical_notes": body.clinical_notes or None,
            "preferred_language": body.preferred_language or room.preferred_language,
            "profile": result.profile.model_copy(
                update={"attendant_preference": body.attendant_preference}
            ),
            "intake_complete": True,
            "intake_at": utc_now_iso(),
        }
    )
    request.app.state.rooms.put(updated)
    return {"room": _view(updated), "detected": result.flags}


@router.delete("/rooms/{room_id}/intake", response_model=RoomView)
def reset_intake(room_id: str, request: Request) -> RoomView:
    """Start over for the next patient on this tablet (demo/testing)."""
    room = _room(request, room_id)
    cleared = room.model_copy(
        update={
            "patient_alias": "",
            "age": None,
            "gender": "unspecified",
            "clinical_notes": None,
            "profile": PatientProfile(),
            "intake_complete": False,
            "intake_at": utc_now_iso(),
        }
    )
    request.app.state.rooms.put(cleared)
    return _view(cleared)


@router.post("/requests", status_code=201, response_model=CreateRequestResponse)
def create_request(body: CreateRequest, request: Request) -> CreateRequestResponse:
    room = _room(request, body.room_id)
    if not request.app.state.rate_limiter.allow(room.room_id):
        raise HTTPException(429, "Too many requests from this room. Tap 'I need my nurse'.")
    try:
        return _service(request).create(body, room)
    except NotARequest as e:
        # Nothing was sent to anyone: the patient is asked to try again.
        language = body.language_hint or room.preferred_language
        raise HTTPException(
            422,
            {
                "code": "not_a_request",
                "reason": e.reason,
                "message": not_a_request_message(language),
            },
        ) from e
    except ProfileRefusal as e:
        language = body.language_hint or room.preferred_language
        raise HTTPException(
            409,
            {"code": e.code, "reason": e.reason, "message": profile_note(language, "npo_tile")},
        ) from e


@router.get("/rooms/{room_id}/tickets", response_model=list[PatientTicketView])
def room_tickets(room_id: str, request: Request) -> list[PatientTicketView]:
    room = _room(request, room_id)
    # Today's requests, minus anything from before the current patient's intake.
    since = max(start_of_day(), room.intake_at or "")
    tickets = [t for t in request.app.state.tickets.by_room(room_id) if t.created_at >= since]
    return [PatientTicketView.model_validate(t.model_dump()) for t in tickets]


@router.patch("/rooms/{room_id}/tickets/{ticket_id}", response_model=PatientTicketView)
def patient_ticket_action(
    room_id: str, ticket_id: str, body: PatientActionBody, request: Request
) -> PatientTicketView:
    """Patient changes while waiting: cancel (non-clinical only), still waiting, add a note."""
    room = _room(request, room_id)
    ticket = request.app.state.tickets.get(ticket_id)
    if ticket is None or ticket.room_id != room.room_id:
        raise HTTPException(404, "Unknown request")
    if not request.app.state.rate_limiter.allow(room.room_id):
        raise HTTPException(429, "Too many requests from this room. Tap 'I need my nurse'.")
    try:
        updated = _service(request).patient_action(ticket, body.action, body.note)
    except InvalidTransition as e:
        raise HTTPException(409, str(e)) from e
    return PatientTicketView.model_validate(updated.model_dump())


@router.post("/auth/login")
def login(body: LoginBody, request: Request) -> dict:
    role = body.resolved_role
    token = request.app.state.auth.login(role, body.pin)
    if token is None:
        raise HTTPException(401, "Wrong PIN")
    return {"token": token, "role": role, "department": ROLE_DEPARTMENT.get(role)}


@router.get("/queues/{department}", response_model=list[Ticket])
def queue(
    department: Department, request: Request, staff: StaffDept, status: Status | None = None
) -> list[Ticket]:
    if staff != department:
        raise HTTPException(403, "Token is for another department")
    svc = _service(request)
    svc.check_deadlines()  # late requests go to a backup first
    svc.rebalance(department)  # hand waiting requests to anyone now available
    since = start_of_day()
    tickets = request.app.state.tickets.by_department(department, status)
    # Today's tickets plus anything still open from earlier.
    return [t for t in tickets if t.created_at >= since or t.resolved_at is None]


@router.patch("/tickets/{ticket_id}", response_model=Ticket)
def update_ticket(ticket_id: str, body: ActionBody, request: Request, staff: StaffDept) -> Ticket:
    ticket = request.app.state.tickets.get(ticket_id)
    if ticket is None:
        raise HTTPException(404, "Unknown ticket")
    if ticket.department != staff:
        raise HTTPException(403, "Ticket belongs to another department")
    try:
        updated, _ = _service(request).apply_action(ticket, body.action, STAFF_ROLE[staff])
    except InvalidTransition as e:
        raise HTTPException(409, str(e)) from e
    return updated


@router.get("/staff/{department}", response_model=list[StaffView])
def department_staff(department: Department, request: Request, role: SignedIn) -> list[StaffView]:
    """The department's people right now: schedule, status (available / break / off), open
    tasks. Also hands waiting requests to anyone who has become available."""
    if role != Role.ADMIN and ROLE_DEPARTMENT.get(role) != department:
        raise HTTPException(403, "Token is for another department")
    svc = _service(request)
    svc.check_deadlines()
    svc.rebalance(department)
    return svc.staff_views(department)


def insights_reader(role: SignedIn) -> Role:
    """Request data is for clinical and admin users only (US-1), not support teams."""
    if role not in (Role.ADMIN, Role.NURSE):
        raise HTTPException(403, "Request insights are limited to nurses and admins")
    return role


InsightsReader = Annotated[Role, Depends(insights_reader)]
Days = Annotated[int, Query(ge=1, le=analytics.MAX_DAYS)]


@router.get("/analytics", response_model=analytics.Analytics)
def request_analytics(
    request: Request,
    _: InsightsReader,
    days: Days = 1,
    tz_offset_minutes: Annotated[int, Query(ge=-14 * 60, le=14 * 60)] = 0,
) -> analytics.Analytics:
    since = analytics.window_start(days)
    return analytics.compute(
        request.app.state.tickets.since(since),
        since,
        days,
        tz_offset_minutes,
        roster=request.app.state.staff.all(),
    )


@router.get("/analytics/export.csv")
def export_csv(request: Request, _: InsightsReader, days: Days = 1) -> Response:
    since = analytics.window_start(days)
    body = analytics.to_csv(request.app.state.tickets.since(since))
    return Response(
        body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="tingting-requests-{days}d.csv"'},
    )


@router.get("/metrics", response_model=Metrics)
def metrics(request: Request, _: SignedIn) -> Metrics:
    since = start_of_day()
    return compute(request.app.state.tickets.since(since), since)


@router.post("/classify")
def classify(body: ClassifyBody, request: Request, _: SignedIn) -> dict:
    """Dry-run classification (no ticket, no broadcast). Used by scripts/eval.py --mode api."""
    svc = _service(request)
    d = decide(body.text, svc.classifier, svc.confidence_threshold)
    return {
        "detected_language": d.detected_language,
        "departments": sorted({str(x) for x in d.departments}),
        "categories": [str(i.category) for i in d.intents],
        "is_clinical": d.is_clinical,
        "fallback": d.fallback,
        "rules_pre": d.rules_pre,
        "latency_ms": d.latency_ms,
        "model_id": d.model_id,
        "prompt_version": d.prompt_version,
        "safety_reasons": sorted({r for i in d.intents for r in i.safety_reasons}),
    }
