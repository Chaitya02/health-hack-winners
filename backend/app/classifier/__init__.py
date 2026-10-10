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


def build_classifier(settings: Settings) -> Classifier:
    if settings.classifier_mode == "bedrock":
        from app.classifier.bedrock import BedrockClassifier

        return BedrockClassifier(
            model_id=settings.bedrock_model_id,
            region=settings.aws_region,
            timeout_s=settings.llm_timeout_s,
        )
    return MockClassifier()


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
