"""Parse uploaded transcript files into a list of Utterances.

Supports the common shapes seen in meeting exports:
  - `[00:01:23] Alice: text`           (bracketed timestamp + speaker)
  - `Alice (00:01:23): text`           (speaker + parenthesised timestamp)
  - `00:01:23 Alice: text`             (leading timestamp + speaker)
  - `Alice: text`                       (speaker only, no timestamp)
  - `.srt` / `.vtt` cue blocks
Unrecognised lines are appended to the current utterance so nothing is lost.
"""

import re
from pathlib import Path

from app.rag.chunking import Utterance

_BRACKET_TS = re.compile(r"^\[(?P<ts>\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]\s*(?P<rest>.*)$")
_LEADING_TS = re.compile(r"^(?P<ts>\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s+(?P<rest>.*)$")
_SPEAKER_PAREN_TS = re.compile(
    r"^(?P<speaker>[^:()]{1,60})\((?P<ts>\d{1,2}:\d{2}(?::\d{2})?)\):\s*(?P<text>.*)$"
)
_SPEAKER_COLON = re.compile(r"^(?P<speaker>[^:]{1,60}):\s*(?P<text>.*)$")
_SRT_TIME = re.compile(
    r"(?P<start>\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(?P<end>\d{2}:\d{2}:\d{2}[.,]\d{3})"
)


def _ts_to_seconds(ts: str) -> float:
    ts = ts.replace(",", ".")
    parts = ts.split(":")
    parts = [float(p) for p in parts]
    if len(parts) == 3:
        h, m, s = parts
    elif len(parts) == 2:
        h, m, s = 0.0, parts[0], parts[1]
    else:
        return float(parts[0])
    return h * 3600 + m * 60 + s


def _looks_like_srt_or_vtt(text: str) -> bool:
    return "-->" in text


def parse_text(text: str) -> list[Utterance]:
    if _looks_like_srt_or_vtt(text):
        return _parse_cues(text)
    return _parse_lines(text)


def parse_file(path: str) -> list[Utterance]:
    content = Path(path).read_text(encoding="utf-8", errors="replace")
    return parse_text(content)


def _parse_lines(text: str) -> list[Utterance]:
    utterances: list[Utterance] = []
    current_speaker = "Speaker 1"

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        ts_seconds = 0.0
        rest = line

        m = _BRACKET_TS.match(line)
        if m:
            ts_seconds = _ts_to_seconds(m.group("ts"))
            rest = m.group("rest").strip()
        else:
            m = _LEADING_TS.match(line)
            if m:
                ts_seconds = _ts_to_seconds(m.group("ts"))
                rest = m.group("rest").strip()

        speaker = current_speaker
        body = rest

        mp = _SPEAKER_PAREN_TS.match(rest)
        if mp:
            speaker = mp.group("speaker").strip()
            ts_seconds = _ts_to_seconds(mp.group("ts"))
            body = mp.group("text").strip()
        else:
            mc = _SPEAKER_COLON.match(rest)
            if mc and not mc.group("speaker").strip().isdigit():
                speaker = mc.group("speaker").strip()
                body = mc.group("text").strip()

        if not body:
            continue

        current_speaker = speaker
        utterances.append(
            Utterance(speaker=speaker, start_seconds=ts_seconds, end_seconds=ts_seconds, text=body)
        )

    return _finalize_ends(utterances)


def _parse_cues(text: str) -> list[Utterance]:
    utterances: list[Utterance] = []
    blocks = re.split(r"\n\s*\n", text)
    for block in blocks:
        lines = [ln for ln in block.splitlines() if ln.strip() and ln.strip().upper() != "WEBVTT"]
        if not lines:
            continue
        start = end = 0.0
        body_lines: list[str] = []
        for ln in lines:
            tm = _SRT_TIME.search(ln)
            if tm:
                start = _ts_to_seconds(tm.group("start"))
                end = _ts_to_seconds(tm.group("end"))
            elif ln.strip().isdigit():
                continue  # cue index
            else:
                body_lines.append(ln.strip())
        if not body_lines:
            continue
        text_body = " ".join(body_lines)
        speaker = "Speaker 1"
        mc = _SPEAKER_COLON.match(text_body)
        if mc and not mc.group("speaker").strip().isdigit():
            speaker = mc.group("speaker").strip()
            text_body = mc.group("text").strip()
        utterances.append(
            Utterance(speaker=speaker, start_seconds=start, end_seconds=end, text=text_body)
        )
    return utterances


def _finalize_ends(utterances: list[Utterance]) -> list[Utterance]:
    # Where end timestamps are unknown, approximate each end as the next start.
    for i in range(len(utterances) - 1):
        if utterances[i].end_seconds <= utterances[i].start_seconds:
            utterances[i].end_seconds = max(
                utterances[i].start_seconds, utterances[i + 1].start_seconds
            )
    return utterances
