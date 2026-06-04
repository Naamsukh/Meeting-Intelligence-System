"""Deepgram transcription with speaker diarization.

Returns the same `Utterance` shape the parser produces, so downstream chunking /
indexing is identical whether the source was an uploaded transcript or audio.
"""

import logging
import mimetypes
import os

from deepgram import DeepgramClient, FileSource, PrerecordedOptions

from app.config import settings
from app.rag.chunking import Utterance

logger = logging.getLogger("services.deepgram")

_MIME_FALLBACKS = {
    ".mp4": "video/mp4",
    ".m4a": "audio/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
}


def _mime_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return _MIME_FALLBACKS.get(ext) or mimetypes.guess_type(path)[0] or "video/mp4"


def transcribe(path: str) -> tuple[list[Utterance], float]:
    """Transcribe an audio/video file. Returns (utterances, duration_seconds)."""
    client = DeepgramClient(settings.deepgram_api_key)

    mimetype = _mime_type(path)
    with open(path, "rb") as f:
        payload: FileSource = {"buffer": f.read(), "mimetype": mimetype}

    logger.info("sending to deepgram: path=%s mimetype=%s", path, mimetype)

    options = PrerecordedOptions(
        model="nova-3",
        smart_format=True,
        diarize=True,
        utterances=True,
        punctuate=True,
    )

    response = client.listen.rest.v("1").transcribe_file(payload, options)
    data = response.to_dict() if hasattr(response, "to_dict") else response

    duration = float(data.get("metadata", {}).get("duration", 0.0) or 0.0)
    utterances = _utterances_from_response(data)
    return utterances, duration


def _utterances_from_response(data: dict) -> list[Utterance]:
    results = data.get("results", {})
    raw_utterances = results.get("utterances") or []

    if raw_utterances:
        unique_speakers = {u.get("speaker") for u in raw_utterances}
        logger.info(
            "deepgram diarization: %d utterances, %d unique speaker(s): %s",
            len(raw_utterances),
            len(unique_speakers),
            sorted(unique_speakers),
        )
        if len(unique_speakers) == 1:
            logger.warning(
                "deepgram returned only one speaker index (%s) — diarization may not have worked. "
                "Check audio quality, file format, and that your Deepgram plan supports diarization.",
                unique_speakers,
            )

    out: list[Utterance] = []
    for u in raw_utterances:
        speaker_idx = u.get("speaker", 0)
        out.append(
            Utterance(
                speaker=f"Speaker {int(speaker_idx) + 1}",
                start_seconds=float(u.get("start", 0.0)),
                end_seconds=float(u.get("end", 0.0)),
                text=(u.get("transcript") or "").strip(),
            )
        )

    if out:
        return [u for u in out if u.text]

    # Fallback: no utterances array — use the flat transcript as one block.
    # This happens when diarize=True but the API didn't return an utterances array.
    logger.warning(
        "deepgram returned no utterances array (diarize=True was set but may have been ignored). "
        "Falling back to single-speaker flat transcript."
    )
    channels = results.get("channels") or []
    if channels:
        alt = (channels[0].get("alternatives") or [{}])[0]
        transcript = (alt.get("transcript") or "").strip()
        if transcript:
            return [Utterance(speaker="Speaker 1", start_seconds=0.0, end_seconds=0.0, text=transcript)]
    return out
