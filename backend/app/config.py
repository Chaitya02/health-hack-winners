from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration comes from the environment (.env locally, Lambda env in AWS)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["local", "test", "aws"] = "local"
    version: str = "0.1.0"
    log_level: str = "INFO"

    # Classifier
    # hybrid: keywords first, the LLM only for what they can't place (fast + cheap). Without an
    # LLM configured (no API key) hybrid behaves like mock. bedrock / anthropic: LLM for all text.
    classifier_mode: Literal["mock", "hybrid", "bedrock", "anthropic"] = "hybrid"
    llm_provider: Literal["anthropic", "bedrock"] = "anthropic"
    anthropic_model: str = "claude-haiku-5-5"
    anthropic_api_key: SecretStr | None = None
    bedrock_model_id: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    aws_region: str = "us-east-1"
    confidence_threshold: float = Field(0.7, ge=0, le=1)
    llm_timeout_s: float = 3.0

    # Data
    dynamodb_endpoint_url: str | None = None
    tickets_table: str = "tingting-tickets"
    rooms_table: str = "tingting-rooms"
    staff_table: str = "tingting-staff"
    connections_table: str = "tingting-connections"

    # API hardening
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    rate_limit_per_minute: int = 10

    # Staff demo auth: the PIN is a demo value; the token secret comes from env / Secrets Manager
    staff_pin: str = "2468"
    admin_pin: str = "1357"
    staff_token_secret: str = "local-dev-only-change-me"
    staff_token_ttl_s: int = 12 * 3600

    # Realtime: "local" = in-process WebSocket hub; "apigw" = DynamoDB Streams broadcaster in AWS
    realtime_mode: Literal["local", "apigw"] = "local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
