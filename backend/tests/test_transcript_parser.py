from app.services.transcript_parser import parse_text


def test_bracketed_timestamp_with_speaker():
    text = """[00:00:05] Alice: Welcome everyone to the planning meeting.
[00:00:12] Bob: Thanks Alice. Let's start with the roadmap."""
    utts = parse_text(text)
    assert len(utts) == 2
    assert utts[0].speaker == "Alice"
    assert utts[0].start_seconds == 5
    assert "Welcome" in utts[0].text
    assert utts[1].speaker == "Bob"
    assert utts[1].start_seconds == 12


def test_speaker_paren_timestamp():
    text = "Carol (01:02): We decided to ship on Friday."
    utts = parse_text(text)
    assert len(utts) == 1
    assert utts[0].speaker == "Carol"
    assert utts[0].start_seconds == 62


def test_speaker_only_no_timestamp_carries_forward():
    text = """Dave: First point.
Continuation of Dave's thought.
Eve: A reply."""
    utts = parse_text(text)
    assert utts[0].speaker == "Dave"
    # Unlabeled continuation line is attributed to the current speaker.
    assert utts[1].speaker == "Dave"
    assert utts[2].speaker == "Eve"


def test_srt_parsing():
    srt = """1
00:00:01,000 --> 00:00:04,000
Frank: The budget is approved.

2
00:00:05,000 --> 00:00:08,000
Grace: Great, I'll send the email."""
    utts = parse_text(srt)
    assert len(utts) == 2
    assert utts[0].speaker == "Frank"
    assert utts[0].start_seconds == 1
    assert utts[1].speaker == "Grace"
