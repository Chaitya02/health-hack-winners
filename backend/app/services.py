"""Application services: turn patient requests into routed tickets, and apply staff and
patient actions."""

import logging
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from statistics import median

from app.classifier import (
    Classifier,
    Decision,
    FinalIntent,
    confirmation_for,
    decide,
    profile_note,
)
from app.metrics import start_of_day
from app.models import (
    CLINICAL_CATEGORIES,
    CLOSED_STATUSES,
    OPEN_STATUSES,
    AttendantPreference,
    Category,
    CreateRequest,
    CreateRequestResponse,
    Department,
    InputMode,
    Language,
    Priority,
    Role,
    Room,
    Status,
    StatusChange,
    Ticket,
    TicketAudit,
    TicketNote,
    default_severity,
    utc_now_iso,
)
from app.profile_rules import apply_profile, check_tile, is_mobility_request
from app.realtime import Publisher
from app.repo import TicketRepository, new_id
from app.safety import scan
from app.staff import (
    STAFFED_DEPARTMENTS,
    StaffRepository,
    StaffView,
    choose_assignee,
    is_urgent,
    open_counts,
    status_at,
)
from app.tiles import QUICK_TAP_TILES

log = logging.getLogger("tingting.service")

# ETA until the request is done, used until there are enough resolved tickets today to learn from.
DEFAULT_ETA_MINUTES: dict[Priority, int] = {Priority.HIGH: 2, Priority.NORMAL: 10, Priority.LOW: 15}
MIN_ETA_SAMPLES = 3
MAX_ETA_MINUTES = 60
# "Still waiting" can raise severity, but never into the urgent band (5 is reserved for clinical).
MAX_NUDGE_SEVERITY = 4


def _minutes_between(start: str, end: str) -> float:
    parse = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))  # noqa: E731
    return (parse(end) - parse(start)).total_seconds() / 60


class InvalidTransition(Exception):
    pass


def _is_clinical(ticket: Ticket) -> bool:
    return (
        ticket.category in CLINICAL_CATEGORIES
        or ticket.clinical_risk_flag
        or ticket.status == Status.ESCALATED
        or ticket.department == Department.NURSING
    )


