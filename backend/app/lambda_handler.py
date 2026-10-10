"""AWS Lambda entrypoint: FastAPI via Mangum."""

from mangum import Mangum

from app.main import create_app

app = create_app()
handler = Mangum(app, lifespan="off")
