# Meeting Intelligence System

Upload meeting recordings or transcripts, and ask questions about what was
discussed, what was **decided**, and the **action items** — answered with RAG
(retrieval-augmented generation) grounded in the actual transcript.

> ✍️ **Author note:** Several sections below (esp. *How I used AI tools*, *Key
> decisions*, and *What I'd do differently*) are written as a starting draft.
> Per the brief, these should reflect **your own reasoning** — please edit them
> in your voice before submitting.

---

## a. Quick setup

**Prerequisites:** Docker + Docker Compose, and API keys for Deepgram, Groq, and
OpenAI.

```bash
cp .env.example .env
# edit .env and set:
#   DEEPGRAM_API_KEY, GROQ_API_KEY, OPENAI_API_KEY
#   JWT_SECRET (e.g. `openssl rand -hex 32`)

docker compose up --build
```

- Frontend: <http://localhost:3000>
- Backend API + docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/health> · Metrics: <http://localhost:8000/metrics>

> **Port already in use?** Override the host ports (the browser talks to the
> backend directly, so keep `NEXT_PUBLIC_API_BASE` in sync):
> ```bash
> BACKEND_PORT=8080 FRONTEND_PORT=3001 \
>   NEXT_PUBLIC_API_BASE=http://localhost:8080 docker compose up --build
> ```

Sign up (anyone can), upload a transcript `.txt` or an audio/video file, watch
the row flip from **processing → completed**, then open it to chat and read the
transcript. A ready-to-use sample transcript lives in
[`docs/sample-meeting.txt`](docs/sample-meeting.txt).

**Running tests**

```bash
# Backend (DB-backed tests auto-skip if Postgres isn't reachable)
docker compose exec backend pytest

# Frontend
cd frontend && npm install && npm test
```

---

## b. Architecture overview

See [`docs/architecture.md`](docs/architecture.md) for the full diagram. In short:

- **Next.js** UI → **FastAPI** API (JWT auth).
- Uploads are saved to a Docker volume and processed **asynchronously** by a
  **Celery** worker (Redis broker), so the UI never blocks.
- The worker transcribes (**Deepgram**, diarized) or parses the transcript,
  chunks it, embeds chunks (**OpenAI**), and stores vectors in **Postgres +
  pgvector**, then extracts a summary/decisions/action items (**Groq**).
- Chat retrieves the most relevant chunks for a question and asks **Groq** to
  answer **only** from that context, returning cited timestamps/speakers.

Services: `db` (pgvector), `redis`, `backend`, `worker`, `frontend`.

---

## c. Productionizing, scaling & deploying on a hyperscaler

What this take-home does for simplicity, and what I'd change for production:

| Area | Here (take-home) | Production |
| --- | --- | --- |
| Media storage | Local `./data` volume | **S3/GCS** with presigned **direct-to-bucket** uploads; CDN for playback |
| Vector store | pgvector on the app DB | pgvector on managed Postgres (RDS/Cloud SQL) to start; **dedicated vector DB** (Qdrant / pgvector replica) past ~10⁶ vectors |
| Async jobs | Redis + Celery | Managed Redis / **SQS / Cloud Tasks**; autoscaled worker pool (ECS/Cloud Run/GKE), DLQ + retries with backoff |
| API | Single uvicorn | Stateless containers behind a load balancer, HPA autoscaling |
| Auth | JWT access token in localStorage | Short-lived access + **refresh tokens**, httpOnly cookies, rate limiting, lockout, optional SSO |
| Secrets | `.env` | Secrets Manager / Parameter Store / Vault |
| Observability | JSON logs, `/health`, `/metrics`, persisted retrieval traces | **OpenTelemetry** traces, Prometheus/Grafana, **LangSmith/Langfuse** for LLM traces & evals, alerting |
| Data | Single Postgres | Read replicas, PITR backups, migrations gated in CI/CD |
| Cost | Pay-per-call | Cache embeddings, batch, cap context, route by query class, usage quotas |

Deployment sketch (AWS): S3 (media) + CloudFront, RDS Postgres (pgvector),
ElastiCache Redis, ECS Fargate services for API + workers, ALB, Secrets Manager,
CloudWatch/OTel. Equivalents on GCP (Cloud Run + Cloud SQL + Memorystore + GCS)
or Azure.

---

## d. RAG / LLM approach & decisions

**Goal:** accurate, *grounded* answers about a single meeting, with citations and
low hallucination.

### Models & infra — considered vs chosen

| Choice | Considered | Chosen | Why |
| --- | --- | --- | --- |
| Answer LLM | OpenAI, local Llama, Groq | **Groq `llama-3.3-70b-versatile`** | Very low latency for chat UX; strong enough for grounded summarization/Q&A |
| Embeddings | local `bge-small`, Voyage, OpenAI | **OpenAI `text-embedding-3-small`** (1536-d) | Strong quality-per-cost, no model hosting; isolated behind one module to swap later |
| Vector DB | Qdrant, Chroma, pgvector | **pgvector** | One datastore; per-recording filter is an indexed WHERE; cascade-delete cleanup |
| Orchestration | custom, LlamaIndex, LangChain | **LangChain** | Standard LLM/message/prompt primitives without locking retrieval into a framework |

### Chunking

Meetings are conversational, so fixed-size character splitting cuts mid-sentence
and loses *who said what*. Instead (`backend/app/rag/chunking.py`) I group
consecutive utterances into ~600-token windows with a 1-utterance overlap, never
splitting an utterance, and keep each chunk's **time span + speakers** as
metadata. That metadata becomes the citations shown in the UI.

### Retrieval

Embed the question, run cosine similarity in pgvector (`<=>`) **filtered to the
recording**, take top-k (default 5) above a score threshold. Distance is
converted to a 0–1 similarity for thresholding and display.

### Prompt & context management

A strict system prompt (`rag/prompts.py`) instructs the model to answer **only**
from the provided excerpts, cite timestamps/speakers, and refuse when context is
insufficient. Context is the concatenation of retrieved chunks; extraction is
capped in size to control cost.

### Guardrails

- **Input:** empty/length checks + simple prompt-injection heuristics.
- **Grounding:** if nothing clears the retrieval threshold, we **refuse**
  (`"I couldn't find that in this meeting."`) instead of guessing.
- **Output structure:** intelligence extraction is validated with Pydantic;
  malformed JSON degrades to empty lists rather than crashing.

### Quality controls

- Low temperature for deterministic-ish answers.
- Citations surfaced so users can verify every answer.
- `backend/tests/test_rag.py` asserts grounded-answer behavior, refusal on
  missing context, and injection blocking (LLM + retrieval mocked).

### Observability

Structured JSON logs with request IDs; per-stage timings (transcription,
chunking, embedding, retrieval, generation); every Q&A persists the retrieved
chunk ids + scores in `chat_messages.sources`; `/health` and `/metrics`
endpoints. Production extension: OpenTelemetry + LangSmith/Langfuse.

---

## e. Key technical decisions & why

> ✍️ **Author note:** make these yours — add the trade-offs *you* weighed.

- **Async-by-default uploads.** The API saves the file and returns instantly;
  Celery does the slow work. This matches the brief and keeps the UI responsive.
- **pgvector over a separate vector DB.** At take-home scale, a second datastore
  is operational overhead with no benefit; co-locating vectors with domain rows
  simplifies filtering and cleanup.
- **Unified `Utterance` shape.** Deepgram output and parsed transcripts both
  normalize to the same structure, so chunking/indexing has one code path.
- **Per-recording retrieval scoping.** Every query filters by `recording_id`, so
  answers can't leak across meetings (or users).
- **Thin provider wrappers.** Embeddings/LLM live behind small modules to keep
  swaps (e.g. to local models) cheap.

---

## f. Engineering standards followed (and ones skipped)

**Followed**

- Typed boundaries: Pydantic schemas + SQLAlchemy 2.0 typed models; TS on the FE.
- Clear module structure (`rag/`, `services/`, `routers/`), small focused files.
- Alembic migrations (incl. pgvector extension + ANN index).
- Tests at the layers that matter: parsing, chunking, RAG behavior, auth, upload
  flow, ownership; plus FE unit/component tests.
- Structured logging, health/metrics, ownership checks on every resource.
- Containerized end-to-end with one `docker compose up`.

**Skipped (acknowledged, given time)**

- Refresh tokens / token rotation; tokens live in localStorage.
- Exhaustive edge cases (huge files, exotic transcript formats, concurrent
  re-processing) — see *Limitations*.
- No end-to-end (Playwright) tests; no CI pipeline wired up.
- Single Groq model for all queries (no routing); no embedding cache.

---

## g. How I used AI tools in development

> ✍️ **Author note — please rewrite in your own words; this is the section the
> reviewers most want to be *yours*.** A truthful version covers:
>
> - Which assistant(s) you used and for what (scaffolding, boilerplate, docs vs.
>   the parts you designed/decided yourself).
> - What you **accepted** vs. **rejected or rewrote**, and how you reviewed it.
> - How you keep AI-assisted work **repeatable & maintainable** (small diffs,
>   tests, conventions, reading every line before committing).
> - Your do's and don'ts (e.g. *do* use it for parsers/tests/glue; *don't* trust
>   it for security/auth or architecture without verification).

---

## h. What I'd do differently with more time

> ✍️ **Author note:** trim/expand to match what you actually care about.

- Streaming chat responses + clickable citations that seek the player.
- A small **RAG eval harness** (golden Q/A per meeting, retrieval hit-rate,
  faithfulness scoring) instead of only behavioral unit tests.
- Smarter chunking (semantic / topic segmentation) and a re-ranker.
- Cross-meeting search and an "ask across all my meetings" mode.
- WebSockets for processing status instead of polling.
- Direct-to-S3 uploads, refresh tokens, CI/CD, OTel/Langfuse tracing.

---

## i. Limitations & acknowledged edge cases

- RAG is **per-recording**; no cross-meeting retrieval yet.
- Very long meetings: chunking handles size, but retrieval quality could benefit
  from re-ranking; extraction context is truncated to control cost.
- Status updates use **polling**, not push.
- Token stored in localStorage (XSS exposure) — fine for the assignment, not prod.
- Deepgram language/accent quality varies; speaker labels are generic
  (`Speaker 1…N`), not named.
- The IVFFlat index is tuned for small data; `lists`/`probes` would be tuned at
  scale.

---

## Project layout

```
backend/   FastAPI app, Celery worker, RAG package, services, tests, Alembic
frontend/  Next.js (App Router) UI + components + Vitest tests
docs/       architecture diagram, sample transcript, screenshots
docker-compose.yml   db (pgvector) · redis · backend · worker · frontend
```

## Bonus: voice-to-transcript

The dashboard has a **● Record** button (`MicRecorder`) that captures mic audio
in the browser and uploads it through the same pipeline, where Deepgram
transcribes it. Live streaming transcription is noted as a further stretch.
```
