"""Lightweight input/output guardrails for the Q&A path.

These are intentionally simple and transparent. Stronger guardrails (a
moderation model, jailbreak classifiers, PII redaction) are noted in the README
as production follow-ups.
"""

import re

NO_CONTEXT_ANSWER = "I couldn't find that in this meeting."

_INJECTION_PATTERNS = [
    r"ignore (all |the )?(previous|prior|above) instructions",
    r"disregard (the )?(system|previous) prompt",
    r"reveal (your )?(system )?prompt",
    r"you are now",
]


def validate_question(question: str) -> str | None:
    """Return an error message if the question should be rejected, else None."""
    q = question.strip()
    if not q:
        return "Question cannot be empty."
    if len(q) > 2000:
        return "Question is too long (max 2000 characters)."
    return None


def looks_like_injection(question: str) -> bool:
    q = question.lower()
    return any(re.search(p, q) for p in _INJECTION_PATTERNS)


def has_sufficient_context(retrieved: list) -> bool:
    """No retrieved chunks above threshold => we should refuse rather than guess."""
    return len(retrieved) > 0
