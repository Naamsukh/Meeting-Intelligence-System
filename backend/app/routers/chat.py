import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import ChatMessage, Recording, User
from app.rag.pipeline import answer_question, stream_answer_question
from app.schemas import ChatMessageOut, ChatRequest, ChatResponse, ChatSource

router = APIRouter(prefix="/recordings", tags=["chat"])


def _get_owned_recording(db: Session, recording_id: uuid.UUID, user: User) -> Recording:
    rec = db.get(Recording, recording_id)
    if rec is None or rec.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return rec


@router.post("/{recording_id}/chat", response_model=ChatResponse)
def chat(
    recording_id: uuid.UUID,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    rec = _get_owned_recording(db, recording_id, user)
    if rec.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Recording is not ready yet (status: {rec.status}).",
        )

    answer, retrieved = answer_question(db, recording_id, body.question)

    sources = [
        ChatSource(
            chunk_id=c.id,
            chunk_index=c.chunk_index,
            start_seconds=c.start_seconds,
            end_seconds=c.end_seconds,
            speakers=c.speakers,
            score=c.score,
        )
        for c in retrieved
    ]
    sources_payload = [s.model_dump() for s in sources]

    # Persist both turns for history + observability (sources include scores).
    db.add(
        ChatMessage(
            recording_id=recording_id, user_id=user.id, role="user", content=body.question
        )
    )
    db.add(
        ChatMessage(
            recording_id=recording_id,
            user_id=user.id,
            role="assistant",
            content=answer,
            sources=sources_payload,
        )
    )
    db.commit()

    return ChatResponse(answer=answer, sources=sources)


@router.post("/{recording_id}/chat/stream")
def stream_chat(
    recording_id: uuid.UUID,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    rec = _get_owned_recording(db, recording_id, user)
    if rec.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Recording is not ready yet (status: {rec.status}).",
        )

    def event_generator():
        full_answer: list[str] = []
        sources_payload: list[dict] = []

        for event in stream_answer_question(db, recording_id, body.question):
            if event["type"] == "delta":
                full_answer.append(event["text"])
                yield f"data: {json.dumps({'type': 'delta', 'text': event['text']})}\n\n"
            elif event["type"] == "done":
                sources_payload = event.get("sources", [])
                yield f"data: {json.dumps({'type': 'done', 'sources': sources_payload})}\n\n"

        answer = "".join(full_answer)
        db.add(
            ChatMessage(
                recording_id=recording_id, user_id=user.id, role="user", content=body.question
            )
        )
        db.add(
            ChatMessage(
                recording_id=recording_id,
                user_id=user.id,
                role="assistant",
                content=answer,
                sources=sources_payload,
            )
        )
        db.commit()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{recording_id}/messages", response_model=list[ChatMessageOut])
def list_messages(
    recording_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ChatMessage]:
    _get_owned_recording(db, recording_id, user)
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.recording_id == recording_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
