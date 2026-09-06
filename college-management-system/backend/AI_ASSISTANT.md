# Askbook AI Assistant

A production, server-side AI Assistant built into the existing Askbook college
management system. It uses Google Gemini for generation + embeddings, PostgreSQL
`pgvector` for retrieval-augmented generation (RAG), controlled tool/function
calling over the existing services, role-based authorization, conversation
memory, and strict anti-hallucination + read-only rules.

It is **not** a generic chatbot: it answers using Askbook's real data and
documents, scoped to what each authenticated user is allowed to see.

> **Security first:** the `GEMINI_API_KEY` is read only on the server
> (`config/env.js`), sent to Gemini via a request header, and **never** exposed
> to the frontend, browser JavaScript, HTML, localStorage, logs, or API
> responses. Do not paste a real key into this document or any committed file.

---

## 1. Architecture

```
Frontend chat UI (js/common/aiAssistant.js)
  -> POST /api/ai/chat            (Firebase auth; userId/role NEVER from body)
    -> aiOrchestrator             (loads user ctx + memory, grounded prompt)
      -> geminiService            (Gemini generate / tool-calling / embeddings)
        -> aiToolRegistry         (7 READ-ONLY tools; authz via existing services)
        -> ragService             (permission-filtered vector retrieval)
          -> aiRepository         (pgvector KNN + conversation memory; SQL only)
          -> PostgreSQL (pgvector)
    <- grounded answer + source references
  <- rendered answer + "Sources" links
```

**Files added**

| File | Purpose |
|------|---------|
| `src/services/geminiService.js` | The only place we call Gemini (REST over native `fetch`). generate / generateWithTools / embed / embedBatch, with timeout, retry, error mapping. |
| `src/services/aiToolRegistry.js` | 7 read-only tools + Gemini function declarations. Delegates authorization to existing services. |
| `src/services/ragService.js` | Permission-scoped retrieval: embeds the query, resolves the caller's access scope, returns chunks + sources. |
| `src/services/embeddingService.js` | Text extraction (PDF/DOCX/TXT), normalization, chunking, hashing, batch embedding. |
| `src/services/documentIngestService.js` | Ingestion pipeline: download -> extract -> chunk -> embed -> upsert. Fails loudly. |
| `src/services/aiOrchestrator.js` | The brain: context, grounded prompt, tool-calling loop, sources, conversation memory. |
| `src/repositories/aiRepository.js` | Data-access for conversations, messages, and the vector index (parameterized SQL only). |
| `src/routes/ai.routes.js` | `POST /api/ai/chat`, `GET /api/ai/conversations`, admin `POST /api/ai/ingest`. |
| `migrations/010_ai_assistant.sql` | pgvector extension + `ai_conversations`, `ai_messages`, `ai_document_chunks`. |

**Files modified**

- `src/config/env.js` — added the `env.ai` config group.
- `src/routes/index.js` — mounted the AI router.
- `src/services/storageService.js` — added `downloadBuffer()` for server-side bytes.
- `package.json` — added `pdf-parse` and `mammoth`.
- Frontend: `js/services/aiService.js` (calls the backend), `js/common/aiAssistant.js` (renders sources + threads conversation), `css/features.css` (source styles).

---

## 2. Environment variables

Add these to `backend/.env` (see `backend/.env.example` for the documented
template). Only `GEMINI_API_KEY` is required to enable the assistant.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes (to enable) | *(empty)* | Google Gemini API key. **Secret.** Empty ⇒ assistant is cleanly disabled and endpoints return a friendly "not configured" message. Get one at https://aistudio.google.com/app/apikey |
| `GEMINI_MODEL` | No | `gemini-1.5-flash` | Generative/chat/tool-calling model. |
| `GEMINI_EMBEDDING_MODEL` | No | `text-embedding-004` | Embedding model for RAG. |
| `GEMINI_EMBEDDING_DIM` | No | `768` | Vector dimension. **Must match the embedding model** and the `vector(N)` column in migration 010 (`text-embedding-004` = 768). |
| `GEMINI_API_BASE_URL` | No | `https://generativelanguage.googleapis.com/v1beta` | Gemini REST base (bump the API version here). |
| `GEMINI_TIMEOUT_MS` | No | `30000` | Per-request timeout. |
| `GEMINI_MAX_RETRIES` | No | `2` | Retries on transient 429/5xx. |
| `AI_MAX_TOOL_TURNS` | No | `4` | Max Gemini tool-calling round-trips per question (cost guard). |
| `AI_HISTORY_TURNS` | No | `8` | How many prior messages are sent as conversation memory. |
| `AI_RAG_TOP_K` | No | `6` | Max document chunks retrieved per RAG query. |

