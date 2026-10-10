from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.classifier import decide
from app.metrics import Metrics, compute, start_of_day
from app.models import (
    MAX_TEXT_LEN,
    CreateRequest,
    CreateRequestResponse,
    Department,
    PatientTicketView,
    Room,
    Status,
    Ticket,
)
from app.services import InvalidTransition, TicketService

router = APIRouter(prefix="/api")


class LoginBody(BaseModel):
    department: Department
    pin: str = Field(min_length=1, max_length=12)


class ActionBody(BaseModel):
    action: Literal["acknowledge", "start", "resolve", "escalate_to_nurse"]


class ClassifyBody(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LEN)


def _service(request: Request) -> TicketService:
    return request.app.state.service


def _room(request: Request, room_id: str) -> Room:
    room = request.app.state.rooms.get(room_id)
    if room is None:
        raise HTTPException(404, "Unknown room. Please ask staff for help.")
    return room


def staff_department(
    request: Request, authorization: Annotated[str | None, Header()] = None
) -> Department:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Staff login required")
    dept = request.app.state.auth.verify(authorization.removeprefix("Bearer ").strip())
    if dept is None:
        raise HTTPException(401, "Invalid or expired staff token")
    return dept


StaffDept = Annotated[Department, Depends(staff_department)]


@router.get("/rooms/{room_id}", response_model=Room)
def get_room(room_id: str, request: Request) -> Room:
    return _room(request, room_id)


@router.post("/requests", status_code=201, response_model=CreateRequestResponse)
def create_request(body: CreateRequest, request: Request) -> CreateRequestResponse:
    room = _room(request, body.room_id)
    if not request.app.state.rate_limiter.allow(room.room_id):
        raise HTTPException(429, "Too many requests from this room. Tap 'I need my nurse'.")
    return _service(request).create(body, room)


@router.get("/rooms/{room_id}/tickets", response_model=list[PatientTicketView])
def room_tickets(room_id: str, request: Request) -> list[PatientTicketView]:
    _room(request, room_id)
    since = start_of_day()
    tickets = [t for t in request.app.state.tickets.by_room(room_id) if t.created_at >= since]
    return [PatientTicketView.model_validate(t.model_dump()) for t in tickets]


@router.post("/auth/login")
def login(body: LoginBody, request: Request) -> dict:
    token = request.app.state.auth.login(body.department, body.pin)
    if token is None:
        raise HTTPException(401, "Wrong PIN")
    return {"token": token, "department": body.department}


@router.get("/queues/{department}", response_model=list[Ticket])
def queue(
    department: Department, request: Request, staff: StaffDept, status: Status | None = None
) -> list[Ticket]:
    if staff != department:
        raise HTTPException(403, "Token is for another department")
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
        updated, _ = _service(request).apply_action(ticket, body.action)
    except InvalidTransition as e:
        raise HTTPException(409, str(e)) from e
    return updated


@router.get("/metrics", response_model=Metrics)
def metrics(request: Request) -> Metrics:
    since = start_of_day()
    return compute(request.app.state.tickets.since(since), since)


@router.post("/classify")
def classify(body: ClassifyBody, request: Request, staff: StaffDept) -> dict:
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
