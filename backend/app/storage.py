import os
import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import settings

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4a", ".wav", ".mp3", ".ogg", ".flac"}
TRANSCRIPT_EXTS = {".txt", ".vtt", ".srt", ".md"}


def detect_media_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in TRANSCRIPT_EXTS:
        return "transcript"
    if ext in VIDEO_EXTS:
        return "video"
    # Default unknown binary uploads to video (will be sent to Deepgram).
    return "video"


def is_allowed(filename: str) -> bool:
    ext = Path(filename).suffix.lower()
    return ext in VIDEO_EXTS or ext in TRANSCRIPT_EXTS


def save_upload(upload: UploadFile, user_id: uuid.UUID) -> tuple[str, int]:
    """Stream an uploaded file to disk. Returns (relative_path, size_bytes)."""
    user_dir = Path(settings.upload_dir) / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    safe_name = Path(upload.filename or "upload").name
    stored_name = f"{uuid.uuid4().hex}_{safe_name}"
    dest = user_dir / stored_name

    size = 0
    with dest.open("wb") as out:
        shutil.copyfileobj(upload.file, out)
    size = dest.stat().st_size

    # Store path relative to upload_dir so the DB stays portable across mounts.
    rel_path = os.path.relpath(dest, settings.upload_dir)
    return rel_path, size


def absolute_path(rel_path: str) -> str:
    return str(Path(settings.upload_dir) / rel_path)