RAG also relies on the **existing** Firebase Storage config
(`FIREBASE_STORAGE_BUCKET`) for server-side document downloads during ingestion.

---

## 3. pgvector setup (deployment prerequisite)

The RAG index uses the PostgreSQL `pgvector` extension. It must be **installed on
the database server** before migration 010 runs.

**Install pgvector** (once, on the DB server):

- Debian/Ubuntu: `sudo apt install postgresql-16-pgvector` (match your PG major version)
- Or build from source: https://github.com/pgvector/pgvector
- Managed providers (RDS/Cloud SQL/Supabase/Neon) usually offer it — enable it in the console.

Migration 010 runs `CREATE EXTENSION IF NOT EXISTS vector;`. This needs a role
with privilege to create the extension (superuser, or a role granted it). If the
extension is not present on the server, the migration fails cleanly and rolls
back — **no other migration or existing data is affected**. Install pgvector,
then re-run migrations.

---

## 4. Database migration

Migration `010_ai_assistant.sql` is additive and idempotent. Run it with the
existing runner:

```bash
cd backend
npm run migrate          # apply pending migrations
npm run migrate:status   # list applied/pending
```

Tables created:

- **`ai_conversations`** — one chat thread per row, owned by a user (`user_id`).
- **`ai_messages`** — user/assistant turns (`role`, `content`, `sources` JSONB, `metadata` JSONB). Conversation memory.
- **`ai_document_chunks`** — the RAG index: `chunk_text`, `embedding vector(768)`, `content_hash`, plus permission metadata (`source_type`, `source_id`, `file_id`, `class_id`, `program`, `branch`, `semester`, `access_scope`). Unique on `(source_type, source_id, chunk_index)` for idempotent re-ingestion; `ivfflat` cosine index on `embedding`.

---

## 5. Document ingestion (RAG index build)

Ingestion is **admin-triggered** (not automatic on upload in this read-only
phase) so it stays explicit and observable. It reads existing class content
(notes / question papers / assignments / projects) that have a **stored file**,
extracts text, chunks, embeds, and writes the chunks with scope metadata.

**Endpoint:** `POST /api/ai/ingest` (admin only). Examples:

```jsonc
// Ingest ALL supported types (notes, question_papers, assignments, projects)
{}

// Ingest one type, optionally limited to a class
{ "sourceType": "question_paper", "classId": 12 }

// Ingest a single document
{ "sourceType": "note", "sourceId": 45 }
```

Response is a per-source report — each item is `indexed`, `skipped`, or `failed`
with a reason. **Nothing is faked:** an un-extractable or failed document is
reported as such, never marked indexed.

Supported extraction: `text/plain` (built-in), `application/pdf` (`pdf-parse`),
`.docx` (`mammoth`). Images/videos/`.doc`/`.ppt` are skipped with a reason
(not text-extractable here). Re-ingesting the same document replaces its chunks
(dedup by `content_hash` / unique chunk key), so embeddings are never duplicated.

**Re-indexing after changing the embedding model:** a `vector(N)` column's
dimension is fixed at DDL time. If you switch to a model with a different
dimension, add a **new** migration that alters the column type, update
`GEMINI_EMBEDDING_DIM`, then re-run `POST /api/ai/ingest`.

---

## 6. AI tools (read-only)

All identity is taken from the authenticated DB user — **no tool accepts a user
id**, so a user cannot fetch another user's data. Each tool delegates to an
existing service that already enforces authorization.

| Tool | What it returns | Authorization |
|------|-----------------|---------------|
| `get_my_profile` | The caller's own profile | Keyed by the caller's Firebase UID |
| `get_my_classes` | Classes the caller is in | Student group / faculty ownership |
| `get_my_question_papers` | Question papers available to the caller (filter by subject/year/semester) | `portalService` scoping |
| `search_announcements` | Announcements visible to the caller | Student targeted+published / faculty own |
| `search_events` | Active college events (global) | Any authenticated user |
| `get_class_content` | Notes/QPs/assignments/projects for a class | `classService.getClassForUser` gate |
| `search_college_documents` | Semantic RAG over document text + sources | Permission-filtered in SQL before return |

