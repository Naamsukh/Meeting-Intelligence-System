"""RAG orchestration: index a recording and answer questions over it.

Indexing (worker): utterances -> speaker/time-aware chunks -> OpenAI embeddings
-> pgvector. Querying (chat): guardrail -> embed question -> pgvector retrieval
-> grounded Groq generation with citations. LangChain provides the LLM client,
prompt and message primitives; retrieval is plain pgvector for transparency.
"""

import logging
import time
import uuid
from typing import Generator

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from app.config import settings
from app.logging_config import log_event
from app.rag import guardrails
from app.rag.chunking import Chunk
from app.rag.llm import get_chat_model
from app.rag.prompts import ANSWER_SYSTEM_PROMPT, ANSWER_USER_TEMPLATE
from app.rag.vectorstore import RetrievedChunk, index_chunks, retrieve

logger = logging.getLogger("rag.pipeline")


def index_recording(db: Session, recording_id: uuid.UUID, chunks: list[Chunk]) -> int:
    t0 = time.perf_counter()
    count = index_chunks(db, recording_id, chunks)
    log_event(
        logger,
        "indexed recording chunks",
        recording_id=str(recording_id),
        chunks=count,
        ms=round((time.perf_counter() - t0) * 1000, 1),
    )
    return count


def _format_context(chunks: list[RetrievedChunk]) -> str:
    return "\n\n".join(c.content for c in chunks)


def answer_question(
    db: Session, recording_id: uuid.UUID, question: str
) -> tuple[str, list[RetrievedChunk]]:
    """Run the RAG query path. Returns (answer, retrieved_chunks_used)."""
    # 1. Input guardrails.
    error = guardrails.validate_question(question)
    if error:
        return error, []
    if guardrails.looks_like_injection(question):
        return (
            "I can only answer questions about the content of this meeting.",
            [],
        )

    # 2. Retrieve.
    t_retrieve = time.perf_counter()
    retrieved = retrieve(
        db,
        recording_id,
        question,
        top_k=settings.retrieval_top_k,
        score_threshold=settings.retrieval_score_threshold,
    )
    retrieve_ms = round((time.perf_counter() - t_retrieve) * 1000, 1)

    # 3. Refuse if nothing relevant was found (anti-hallucination guardrail).
    if not guardrails.has_sufficient_context(retrieved):
        log_event(
            logger,
            "no context retrieved; refusing",
            recording_id=str(recording_id),
            retrieve_ms=retrieve_ms,
        )
        return guardrails.NO_CONTEXT_ANSWER, []

    # 4. Generate a grounded answer.
    context = _format_context(retrieved)
    messages = [
        SystemMessage(content=ANSWER_SYSTEM_PROMPT),
        HumanMessage(content=ANSWER_USER_TEMPLATE.format(context=context, question=question)),
    ]
    t_gen = time.perf_counter()
    response = get_chat_model().invoke(messages)
    gen_ms = round((time.perf_counter() - t_gen) * 1000, 1)

    answer = response.content if hasattr(response, "content") else str(response)

    log_event(
        logger,
        "answered question",
        recording_id=str(recording_id),
        retrieved=len(retrieved),
        top_score=retrieved[0].score if retrieved else None,
        retrieve_ms=retrieve_ms,
        gen_ms=gen_ms,
    )
    return answer.strip(), retrieved


def stream_answer_question(
    db: Session, recording_id: uuid.UUID, question: str
) -> Generator[dict, None, None]:
    """Streaming RAG query. Yields SSE-ready dicts:
      {type: 'delta', text: str}  — one per LLM token
      {type: 'done', sources: list}  — after the final token
    """
    error = guardrails.validate_question(question)
    if error:
        yield {"type": "delta", "text": error}
        yield {"type": "done", "sources": []}
        return
    if guardrails.looks_like_injection(question):
        msg = "I can only answer questions about the content of this meeting."
        yield {"type": "delta", "text": msg}
        yield {"type": "done", "sources": []}
        return

    retrieved = retrieve(
        db,
        recording_id,
        question,
        top_k=settings.retrieval_top_k,
        score_threshold=settings.retrieval_score_threshold,
    )

    if not guardrails.has_sufficient_context(retrieved):
        yield {"type": "delta", "text": guardrails.NO_CONTEXT_ANSWER}
        yield {"type": "done", "sources": []}
        return

    context = _format_context(retrieved)
    messages = [
        SystemMessage(content=ANSWER_SYSTEM_PROMPT),
        HumanMessage(content=ANSWER_USER_TEMPLATE.format(context=context, question=question)),
    ]

    for chunk in get_chat_model().stream(messages):
        delta = chunk.content if hasattr(chunk, "content") else str(chunk)
        if delta:
            yield {"type": "delta", "text": delta}

    sources = [
        {
            "chunk_id": c.id,
            "chunk_index": c.chunk_index,
            "start_seconds": c.start_seconds,
            "end_seconds": c.end_seconds,
            "speakers": c.speakers,
            "score": c.score,
        }
        for c in retrieved
    ]
    yield {"type": "done", "sources": sources}
