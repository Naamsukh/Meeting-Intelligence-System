"""Test fixtures.

Crucially, tests run against an **isolated** database (`<db>_test`), created on
demand, so running the suite never touches the real dev/prod data. DB-backed
tests are skipped automatically when Postgres isn't reachable.
"""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def _url_str(url) -> str:
    # NB: str(url) masks the password as '***'; we must render it in full.
    return url.render_as_string(hide_password=False)


def _derive_test_url(url: str) -> str:
    parsed = make_url(url)
    db = parsed.database or "meeting"
    if not db.endswith("_test"):
        db = f"{db}_test"
    return _url_str(parsed.set(database=db))


def _ensure_test_db(base_url: str, test_url: str) -> bool:
    """Create the test database if it doesn't exist. Returns True on success."""
    admin = make_url(base_url).set(database="postgres")
    test_db = make_url(test_url).database
    try:
        engine = create_engine(_url_str(admin), isolation_level="AUTOCOMMIT")
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": test_db}
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{test_db}"'))
        return True
    except Exception:  # noqa: BLE001
        return False


_BASE_URL = os.environ.get("DATABASE_URL", "")
DB_AVAILABLE = False

if _BASE_URL:
    _TEST_URL = _derive_test_url(_BASE_URL)
    if _ensure_test_db(_BASE_URL, _TEST_URL):
        # Point the whole app at the test DB *before* app modules are imported.
        os.environ["DATABASE_URL"] = _TEST_URL
        try:
            test_engine = create_engine(_TEST_URL)
            with test_engine.connect() as c:
                c.execute(text("SELECT 1"))
            DB_AVAILABLE = True
        except Exception:  # noqa: BLE001
            DB_AVAILABLE = False


requires_db = pytest.mark.skipif(not DB_AVAILABLE, reason="Postgres not reachable")


@pytest.fixture
def client():
    """TestClient backed by the isolated test database."""
    from fastapi.testclient import TestClient

    from app.database import Base, engine
    from app.main import app

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with TestClient(app) as c:
        yield c

    Base.metadata.drop_all(bind=engine)