There is **no raw-SQL tool** and no action (write) tool. Attendance/marks are
**not** available because Askbook does not store them — the assistant says so
rather than inventing data.

---

## 7. Permission model

Authorization is enforced **server-side in code**, never by the prompt:

- **Tools** call existing services (`classService`, `portalService`,
  `announcementService`, etc.) that re-check role + ownership + academic group.
- **RAG retrieval** filters chunks in SQL *before* any content reaches the model:
  - **Admin** — all chunks.
  - **Faculty** — `public` chunks OR chunks from classes they own.
  - **Student** — `public` chunks OR class chunks whose `program+branch+semester`
    equals the student's own group.
- **Conversations** are owned by `user_id`; a conversation id that isn't the
  caller's is ignored (a fresh thread starts) — no cross-user leakage.

The Gemini system prompt adds a second, defense-in-depth layer (anti-hallucination
+ read-only), but it is never the only control.

---

## 8. Conversation memory

- Each thread is an `ai_conversations` row; turns are `ai_messages`.
- The orchestrator sends only the last `AI_HISTORY_TURNS` (default 8) messages to
  Gemini — bounded to control cost/latency (not unlimited history).
- The frontend passes the returned `conversationId` back on the next question, so
  follow-ups ("which questions are repeated?", "solve question 3") keep context.

---

## 9. API endpoints

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | `/api/ai/chat` | Firebase | `{ message, conversationId? }` | `{ success, answer, sources[], conversationId, toolsUsed[], degraded }` |
| GET | `/api/ai/conversations` | Firebase | `?limit=` | `{ success, conversations[] }` |
| POST | `/api/ai/ingest` | Firebase + **admin** | see §5 | `{ success, result }` or `{ success, summary, results }` |

Errors follow the app convention: `{ success:false, message, code }`. No API
keys, DB details, stack traces, or raw tool output are returned to clients.

---

## 10. Frontend usage

The existing AI Assistant page (`{admin,faculty,student}/assistant.html`) renders
`renderAssistant()` from `js/common/aiAssistant.js`, which now calls the real
backend via `js/services/aiService.js`. Assistant answers show a **Sources**
block with real in-app links:

- Documents with a file → `GET /api/files/:id/download` (backend authorizes and
  302-redirects to a short-lived signed URL).
- Class-scoped items → the role's class detail page.

The frontend never sees Gemini or the API key; it only talks to the Askbook
backend. The UI is mobile-responsive (existing breakpoints) and degrades
gracefully when the assistant is disabled.

---

## 11. Deployment checklist

1. Install `pgvector` on the PostgreSQL server (see §3).
2. `cd backend && npm install` (installs `pdf-parse`, `mammoth`).
3. Set `GEMINI_API_KEY` (and any overrides) in `backend/.env`.
4. Ensure `FIREBASE_STORAGE_BUCKET` is set (needed for ingestion downloads).
5. `npm run migrate` to apply migration 010.
6. Restart the backend (e.g. `pm2 restart college-cms-backend`).
7. As an admin, call `POST /api/ai/ingest` to build the RAG index.

---

## 12. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Chat returns "AI Assistant is not enabled" | `GEMINI_API_KEY` is empty. Set it and restart. |
| `AI_AUTH_ERROR` in logs | Invalid/expired Gemini key. Rotate it. |
| Migration 010 fails on `CREATE EXTENSION vector` | pgvector not installed / insufficient privilege. Install it, use a privileged role, re-run. |
| RAG returns nothing / "document index is not available" | Migration not applied, or no documents ingested yet. Run migrate + `POST /api/ai/ingest`. |
| Ingestion reports `failed: ... requires "pdf-parse"/"mammoth"` | Optional dep missing. `npm install` in `backend`. |
| Ingestion reports `skipped: file type not text-extractable` | Image/video/`.doc`/`.ppt` — expected; only PDF/DOCX/TXT are extracted. |
| Answers are slow / time out | Lower `AI_MAX_TOOL_TURNS` / `AI_RAG_TOP_K`, raise `GEMINI_TIMEOUT_MS`, or use a faster model. |
| Follow-up questions lose context | Ensure the frontend sends back `conversationId` (it does by default). |

> Never log or commit the real `GEMINI_API_KEY`. Keep it only in `backend/.env`.
