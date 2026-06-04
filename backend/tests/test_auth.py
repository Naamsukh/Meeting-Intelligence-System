from tests.conftest import requires_db


@requires_db
def test_signup_login_and_me(client):
    r = client.post("/auth/signup", json={"email": "a@example.com", "password": "secret123"})
    assert r.status_code == 201
    token = r.json()["access_token"]
    assert token

    # Duplicate signup is rejected.
    r2 = client.post("/auth/signup", json={"email": "a@example.com", "password": "secret123"})
    assert r2.status_code == 409

    # Login works and returns a token.
    r3 = client.post("/auth/login", json={"email": "a@example.com", "password": "secret123"})
    assert r3.status_code == 200

    # Wrong password rejected.
    r4 = client.post("/auth/login", json={"email": "a@example.com", "password": "nope"})
    assert r4.status_code == 401

    # /me requires and accepts the token.
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"


@requires_db
def test_me_requires_auth(client):
    assert client.get("/auth/me").status_code == 401