@dataclass
class TicketService:
    tickets: TicketRepository
    classifier: Classifier
    publisher: Publisher
    confidence_threshold: float = 0.7
    staff: StaffRepository | None = None  # None: no rosters, requests stay department-wide

    # --- who gets the request (app/staff.py) -----------------------------------------------

    def _assign(self, ticket: Ticket, preferred_name: str | None = None) -> None:
        """Set (or clear) the ticket's assignee by the department's availability rules."""
        ticket.assigned_to = ticket.assigned_name = ticket.assigned_at = None
        ticket.attendant_preference_met = None
        if self.staff is None or ticket.department not in STAFFED_DEPARTMENTS:
            return
        attendant = str(ticket.attendant_preference) if ticket.attendant_preference else None
        members = self.staff.by_department(ticket.department)
        counts = open_counts(self.tickets.by_department(ticket.department))
        pick = choose_assignee(
            members,
            counts,
            datetime.now(UTC),
            urgent=is_urgent(ticket),
            preferred_name=preferred_name,
            attendant=attendant,
        )
        if pick:
            ticket.assigned_to, ticket.assigned_name = pick.staff_id, pick.name
            ticket.assigned_at = utc_now_iso()
            if attendant:
                ticket.attendant_preference_met = pick.gender == attendant

    def rebalance(self, department: Department) -> int:
        """Hand waiting (unassigned) requests to whoever is available now, urgent and oldest first.
        Called when dashboards load or refresh their staff panel."""
        if self.staff is None or department not in STAFFED_DEPARTMENTS:
            return 0
        waiting = sorted(
            (
                t
                for t in self.tickets.by_department(department)
                if t.assigned_to is None and t.status in OPEN_STATUSES
            ),
            key=lambda t: (-t.severity, t.created_at),
        )
        assigned = 0
        for ticket in waiting:
            self._assign(ticket)
            if ticket.assigned_to is None:
                break  # nobody available: the rest keep waiting too
            self.tickets.put(ticket)
            self.publisher.publish("ticket.updated", ticket)
            assigned += 1
        return assigned

    def staff_views(self, department: Department) -> list[StaffView]:
        if self.staff is None:
            return []
        now = datetime.now(UTC)
        counts = open_counts(self.tickets.by_department(department))
        views = []
        for m in self.staff.by_department(department):
            status, until = status_at(m, now)
            views.append(
                StaffView(
                    **m.model_dump(),
                    status=status,
                    status_until=until,
                    open_tasks=counts.get(m.staff_id, 0),
                )
            )
        return views

    def _quick_tap_decision(self, tile: str, language: Language) -> Decision:
        category, summary, items = QUICK_TAP_TILES[tile]
        reasons = ["patient_requested_nurse"] if tile == "nurse" else []
        intent = FinalIntent(
            category=category,
            english_summary=summary,
            confidence=1.0,
            clinical_risk_flag=category == Category.URGENT_CLINICAL,
            requested_items=items,
            safety_reasons=reasons,
        )
        return Decision(
            detected_language=language,
            intents=[intent],
            rules_pre=[],
            llm_output=None,
            fallback=None,
            latency_ms=0,
            model_id="quick_tap",
            prompt_version="tiles-v1",
        )

    def eta_minutes(self, department: Department, priority: Priority) -> int:
        """Median minutes from request to done for today's resolved tickets with the same
        department and priority; a fixed default until there are enough of them."""
        since = start_of_day()
        samples = [
            _minutes_between(t.created_at, t.resolved_at)
            for t in self.tickets.by_department(department, Status.RESOLVED, limit=100)
            if t.priority == priority and t.resolved_at and t.created_at >= since
        ]
        if len(samples) < MIN_ETA_SAMPLES:
            return DEFAULT_ETA_MINUTES[priority]
        return max(1, min(MAX_ETA_MINUTES, math.ceil(median(samples))))

    @staticmethod
    def _record(ticket: Ticket, by_role: Role, at: str) -> None:
        ticket.history.append(StatusChange(status=ticket.status, at=at, by_role=by_role))

    def create(self, req: CreateRequest, room: Room) -> CreateRequestResponse:
        tile = req.tile if req.input_mode == InputMode.QUICK_TAP else None
        if tile in QUICK_TAP_TILES:
            check_tile(room.profile, tile, QUICK_TAP_TILES[tile][0])  # raises ProfileRefusal
            decision = self._quick_tap_decision(tile, req.language_hint or Language.EN)
        else:
            decision = decide(req.text, self.classifier, self.confidence_threshold)
        profile = apply_profile(room.profile, decision.intents, req.text, tile)

        language = req.language_hint or decision.detected_language
        request_id = new_id("r_")
        now = utc_now_iso()
        tickets: list[Ticket] = []
        for intent, adj in zip(decision.intents, profile.adjustments, strict=True):
            urgent = intent.category == Category.URGENT_CLINICAL
            priority = adj.priority or intent.priority
            ticket = Ticket(
                ticket_id=new_id("t_"),
                request_id=request_id,
                room_id=room.room_id,
                patient_alias=room.patient_alias,
                unit=room.unit,
                patient_age=room.age,
                original_text=req.text,
                input_mode=req.input_mode,
                tile=tile if tile in QUICK_TAP_TILES else None,
                detected_language=decision.detected_language,
                english_summary=intent.english_summary,
                category=intent.category,
                department=intent.department,
                priority=priority,
                severity=adj.severity,
                confidence=intent.confidence,
                clinical_risk_flag=intent.clinical_risk_flag,
                safety_reasons=intent.safety_reasons,
                requested_items=intent.requested_items,
                patient_confirmation=confirmation_for(language, [intent.department], urgent),
                created_at=now,
                eta_minutes=self.eta_minutes(intent.department, priority),
                history=[StatusChange(status=Status.NEW, at=now, by_role=Role.PATIENT)],
                model_id=decision.model_id,
                prompt_version=decision.prompt_version,
                latency_ms=decision.latency_ms,
                audit=TicketAudit(
                    rules_pre=decision.rules_pre,
                    rules_post=intent.rules_post,
                    llm_decision=decision.llm_output,
                    final_decision=intent.as_dict() | {"priority": str(priority)},
                    fallback=decision.fallback,
                ),
            )
            # US-6: bathroom / mobility help honours the patient's attendant preference.
            pref = room.profile.attendant_preference
            if (
                pref != AttendantPreference.ANY
                and ticket.department == Department.NURSING
                and is_mobility_request(req.text, tile)
            ):
                ticket.attendant_preference = pref
            self._assign(ticket, preferred_name=room.primary_nurse)
            self.tickets.put(ticket)
            tickets.append(ticket)
            self.publisher.publish("ticket.created", ticket)
            log.info(
                "ticket created",
                extra={
                    "request_id": request_id,
                    "ticket_id": ticket.ticket_id,
                    "room_id": room.room_id,
                    "category": str(ticket.category),
                    "department": str(ticket.department),
                    "priority": str(ticket.priority),
                    "latency_ms": decision.latency_ms,
                    "fallback": decision.fallback,
                    "rule_hits": decision.rules_pre,
                    "fail_safe_to_nurse": bool(decision.fallback)
                    or "low_confidence" in ticket.safety_reasons,
                    "text_len": len(req.text),
                    "model_id": decision.model_id,
                },
            )

        return CreateRequestResponse(
            request_id=request_id,
            tickets=tickets,
            confirmation=" ".join(
                [
                    confirmation_for(language, decision.departments, decision.is_clinical),
                    *(
                        profile_note(language, f)
                        for f in ("npo", "fall_risk")
                        if f in profile.flags
                    ),
                ]
            ),
            confirmation_language=language,
            is_clinical=decision.is_clinical,
        )

    def apply_action(
        self, ticket: Ticket, action: str, by_role: Role = Role.SYSTEM
    ) -> tuple[Ticket, str]:
        now = utc_now_iso()
        event = "ticket.updated"
        if ticket.status in CLOSED_STATUSES:
            raise InvalidTransition(f"ticket is already {ticket.status.lower()}")
        if action == "acknowledge":
            if ticket.status not in (Status.NEW, Status.ESCALATED):
                raise InvalidTransition(f"cannot acknowledge a {ticket.status} ticket")
            ticket.status = Status.ACKNOWLEDGED
            ticket.acknowledged_at = now
        elif action == "start":
            if ticket.status == Status.IN_PROGRESS:
                raise InvalidTransition("ticket is already in progress")
            ticket.status = Status.IN_PROGRESS
            ticket.acknowledged_at = ticket.acknowledged_at or now
        elif action == "resolve":
            ticket.status = Status.RESOLVED
            ticket.acknowledged_at = ticket.acknowledged_at or now
            ticket.resolved_at = now
        elif action == "escalate_to_nurse":
            self._escalate(ticket, ["staff_escalation"])
            event = "ticket.escalated"
        else:  # pragma: no cover - validated by the API model
            raise InvalidTransition(f"unknown action {action}")
        self._record(ticket, by_role, now)
        self.tickets.put(ticket)
        self.publisher.publish(event, ticket)  # type: ignore[arg-type]
        log.info(
            "ticket updated",
            extra={
                "ticket_id": ticket.ticket_id,
                "action": action,
                "status": str(ticket.status),
                "department": str(ticket.department),
            },
        )
        return ticket, event

    def _escalate(self, ticket: Ticket, reasons: list[str]) -> None:
        if ticket.department != Department.NURSING:
            ticket.escalated_from = ticket.department
        ticket.department = Department.NURSING
        ticket.category = Category.URGENT_CLINICAL
        ticket.priority = Priority.HIGH
        ticket.severity = default_severity(Category.URGENT_CLINICAL)
        ticket.clinical_risk_flag = True
        ticket.status = Status.ESCALATED
        ticket.acknowledged_at = None
        ticket.eta_minutes = self.eta_minutes(Department.NURSING, Priority.HIGH)
        ticket.safety_reasons += [r for r in reasons if r not in ticket.safety_reasons]
        self._assign(ticket)  # now a nursing request: an available nurse (never left unassigned)

    def patient_action(self, ticket: Ticket, action: str, note: str | None = None) -> Ticket:
        """Changes the patient can make while waiting (US-2). They can only move a request
        toward more attention: no cancelling clinical requests, and notes are safety-scanned."""
        now = utc_now_iso()
        if ticket.status in CLOSED_STATUSES:
            raise InvalidTransition(f"request is already {ticket.status.lower()}")
        event = "ticket.updated"
        if action == "cancel":
            if _is_clinical(ticket):
                raise InvalidTransition("Clinical requests can only be closed by your nurse.")
            ticket.status = Status.CANCELLED
            ticket.resolved_at = now
            self._record(ticket, Role.PATIENT, now)
        elif action == "still_waiting":
            ticket.nudge_count += 1
            ticket.last_nudge_at = now
            if ticket.severity < MAX_NUDGE_SEVERITY:
                ticket.severity += 1
        elif action == "add_note":
            if not note:
                raise InvalidTransition("note text is required")
            ticket.notes.append(TicketNote(text=note, at=now, by_role=Role.PATIENT))
            red_flags = scan(note)
            already_urgent = (
                ticket.category == Category.URGENT_CLINICAL
                and ticket.department == Department.NURSING
            )
            if red_flags and already_urgent:
                reasons = [*red_flags, "patient_note_red_flag"]
                ticket.safety_reasons += [r for r in reasons if r not in ticket.safety_reasons]
            elif red_flags:
                self._escalate(ticket, [*red_flags, "patient_note_red_flag"])
                self._record(ticket, Role.SYSTEM, now)
                event = "ticket.escalated"
        else:  # pragma: no cover - validated by the API model
            raise InvalidTransition(f"unknown action {action}")
        self.tickets.put(ticket)
        self.publisher.publish(event, ticket)  # type: ignore[arg-type]
        log.info(
            "patient action",
            extra={
                "ticket_id": ticket.ticket_id,
                "action": action,
                "status": str(ticket.status),
                "department": str(ticket.department),
                "severity": ticket.severity,
                "escalated": event == "ticket.escalated",
            },
        )
        return ticket
