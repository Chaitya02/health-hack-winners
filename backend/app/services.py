"""Application services: turn patient requests into routed tickets, and apply staff actions."""

import logging
from dataclasses import dataclass

from app.classifier import Classifier, Decision, FinalIntent, confirmation_for, decide
from app.models import (
    Category,
    CreateRequest,
    CreateRequestResponse,
    Department,
    InputMode,
    Language,
    Priority,
    Room,
    Status,
    Ticket,
    TicketAudit,
    utc_now_iso,
)
from app.realtime import Publisher
from app.repo import TicketRepository, new_id

log = logging.getLogger("tingting.service")

# Quick-tap tiles are deterministic: no LLM call, instant and demo-proof.
QUICK_TAP_TILES: dict[str, tuple[Category, str, list[str]]] = {
    "water": (Category.DIETARY, "Patient requests water.", ["water"]),
    "ice": (Category.DIETARY, "Patient requests ice.", ["ice"]),
    "pillow": (Category.COMFORT_SUPPLIES, "Patient requests an extra pillow.", ["pillow"]),
    "blanket": (Category.COMFORT_SUPPLIES, "Patient requests a blanket.", ["blanket"]),
    "bathroom": (
        Category.NON_URGENT_CLINICAL,
        "Patient needs help getting to the bathroom (mobility / fall risk).",
        [],
    ),
    "temperature": (
        Category.ENVIRONMENT_CLEANING,
        "Patient asks to adjust the room temperature.",
        [],
    ),
    "tv": (Category.TECH_AMENITIES, "Patient needs help with the TV / remote.", ["tv remote"]),
    "food": (Category.DIETARY, "Patient asks about food / the menu.", ["menu"]),
    "nurse": (
        Category.URGENT_CLINICAL,
        "Patient pressed 'I need my nurse'.",
        [],
    ),
}


class InvalidTransition(Exception):
    pass


@dataclass
class TicketService:
    tickets: TicketRepository
    classifier: Classifier
    publisher: Publisher
    confidence_threshold: float = 0.7

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

    def create(self, req: CreateRequest, room: Room) -> CreateRequestResponse:
        if req.input_mode == InputMode.QUICK_TAP and req.tile in QUICK_TAP_TILES:
            decision = self._quick_tap_decision(req.tile, req.language_hint or Language.EN)
        else:
            decision = decide(req.text, self.classifier, self.confidence_threshold)

        language = req.language_hint or decision.detected_language
        request_id = new_id("r_")
        now = utc_now_iso()
        tickets: list[Ticket] = []
        for intent in decision.intents:
            urgent = intent.category == Category.URGENT_CLINICAL
            ticket = Ticket(
                ticket_id=new_id("t_"),
                request_id=request_id,
                room_id=room.room_id,
                patient_alias=room.patient_alias,
                original_text=req.text,
                input_mode=req.input_mode,
                detected_language=decision.detected_language,
                english_summary=intent.english_summary,
                category=intent.category,
                department=intent.department,
                priority=intent.priority,
                confidence=intent.confidence,
                clinical_risk_flag=intent.clinical_risk_flag,
                safety_reasons=intent.safety_reasons,
                requested_items=intent.requested_items,
                patient_confirmation=confirmation_for(language, [intent.department], urgent),
                created_at=now,
                model_id=decision.model_id,
                prompt_version=decision.prompt_version,
                latency_ms=decision.latency_ms,
                audit=TicketAudit(
                    rules_pre=decision.rules_pre,
                    rules_post=intent.rules_post,
                    llm_decision=decision.llm_output,
                    final_decision=intent.as_dict(),
                    fallback=decision.fallback,
                ),
            )
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
            confirmation=confirmation_for(language, decision.departments, decision.is_clinical),
            confirmation_language=language,
            is_clinical=decision.is_clinical,
        )

    def apply_action(self, ticket: Ticket, action: str) -> tuple[Ticket, str]:
        now = utc_now_iso()
        event = "ticket.updated"
        if ticket.status == Status.RESOLVED:
            raise InvalidTransition("ticket is already resolved")
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
            ticket.escalated_from = ticket.department
            ticket.department = Department.NURSING
            ticket.category = Category.URGENT_CLINICAL
            ticket.priority = Priority.HIGH
            ticket.clinical_risk_flag = True
            ticket.status = Status.ESCALATED
            ticket.acknowledged_at = None
            if "staff_escalation" not in ticket.safety_reasons:
                ticket.safety_reasons.append("staff_escalation")
            event = "ticket.escalated"
        else:  # pragma: no cover - validated by the API model
            raise InvalidTransition(f"unknown action {action}")
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
