# Architecture

## Component diagram

```
                         ┌──────────────────────────────┐
                         │      Browser (Next.js UI)     │
                         │  login / dashboard / detail   │
                         └───────────────┬──────────────┘
                                         │ HTTPS (JWT bearer)
                                         ▼
                         ┌──────────────────────────────┐
                         │        FastAPI backend        │
                         │  auth · recordings · chat     │
                         │  /health · /metrics           │
                         └───┬───────────┬───────────┬───┘
              save file      │           │ enqueue   │  query
              to volume      │           ▼           │
                    ▼        │   ┌───────────────┐   │
         ┌──────────────┐    │   │  Redis broker │   │
         │ ./data/uploads│    │   └───────┬───────┘   │
         │   (volume)    │    │           │           │
         └──────┬───────┘    │           ▼           │
                │            │   ┌───────────────┐   │
                └───────read─┼──▶│ Celery worker │   │
                             │   │  process_upload│   │
                             │   └───┬───────────┘   │
                             │       │ transcribe/parse
                             │       │ chunk + embed │
                             │       ▼               ▼
                             │   ┌───────────────────────────┐
                             └──▶│  Postgres + pgvector       │
                                 │  users, recordings,        │
                                 │  segments, CHUNKS(vector), │
                                 │  speakers, decisions,      │
                                 │  action_items, messages    │
                                 └───────────────────────────┘

   External APIs used by the worker / chat path:
     • Deepgram  → speech-to-text with diarization (audio/video uploads)
     • OpenAI    → text-embedding-3-small (chunk + query embeddings)
     • Groq      → llama-3.3-70b-versatile (answer generation + extraction)
```

## Upload → answer flow

1. **Upload** (`POST /recordings`): the API streams the file to the `./data/uploads`
   volume, inserts a `recordings` row with `status=uploaded`, returns `201`
   immediately, and enqueues a Celery job. The UI never blocks on processing.
2. **Process** (Celery `process_upload`):
   - `transcript` files → `transcript_parser`; `audio/video` → Deepgram (diarized).
   - Persist ordered `transcript_segments` and aggregate `speakers`.
   - **Chunk** speaker/time-aware windows → **embed** (OpenAI) → store vectors in
     `transcript_chunks` (pgvector).
   - **Extract** summary / decisions / action items via Groq.
   - Mark `status=completed` (or `failed` with an error message).
3. **Poll**: the dashboard polls `GET /recordings` every 3s while anything is
   processing, so rows flip to `completed` without a refresh.
4. **Ask** (`POST /recordings/{id}/chat`): guardrail check → embed question →
   pgvector similarity search filtered to that recording → grounded Groq answer
   with cited timestamps/speakers → persist both turns (with retrieval scores).

## Why these boundaries

- **One datastore (Postgres + pgvector)** keeps relational rows and embeddings
  together; retrieval is a filtered `ORDER BY embedding <=> query` and cleanup is
  a normal cascade delete.
- **Separate worker** isolates slow, bursty transcription/embedding from the API
  request path and lets the two scale independently.
- **Local folder for media** is deliberate for a take-home; the path is stored in
  the DB so swapping to S3/GCS later only touches `storage.py` and the media route.
