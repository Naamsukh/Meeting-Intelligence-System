import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Recording, Speaker, TranscriptChunk, TranscriptSegment, User
from app.schemas import RecordingDetailOut, RecordingOut, SegmentOut, SpeakerOut, SpeakerRenameRequest
from app.storage import absolute_path, detect_media_type, is_allowed, save_upload

router = APIRouter(prefix="/recordings", tags=["recordings"])


def _get_owned_recording(db: Session, recording_id: uuid.UUID, user: User) -> Recording:
    rec = db.get(Recording, recording_id)
    if rec is None or rec.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return rec


@router.post("", response_model=RecordingOut, status_code=status.HTTP_201_CREATED)
def upload_recording(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Recording:
    if not file.filename or not is_allowed(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Upload audio/video or a .txt/.vtt/.srt transcript.",
        )

    rel_path, size = save_upload(file, user.id)
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if size > max_bytes:
        os.remove(absolute_path(rel_path))
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.max_upload_mb} MB limit.",
        )

    recording = Recording(
        user_id=user.id,
        original_filename=file.filename,
        file_path=rel_path,
        media_type=detect_media_type(file.filename),
        mime_type=file.content_type,
        size_bytes=size,
        status="uploaded",
    )
    db.add(recording)
    db.commit()
    db.refresh(recording)

    # Enqueue async processing; respond immediately so the UI never blocks.
    from app.tasks import process_upload

    process_upload.delay(str(recording.id))
    return recording


@router.get("", response_model=list[RecordingOut])
def list_recordings(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Recording]:
    return (
        db.query(Recording)
        .filter(Recording.user_id == user.id)
        .order_by(Recording.created_at.desc())
        .all()
    )


@router.get("/{recording_id}", response_model=RecordingDetailOut)
def get_recording(
    recording_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Recording:
    return _get_owned_recording(db, recording_id, user)


@router.get("/{recording_id}/transcript", response_model=list[SegmentOut])
def get_transcript(
    recording_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TranscriptSegment]:
    _get_owned_recording(db, recording_id, user)
    return (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.recording_id == recording_id)
        .order_by(TranscriptSegment.idx.asc())
        .all()
    )


@router.patch("/{recording_id}/speakers/{speaker_id}", response_model=SpeakerOut)
def rename_speaker(
    recording_id: uuid.UUID,
    speaker_id: int,
    body: SpeakerRenameRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Speaker:
    _get_owned_recording(db, recording_id, user)
    speaker = db.get(Speaker, speaker_id)
    if speaker is None or speaker.recording_id != recording_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speaker not found")

    old_label = speaker.label
    new_label = body.name.strip()
    speaker.label = new_label

    db.query(TranscriptSegment).filter(
        TranscriptSegment.recording_id == recording_id,
        TranscriptSegment.speaker == old_label,
    ).update({"speaker": new_label})

    for chunk in (
        db.query(TranscriptChunk)
        .filter(
            TranscriptChunk.recording_id == recording_id,
            TranscriptChunk.speakers.isnot(None),
        )
        .all()
    ):
        if chunk.speakers and old_label in chunk.speakers:
            parts = [p.strip() for p in chunk.speakers.split(",")]
            chunk.speakers = ", ".join(new_label if p == old_label else p for p in parts)

    db.commit()
    db.refresh(speaker)
    return speaker


@router.get("/{recording_id}/media")
def get_media(
    recording_id: uuid.UUID,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> FileResponse:
    # The <video> element can't send an Authorization header, so this endpoint
    # accepts the JWT as a `?token=` query parameter instead.
    from app.security import decode_token

    subject = decode_token(token) if token else None
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.get(User, uuid.UUID(subject))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    rec = _get_owned_recording(db, recording_id, user)
    if rec.media_type != "video":
        raise HTTPException(status_code=404, detail="No media for this recording")
    path = absolute_path(rec.file_path)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Media file missing")
    # FileResponse supports HTTP range requests, so the browser can seek/stream.
    return FileResponse(path, media_type=rec.mime_type or "application/octet-stream")
