import time
import uuid
from collections import defaultdict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.logging_config import configure_logging, log_event, request_id_var
from app.routers import auth, chat, recordings

configure_logging()

app = FastAPI(title="Meeting Intelligence System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Very small in-process metrics store (counts + latency by route).
_metrics: dict[str, dict] = defaultdict(lambda: {"count": 0, "total_ms": 0.0, "errors": 0})

import logging  # noqa: E402

_req_logger = logging.getLogger("http")


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:12])
    token = request_id_var.set(request_id)
    start = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        elapsed = (time.perf_counter() - start) * 1000
        key = f"{request.method} {request.url.path}"
        m = _metrics[key]
        m["count"] += 1
        m["total_ms"] += elapsed
        if status_code >= 500:
            m["errors"] += 1
        log_event(
            _req_logger,
            "request",
            method=request.method,
            path=request.url.path,
            status=status_code,
            ms=round(elapsed, 1),
        )
        request_id_var.reset(token)


app.include_router(auth.router)
app.include_router(recordings.router)
app.include_router(chat.router)


@app.get("/health", tags=["ops"])
def health() -> dict:
    checks = {"db": False, "redis": False}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["db"] = True
    except Exception:  # noqa: BLE001
        pass
    try:
        import redis

        client = redis.from_url(settings.redis_url)
        client.ping()
        checks["redis"] = True
    except Exception:  # noqa: BLE001
        pass
    status = "ok" if all(checks.values()) else "degraded"
    return {"status": status, "checks": checks}


@app.get("/metrics", tags=["ops"])
def metrics() -> dict:
    out = {}
    for key, m in _metrics.items():
        count = m["count"] or 1
        out[key] = {
            "count": m["count"],
            "errors": m["errors"],
            "avg_ms": round(m["total_ms"] / count, 1),
        }
    return out
