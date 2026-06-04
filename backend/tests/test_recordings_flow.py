import io

from tests.conftest import requires_db


def _auth(client, email):
    r = client.post("/auth/signup", json={"email": email, "password": "secret123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@requires_db
def test_upload_returns_immediately_and_enqueues(client, monkeypatch):
    # Don't actually enqueue to Celery during the test.
    calls = {}
    from app.tasks import process_upload

    monkeypatch.setattr(process_upload, "delay", lambda rid: calls.setdefault("id", rid))

    headers = _auth(client, "uploader@example.com")
    files = {"file": ("meeting.txt", io.BytesIO(b"Alice: Hello team."), "text/plain")}
    r = client.post("/recordings", headers=headers, files=files)

    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "uploaded"  # returns before processing finishes
    assert body["media_type"] == "transcript"
    assert calls.get("id") == body["id"]


@requires_db
def test_recordings_are_scoped_to_owner(client, monkeypatch):
    from app.tasks import process_upload

    monkeypatch.setattr(process_upload, "delay", lambda rid: None)

    h1 = _auth(client, "owner1@example.com")
    h2 = _auth(client, "owner2@example.com")

    files = {"file": ("m.txt", io.BytesIO(b"Bob: hi"), "text/plain")}
    rec_id = client.post("/recordings", headers=h1, files=files).json()["id"]

    # Owner can fetch it; another user cannot.
    assert client.get(f"/recordings/{rec_id}", headers=h1).status_code == 200
    assert client.get(f"/recordings/{rec_id}", headers=h2).status_code == 404
    assert client.get("/recordings", headers=h2).json() == []


@requires_db
def test_unsupported_file_type_rejected(client):
    headers = _auth(client, "badfile@example.com")
    files = {"file": ("evil.exe", io.BytesIO(b"MZ"), "application/octet-stream")}
    r = client.post("/recordings", headers=headers, files=files)
    assert r.status_code == 400
