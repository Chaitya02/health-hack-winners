from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health(request: Request) -> dict:
    s = request.app.state.settings
    return {"status": "ok", "classifier_mode": s.classifier_mode, "version": s.version}
