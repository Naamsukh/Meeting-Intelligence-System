from app.rag.chunking import Utterance, chunk_utterances


def _make_utterances(n: int) -> list[Utterance]:
    return [
        Utterance(
            speaker=f"Speaker {i % 2 + 1}",
            start_seconds=float(i * 10),
            end_seconds=float(i * 10 + 9),
            text="word " * 50,  # ~250 chars ~ 60 tokens each
        )
        for i in range(n)
    ]


def test_empty_input_returns_no_chunks():
    assert chunk_utterances([]) == []


def test_chunks_carry_time_and_speaker_metadata():
    utts = _make_utterances(20)
    chunks = chunk_utterances(utts, target_tokens=300, overlap_utterances=1)
    assert len(chunks) > 1
    for c in chunks:
        assert c.end_seconds >= c.start_seconds
        assert c.speakers  # at least one speaker recorded
        assert c.content


def test_single_short_utterance_makes_one_chunk():
    utts = [Utterance(speaker="A", start_seconds=0, end_seconds=2, text="short hello")]
    chunks = chunk_utterances(utts, target_tokens=600)
    assert len(chunks) == 1
    assert "A" in chunks[0].speakers
