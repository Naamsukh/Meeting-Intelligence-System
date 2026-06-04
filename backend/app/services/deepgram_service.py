"""Deepgram transcription with speaker diarization.

Returns the same `Utterance` shape the parser produces, so downstream chunking /
indexing is identical whether the source was an uploaded transcript or audio.
"""

import logging

from deepgram import DeepgramClient, FileSource, PrerecordedOptions

from app.config import settings
from app.rag.chunking import Utterance

logger = logging.getLogger("services.deepgram")


def transcribe(path: str) -> tuple[list[Utterance], float]:
    """Transcribe an audio/video file. Returns (utterances, duration_seconds)."""
    client = DeepgramClient(settings.deepgram_api_key)

    with open(path, "rb") as f:
        payload: FileSource = {"buffer": f.read()}

    options = PrerecordedOptions(
        model="nova-2",
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
    channels = results.get("channels") or []
    if channels:
        alt = (channels[0].get("alternatives") or [{}])[0]
        transcript = (alt.get("transcript") or "").strip()
        if transcript:
            return [Utterance(speaker="Speaker 1", start_seconds=0.0, end_seconds=0.0, text=transcript)]
    return out
