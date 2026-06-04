"""Vector storage + retrieval over the `transcript_chunks` table using pgvector.

We keep vectors in our own domain table (rather than a LangChain-managed table)
so embeddings live next to their recording, filtering by `recording_id` is a
plain indexed WHERE clause, and cleanup happens via normal cascade deletes.
Similarity uses pgvector's cosine distance operator (`<=>`); we convert distance
to a 0..1 similarity score for thresholding and display.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import TranscriptChunk
from app.rag.chunking import Chunk
from app.rag.embeddings import embed_query, embed_texts


@dataclass
class RetrievedChunk:
    id: int
    chunk_index: int
    content: str
    start_seconds: float
    end_seconds: float
    speakers: str | None
    score: float


def index_chunks(db: Session, recording_id: uuid.UUID, chunks: list[Chunk]) -> int:
    """Embed and persist chunks for a recording. Returns count stored."""
    # Replace any existing chunks for idempotent re-processing.
    db.execute(delete(TranscriptChunk).where(TranscriptChunk.recording_id == recording_id))

    if not chunks:
        db.commit()
        return 0

    vectors = embed_texts([c.content for c in chunks])
    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        db.add(
            TranscriptChunk(
                recording_id=recording_id,
                chunk_index=i,
                content=chunk.content,
                embedding=vector,
                start_seconds=chunk.start_seconds,
                end_seconds=chunk.end_seconds,
                speakers=", ".join(chunk.speakers) if chunk.speakers else None,
            )
        )
    db.commit()
    return len(chunks)


def retrieve(
    db: Session,
    recording_id: uuid.UUID,
    query: str,
    top_k: int,
    score_threshold: float = 0.0,
) -> list[RetrievedChunk]:
    """Return the most similar chunks for a query, filtered to one recording."""
    query_vector = embed_query(query)
    distance = TranscriptChunk.embedding.cosine_distance(query_vector).label("distance")

    rows = (
        db.query(TranscriptChunk, distance)
        .filter(TranscriptChunk.recording_id == recording_id)
        .order_by(distance.asc())
        .limit(top_k)
        .all()
    )

    results: list[RetrievedChunk] = []
    for chunk, dist in rows:
        score = 1.0 - float(dist)  # cosine similarity in [-1, 1]; for text ~[0,1]
        if score < score_threshold:
            continue
        results.append(
            RetrievedChunk(
                id=chunk.id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                start_seconds=chunk.start_seconds,
                end_seconds=chunk.end_seconds,
                speakers=chunk.speakers,
                score=round(score, 4),
            )
        )
    return results
