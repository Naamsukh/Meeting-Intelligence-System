"""Speaker- and time-aware chunking for meeting transcripts.

Meetings are conversational, so instead of splitting on a fixed character window
(which can cut mid-sentence and lose who-said-what), we group consecutive
utterances into windows of roughly `target_tokens`, with a small overlap so a
question whose answer straddles a boundary still retrieves the right context.
Each chunk carries its time span and the set of speakers it contains, which we
later surface as citations in the UI.
"""

from dataclasses import dataclass, field


@dataclass
class Utterance:
    speaker: str
    start_seconds: float
    end_seconds: float
    text: str


@dataclass
class Chunk:
    content: str
    start_seconds: float
    end_seconds: float
    speakers: list[str] = field(default_factory=list)


def _approx_tokens(text: str) -> int:
    # ~4 chars per token is a good enough heuristic for sizing chunks.
    return max(1, len(text) // 4)


def _format_line(u: Utterance) -> str:
    ts = _format_ts(u.start_seconds)
    return f"[{ts}] {u.speaker}: {u.text}".strip()


def _format_ts(seconds: float) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def chunk_utterances(
    utterances: list[Utterance],
    target_tokens: int = 600,
    overlap_utterances: int = 1,
) -> list[Chunk]:
    """Group utterances into overlapping, speaker-aware chunks."""
    chunks: list[Chunk] = []
    if not utterances:
        return chunks

    window: list[Utterance] = []
    token_count = 0

    def flush(window_items: list[Utterance]) -> None:
        if not window_items:
            return
        content = "\n".join(_format_line(u) for u in window_items)
        speakers = list(dict.fromkeys(u.speaker for u in window_items))
        chunks.append(
            Chunk(
                content=content,
                start_seconds=window_items[0].start_seconds,
                end_seconds=window_items[-1].end_seconds,
                speakers=speakers,
            )
        )

    for u in utterances:
        window.append(u)
        token_count += _approx_tokens(u.text)
        if token_count >= target_tokens:
            flush(window)
            # Keep the last few utterances as overlap for the next window.
            window = window[-overlap_utterances:] if overlap_utterances else []
            token_count = sum(_approx_tokens(x.text) for x in window)

    # Flush remainder (avoid emitting a duplicate of pure-overlap tail).
    if window and (not chunks or window[-1].end_seconds > chunks[-1].end_seconds):
        flush(window)

    return chunks
