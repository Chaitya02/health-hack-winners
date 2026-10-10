import logging

from app.classifier.confirmations import confirmation_for, profile_note
from app.classifier.decision import Classifier, Decision, FinalIntent, decide
from app.classifier.mock import MockClassifier, detect_language
from app.classifier.schema import (
    ClassifierError,
    ClassifierTimeout,
    InvalidLLMOutput,
    LLMIntent,
    LLMOutput,
)
from app.config import Settings

log = logging.getLogger("tingting.classifier")


def _llm(settings: Settings, provider: str):
    """The configured LLM classifier, or None when it can't be used (no API key)."""
    if provider == "bedrock":
        from app.classifier.bedrock import BedrockClassifier

        return BedrockClassifier(
            model_id=settings.bedrock_model_id,
            region=settings.aws_region,
            timeout_s=settings.llm_timeout_s,
        )
    if settings.anthropic_api_key is None:
        return None
    from app.classifier.anthropic_llm import AnthropicClassifier

    return AnthropicClassifier(
        model=settings.anthropic_model,
        api_key=settings.anthropic_api_key.get_secret_value(),
        timeout_s=settings.llm_timeout_s,
    )


def build_classifier(settings: Settings) -> Classifier:
    mode = settings.classifier_mode
    if mode == "mock":
        return MockClassifier()
    provider = mode if mode in ("bedrock", "anthropic") else settings.llm_provider
    llm = _llm(settings, provider)
    if llm is None:
        log.warning("no LLM configured (set ANTHROPIC_API_KEY): using keywords only")
        return MockClassifier()
    if mode == "hybrid":
        from app.classifier.hybrid import HybridClassifier

        return HybridClassifier(llm)
    return llm


__all__ = [
    "Classifier",
    "ClassifierError",
    "ClassifierTimeout",
    "Decision",
    "FinalIntent",
    "InvalidLLMOutput",
    "LLMIntent",
    "LLMOutput",
    "MockClassifier",
    "build_classifier",
    "confirmation_for",
    "decide",
    "detect_language",
    "profile_note",
]
