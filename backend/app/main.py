import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.config import Settings, get_settings
from app.logging_setup import configure_logging
from app.repo import RoomRepository, TicketRepository, dynamo_resource, ensure_tables

log = logging.getLogger("tingting")


def create_app(settings: Settings | None = None, resource=None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title="Ting-ting Call Bell Router", version=settings.version)
    app.state.settings = settings

    db = resource or dynamo_resource(settings)
    if settings.app_env in ("local", "test"):
        created = ensure_tables(db, settings)
        if created:
            log.info("created local tables", extra={"tables": created})
    app.state.tickets = TicketRepository(settings, db)
    app.state.rooms = RoomRepository(settings, db)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )
    app.include_router(health.router)
    return app
