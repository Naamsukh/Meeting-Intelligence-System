"""Async upload-processing pipeline (runs in the Celery worker).

Stages (each logged + timed for observability):
  transcribe/parse -> persist segments -> aggregate speakers -> RAG index ->
  extract intelligence -> mark completed.
"""

import logging
import time
import uuid
from collections import defaultdict

from app.celery_app import celery
from app.database import SessionLocal
from app.logging_config import log_event
from app.models import (
    ActionItem,
    Decision,
    Recording,
    Speaker,
    TranscriptSegment,
)
from app.rag.chunking import Utterance, chunk_utterances
from app.rag.pipeline import index_recording
from app.services import deepgram_service, intelligence
from app.services.transcript_parser import parse_file
from app.storage import absolute_path

logger = logging.getLogger("tasks")


@celery.task(name="process_upload", bind=True, max_retries=0)
def process_upload(self, recording_id: str) -> str:
    db = SessionLocal()
    rec_id = uuid.UUID(recording_id)
    try:
        recording = db.get(Recording, rec_id)
        if recording is None:
            return "recording-missing"

        recording.status = "processing"
        db.commit()

        path = absolute_path(recording.file_path)
        t0 = time.perf_counter()

        # 1. Transcribe (audio/video) or parse (transcript file).
        if recording.media_type == "transcript":
            utterances = parse_file(path)
            duration = utterances[-1].end_seconds if utterances else 0.0
            stage = "parse"
        else:
            utterances, duration = deepgram_service.transcribe(path)
            stage = "deepgram"

        log_event(
            logger,
            "transcription complete",
            recording_id=recording_id,
            stage=stage,
            utterances=len(utterances),
            ms=round((time.perf_counter() - t0) * 1000, 1),
        )

        if not utterances:
            raise ValueError("No transcript content could be extracted from the file.")

        recording.duration_seconds = duration

        # 2. Persist ordered transcript segments.
        _persist_segments(db, rec_id, utterances)

        # 3. Aggregate speaker stats.
        _persist_speakers(db, rec_id, utterances)
        db.commit()

        # 4. RAG index: chunk -> embed -> pgvector.
        chunks = chunk_utterances(utterances)
        index_recording(db, rec_id, chunks)

        # 5. Extract meeting intelligence (summary / decisions / action items).
        full_text = "\n".join(f"{u.speaker}: {u.text}" for u in utterances)
        result = intelligence.extract(full_text)
        _persist_intelligence(db, rec_id, recording, result)

        recording.status = "completed"
        recording.error = None
        db.commit()
        log_event(
            logger,
            "processing complete",
            recording_id=recording_id,
            total_ms=round((time.perf_counter() - t0) * 1000, 1),
        )
        return "completed"

    except Exception as exc:  # noqa: BLE001
        logger.exception("processing failed for %s", recording_id)
        db.rollback()
        recording = db.get(Recording, rec_id)
        if recording is not None:
            recording.status = "failed"
            recording.error = str(exc)[:1000]
            db.commit()
        return "failed"
    finally:
        db.close()


def _persist_segments(db, rec_id: uuid.UUID, utterances: list[Utterance]) -> None:
    db.query(TranscriptSegment).filter(TranscriptSegment.recording_id == rec_id).delete()
    for i, u in enumerate(utterances):
        db.add(
            TranscriptSegment(
                recording_id=rec_id,
                idx=i,
                speaker=u.speaker,
                start_seconds=u.start_seconds,
                end_seconds=u.end_seconds,
                text=u.text,
            )
        )


def _persist_speakers(db, rec_id: uuid.UUID, utterances: list[Utterance]) -> None:
    db.query(Speaker).filter(Speaker.recording_id == rec_id).delete()
    seconds: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for u in utterances:
        seconds[u.speaker] += max(0.0, u.end_seconds - u.start_seconds)
        counts[u.speaker] += 1
    for label in counts:
        db.add(
            Speaker(
                recording_id=rec_id,
                label=label,
                total_speaking_seconds=round(seconds[label], 2),
                segment_count=counts[label],
            )
        )


def _persist_intelligence(db, rec_id: uuid.UUID, recording, result) -> None:
    db.query(ActionItem).filter(ActionItem.recording_id == rec_id).delete()
    db.query(Decision).filter(Decision.recording_id == rec_id).delete()
    recording.summary = result.summary or None
    for d in result.decisions:
        db.add(Decision(recording_id=rec_id, description=d))
    for a in result.action_items:
        db.add(ActionItem(recording_id=rec_id, description=a.description, owner=a.owner, due=a.due))
