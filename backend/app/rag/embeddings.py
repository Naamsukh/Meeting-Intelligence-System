"""OpenAI embeddings wrapper (via LangChain).

Isolated behind a thin module so the rest of the codebase depends on
`embed_texts` / `embed_query` rather than a specific provider — swapping to a
local sentence-transformers model later only touches this file.
"""

from functools import lru_cache

from langchain_openai import OpenAIEmbeddings

from app.config import settings


@lru_cache
def _client() -> OpenAIEmbeddings:
    # Bounded timeout/retries so a bad key fails fast (status -> failed) instead
    # of hanging the worker in "processing".
    return OpenAIEmbeddings(
        model=settings.embedding_model,
        api_key=settings.openai_api_key,
        timeout=30,
        max_retries=2,
    )


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    return _client().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    return _client().embed_query(text)
