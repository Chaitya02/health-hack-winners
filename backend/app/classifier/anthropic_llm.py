"""Claude via the Anthropic API: a forced tool call returns the routing JSON.

Fast and cheap by design: a small model (Claude Haiku), temperature 0, a short output budget, no
retries past the deadline, and the long system prompt + tool schema marked for prompt caching so
repeat calls pay a fraction of the input cost. Most requests never reach it (see hybrid.py).
"""

import logging
from typing import Any

import anthropic
from pydantic import ValidationError

from app.classifier.prompt import (
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    TOOL_NAME,
    TOOL_SPEC,
    wrap_patient_text,
)
from app.classifier.schema import ClassifierError, ClassifierTimeout, InvalidLLMOutput, LLMOutput

log = logging.getLogger("tingting.classifier")

MAX_OUTPUT_TOKENS = 400

# The Bedrock-format tool spec in prompt.py, in the Anthropic API's shape. Cached with the system
# prompt (a cache breakpoint on the last tool covers tools + system).
_TOOL: dict[str, Any] = {
    "name": TOOL_NAME,
    "description": TOOL_SPEC["toolSpec"]["description"],
    "input_schema": TOOL_SPEC["toolSpec"]["inputSchema"]["json"],
    "cache_control": {"type": "ephemeral"},
}
_SYSTEM = [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]


class AnthropicClassifier:
    prompt_version = PROMPT_VERSION

    def __init__(self, model: str, api_key: str | None, timeout_s: float = 3.0, client=None):
        self.model_id = model
        self._client = client or anthropic.Anthropic(
            api_key=api_key, timeout=timeout_s, max_retries=0
        )

    def classify(self, text: str) -> LLMOutput:
        try:
            response = self._client.messages.create(
                model=self.model_id,
                max_tokens=MAX_OUTPUT_TOKENS,
                temperature=0,
                system=_SYSTEM,
                tools=[_TOOL],
                tool_choice={"type": "tool", "name": TOOL_NAME},
                messages=[{"role": "user", "content": wrap_patient_text(text)}],
            )
        except anthropic.APITimeoutError as e:
            raise ClassifierTimeout(str(e)) from e
        except anthropic.APIError as e:
            raise ClassifierError(f"{type(e).__name__}: {e}") from e
        payload = next(
            (b.input for b in response.content if b.type == "tool_use" and b.name == TOOL_NAME),
            None,
        )
        if payload is None:
            raise InvalidLLMOutput("no tool call in response")
        usage = getattr(response, "usage", None)
        if usage is not None:
            log.info(
                "llm usage",
                extra={
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "cache_read_tokens": getattr(usage, "cache_read_input_tokens", 0),
                },
            )
        try:
            return LLMOutput.model_validate(payload)
        except ValidationError as e:
            raise InvalidLLMOutput(str(e)) from e
