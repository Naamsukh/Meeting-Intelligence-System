"""Hybrid search (semantic + full-text) over transcript_chunks.

Semantic results come from pgvector cosine distance; full-text results from
PostgreSQL tsvector/tsquery.  Both candidate pools are fetched independently,
then merged with Reciprocal Rank Fusion (RRF) so chunks that rank highly in
either signal rise to the top without needing hand-tuned weights.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import delete, func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import TranscriptChunk
from app.rag.chunking import Chunk
from app.rag.embeddings import embed_query, embed_texts

_RRF_K = 60  # standard constant; dampens the penalty for lower-ranked results


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
                # ts_content is a GENERATED ALWAYS AS column — the DB computes it.
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
    """Hybrid retrieval: fuse semantic and full-text rankings with RRF.

    Both passes fetch `fetch_k` candidates independently.  RRF then re-ranks
    the union; we return the top `top_k` results.  `score_threshold` is applied
    to the cosine-similarity score so clearly irrelevant semantic-only matches
    are still filtered, but keyword matches are always kept.
    """
    fetch_k = settings.retrieval_fetch_k

    query_vector = embed_query(query)

    # ── Semantic pass ──────────────────────────────────────────────────────────
    distance = TranscriptChunk.embedding.cosine_distance(query_vector).label("distance")
    semantic_rows = (
        db.query(TranscriptChunk, distance)
        .filter(TranscriptChunk.recording_id == recording_id)
        .order_by(distance.asc())
        .limit(fetch_k)
        .all()
    )

    semantic_ranks: dict[int, int] = {
        chunk.id: rank for rank, (chunk, _) in enumerate(semantic_rows, 1)
    }
    cosine_scores: dict[int, float] = {
        chunk.id: 1.0 - float(dist) for chunk, dist in semantic_rows
    }
    chunks_by_id: dict[int, TranscriptChunk] = {
        chunk.id: chunk for chunk, _ in semantic_rows
    }

    # ── Full-text pass ─────────────────────────────────────────────────────────
    fts_ranks: dict[int, int] = {}
    if query.strip():
        tsquery = func.plainto_tsquery("english", query)
        ts_rank_col = func.ts_rank(TranscriptChunk.ts_content, tsquery).label("ts_rank")
        fts_rows = (
            db.query(TranscriptChunk, ts_rank_col)
            .filter(
                TranscriptChunk.recording_id == recording_id,
                TranscriptChunk.ts_content.op("@@")(tsquery),
            )
            .order_by(ts_rank_col.desc())
            .limit(fetch_k)
            .all()
        )
        fts_ranks = {chunk.id: rank for rank, (chunk, _) in enumerate(fts_rows, 1)}
        for chunk, _ in fts_rows:
            chunks_by_id.setdefault(chunk.id, chunk)

    # ── Reciprocal Rank Fusion ─────────────────────────────────────────────────
    all_ids = set(semantic_ranks) | set(fts_ranks)
    rrf_scores: dict[int, float] = {
        cid: (
            (1.0 / (_RRF_K + semantic_ranks[cid]) if cid in semantic_ranks else 0.0)
            + (1.0 / (_RRF_K + fts_ranks[cid]) if cid in fts_ranks else 0.0)
        )
        for cid in all_ids
    }

    ranked_ids = sorted(all_ids, key=lambda cid: rrf_scores[cid], reverse=True)

    results: list[RetrievedChunk] = []
    for cid in ranked_ids[:top_k]:
        chunk = chunks_by_id[cid]
        # Display the cosine similarity so the existing UI percentage stays meaningful.
        # For FTS-only chunks (no semantic match), fall back to the RRF score.
        display_score = cosine_scores.get(cid)
        if display_score is None:
            # Keyword-only hit: include unconditionally, show a neutral score.
            display_score = 0.5
        elif display_score < score_threshold:
            continue
        results.append(
            RetrievedChunk(
                id=chunk.id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                start_seconds=chunk.start_seconds,
                end_seconds=chunk.end_seconds,
                speakers=chunk.speakers,
                score=round(display_score, 4),
            )
        )
    return results
