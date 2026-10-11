import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import health, routes, ws
from app.classifier import Classifier, build_classifier
from app.config import Settings, get_settings
from app.logging_setup import configure_logging
from app.realtime import NullPublisher, Publisher
from app.realtime.hub import LocalHub
from app.repo import RoomRepository, TicketRepository, dynamo_resource, ensure_tables
from app.security import RateLimiter, StaffAuth
from app.services import TicketService
from app.staff import StaffRepository

log = logging.getLogger("tingting")


DEADLINE_CHECK_S = 15


async def _deadline_timer(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(DEADLINE_CHECK_S)
        try:
            await asyncio.to_thread(app.state.service.check_deadlines)
        except Exception:  # keep checking; one bad pass must not stop the timer
            log.exception("deadline check failed")


def create_app(
    settings: Settings | None = None,
    resource=None,
    classifier: Classifier | None = None,
    publisher: Publisher | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    hub = LocalHub()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        hub.attach_loop(asyncio.get_running_loop())
        # Locally the server is long-lived: check response-time targets on a timer. (On Lambda,
        # and in tests, they are checked when dashboards load.)
        timer = asyncio.create_task(_deadline_timer(app)) if settings.app_env == "local" else None
        yield
        if timer:
            timer.cancel()

    app = FastAPI(title="Ting-ting Call Bell Router", version=settings.version, lifespan=lifespan)
    app.state.hub = hub
    app.state.settings = settings

    db = resource or dynamo_resource(settings)
    if settings.app_env in ("local", "test"):
        created = ensure_tables(db, settings)
        if created:
            log.info("created local tables", extra={"tables": created})
    app.state.tickets = TicketRepository(settings, db)
    app.state.rooms = RoomRepository(settings, db)
    app.state.staff = StaffRepository(settings, db)
    app.state.auth = StaffAuth(
        settings.staff_pin,
        settings.staff_token_secret,
        settings.staff_token_ttl_s,
        admin_pin=settings.admin_pin,
    )
    app.state.rate_limiter = RateLimiter(settings.rate_limit_per_minute)
    if publisher is None:
        publisher = hub if settings.realtime_mode == "local" else NullPublisher()
    app.state.publisher = publisher
    app.state.service = TicketService(
        tickets=app.state.tickets,
        classifier=classifier or build_classifier(settings),
        publisher=app.state.publisher,
        confidence_threshold=settings.confidence_threshold,
        staff=app.state.staff,
    )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Never echo patient text back in validation errors (it may end up in logs).
        errors = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": errors})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )
    app.include_router(health.router)
    app.include_router(routes.router)
    app.include_router(ws.router)
    log.info(
        "app started",
        extra={"classifier_mode": settings.classifier_mode, "app_env": settings.app_env},
    )
    return app
