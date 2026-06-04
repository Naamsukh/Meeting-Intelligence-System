"""Extract a summary, decisions, and action items from a transcript via Groq.

Output is parsed and validated against Pydantic models, so malformed LLM JSON
degrades gracefully (empty lists) instead of crashing the pipeline.
"""

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, ValidationError

from app.rag.llm import get_chat_model
from app.rag.prompts import EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_TEMPLATE

logger = logging.getLogger("services.intelligence")

# Cap transcript size sent for extraction (summary needs breadth, not every token).
MAX_EXTRACTION_CHARS = 30000


class ActionItemModel(BaseModel):
    description: str
    owner: str | None = None
    due: str | None = None


class ExtractionResult(BaseModel):
    summary: str = ""
    decisions: list[str] = []
    action_items: list[ActionItemModel] = []


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return text.strip()


def extract(transcript: str) -> ExtractionResult:
    if not transcript.strip():
        return ExtractionResult()

    trimmed = transcript[:MAX_EXTRACTION_CHARS]
    messages = [
        SystemMessage(content=EXTRACTION_SYSTEM_PROMPT),
        HumanMessage(content=EXTRACTION_USER_TEMPLATE.format(transcript=trimmed)),
    ]

    try:
        response = get_chat_model(temperature=0.0).invoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)
        parsed = json.loads(_strip_code_fences(raw))
        return ExtractionResult.model_validate(parsed)
    except (json.JSONDecodeError, ValidationError, Exception) as exc:  # noqa: BLE001
        logger.warning("intelligence extraction failed: %s", exc)
        return ExtractionResult()
