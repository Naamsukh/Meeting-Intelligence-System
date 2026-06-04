"""Groq chat model accessor (via LangChain)."""

from functools import lru_cache

from langchain_groq import ChatGroq

from app.config import settings


@lru_cache
def get_chat_model(temperature: float = 0.1) -> ChatGroq:
    return ChatGroq(
        model=settings.groq_model,
        api_key=settings.groq_api_key,
        temperature=temperature,
        timeout=60,
        max_retries=2,
    )
