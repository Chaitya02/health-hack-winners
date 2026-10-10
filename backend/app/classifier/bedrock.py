"""Amazon Bedrock classifier (Converse API with a forced tool call for structured JSON)."""

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, ReadTimeoutError
from pydantic import ValidationError

from app.classifier.prompt import (
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    TOOL_NAME,
    TOOL_SPEC,
    wrap_patient_text,
)
from app.classifier.schema import (
    ClassifierError,
    ClassifierTimeout,
    InvalidLLMOutput,
    LLMOutput,
)

log = logging.getLogger("tingting.classifier")

_EXECUTOR = ThreadPoolExecutor(max_workers=16, thread_name_prefix="bedrock")


def _extract_payload(response: dict[str, Any]) -> Any:
    content = response.get("output", {}).get("message", {}).get("content", [])
    for block in content:
        tool_use = block.get("toolUse")
        if tool_use and tool_use.get("name") == TOOL_NAME:
            return tool_use.get("input")
    # Fallback: model answered in text; take the outermost JSON object.
    text = "".join(b.get("text", "") for b in content)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise InvalidLLMOutput("no tool call or JSON object in response")
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as e:
        raise InvalidLLMOutput(f"bad JSON: {e}") from e


class BedrockClassifier:
    prompt_version = PROMPT_VERSION

    def __init__(self, model_id: str, region: str, timeout_s: float = 3.0, client=None):
        self.model_id = model_id
        self.timeout_s = timeout_s
        self._client = client or boto3.client(
            "bedrock-runtime",
            region_name=region,
            config=Config(
                connect_timeout=1,
                read_timeout=max(1, int(timeout_s) + 1),
                retries={"max_attempts": 1, "mode": "standard"},
            ),
        )

    def _invoke(self, text: str) -> LLMOutput:
        try:
            response = self._client.converse(
                modelId=self.model_id,
                system=[{"text": SYSTEM_PROMPT}],
                messages=[{"role": "user", "content": [{"text": wrap_patient_text(text)}]}],
                inferenceConfig={"maxTokens": 500, "temperature": 0},
                toolConfig={"tools": [TOOL_SPEC], "toolChoice": {"tool": {"name": TOOL_NAME}}},
            )
        except ReadTimeoutError as e:
            raise ClassifierTimeout(str(e)) from e
        except (ClientError, BotoCoreError) as e:
            raise ClassifierError(f"{type(e).__name__}: {e}") from e
        payload = _extract_payload(response)
        try:
            return LLMOutput.model_validate(payload)
        except ValidationError as e:
            raise InvalidLLMOutput(str(e)) from e

    def classify(self, text: str) -> LLMOutput:
        """One retry on invalid output; the whole call (incl. retry) shares one deadline."""
        deadline = time.monotonic() + self.timeout_s
        last_invalid: InvalidLLMOutput | None = None
        for attempt in range(2):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            future = _EXECUTOR.submit(self._invoke, text)
            try:
                return future.result(timeout=remaining)
            except FutureTimeout as e:
                future.cancel()
                raise ClassifierTimeout(f"no response within {self.timeout_s}s") from e
            except InvalidLLMOutput as e:
                log.warning("invalid llm output", extra={"attempt": attempt + 1})
                last_invalid = e
        if last_invalid:
            raise last_invalid
        raise ClassifierTimeout(f"no response within {self.timeout_s}s")
