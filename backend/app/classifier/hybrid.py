"""Keywords first, the LLM only when they're unsure: fast and cheap.

Quick-tap buttons never reach a classifier. Typed or spoken text the keyword classifier places
confidently (every part matched a known team) is answered in about a millisecond at no cost; only
the rest ("I'm peckish", "the air con is too strong", mixed or unusual wording) goes to the LLM.
If the LLM is slow or fails, the keyword answer stands (anything unplaced goes to the nurse).
The safety rules run before and after either one (decision.py).
"""

import logging
import threading

from app.classifier.mock import MockClassifier
from app.classifier.schema import ClassifierError, ClassifierTimeout, InvalidLLMOutput, LLMOutput
from app.models import Category

log = logging.getLogger("tingting.classifier")


class HybridClassifier:
    def __init__(self, llm, fast: MockClassifier | None = None):
        self.llm = llm
        self.fast = fast or MockClassifier()
        self.prompt_version = f"{self.fast.prompt_version}+{llm.prompt_version}"
        self._local = threading.local()  # which one answered, per request thread

    @property
    def model_id(self) -> str:
        return getattr(self._local, "model_id", self.fast.model_id)

    def classify(self, text: str) -> LLMOutput:
        quick = self.fast.classify(text)
        if all(i.category != Category.UNCLEAR for i in quick.intents):
            self._local.model_id = self.fast.model_id
            return quick
        try:
            out = self.llm.classify(text)
        except (ClassifierTimeout, ClassifierError, InvalidLLMOutput) as e:
            log.warning(
                "llm unavailable, keeping keyword answer", extra={"error": type(e).__name__}
            )
            self._local.model_id = f"{self.fast.model_id}(llm-fallback)"
            return quick
        self._local.model_id = self.llm.model_id
        return out
