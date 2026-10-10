"""Strict schema for classifier (LLM) output. Invalid output fails safe to the Nurse."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import Category, Language

_LANG_ALIASES = {
    "english": "en",
    "spanish": "es",
    "espanol": "es",
    "hindi": "hi",
    "gujarati": "gu",
    "chinese": "zh",
    "mandarin": "zh",
    "haitian": "ht",
    "haitian creole": "ht",
    "kreyol": "ht",
    "hat": "ht",
    "portuguese": "pt",
    "por": "pt",
}


def coerce_language(value: Any) -> Language:
    if isinstance(value, Language):
        return value
    v = str(value or "").strip().lower()
    v = _LANG_ALIASES.get(v, v)
    v = v.split("-")[0].split("_")[0][:2]
    try:
        return Language(v)
    except ValueError:
        return Language.EN


class LLMIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Category
    english_summary: str = Field(min_length=1, max_length=200)
    requested_items: list[str] = Field(default_factory=list, max_length=10)
    confidence: float = Field(ge=0, le=1)
    clinical_risk: bool


class LLMOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detected_language: Language
    intents: list[LLMIntent] = Field(min_length=1, max_length=4)
    patient_confirmation: str = Field(default="", max_length=300)

    @field_validator("detected_language", mode="before")
    @classmethod
    def _coerce_language(cls, v: Any) -> Language:
        return coerce_language(v)


class ClassifierTimeout(Exception):
    """The classifier did not answer within the configured deadline."""


class ClassifierError(Exception):
    """The classifier backend failed (API error, throttling, no model access...)."""


class InvalidLLMOutput(Exception):
    """The classifier answered but the output does not satisfy LLMOutput."""
