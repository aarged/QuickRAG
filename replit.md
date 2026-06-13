# QuickRag

A full-stack RAG (Retrieval-Augmented Generation) chatbot demo built with React + Express + PostgreSQL + ChromaDB Cloud + OpenAI.

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express on port 5000, serves API + Vite dev middleware
- **Database**: PostgreSQL via Drizzle ORM (document/chunk storage, metadata, upload rate limiting)
- **Vector Search**: ChromaDB Cloud via `CloudClient` + OpenAI `text-embedding-3-small` embeddings (Cyntric pattern — pre-computed embeddings, ChromaDB built-in embedding disabled)
- **AI Chat**: OpenAI GPT-5-mini via Replit AI Integrations (env vars `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`)
- **Embeddings**: OpenAI `text-embedding-3-small` via direct `OPENAI_API_KEY` (not AI Integrations — embeddings API not supported there)
- **Retrieval**: Semantic vector search via ChromaDB Cloud, with PostgreSQL FTS as graceful fallback

## Secrets Required

- `OPENAI_API_KEY` — for embedding generation (text-embedding-3-small)
- `CHROMADB_API_KEY` — ChromaDB Cloud authentication
- `CHROMADB_TENANT` — ChromaDB Cloud tenant
- `CHROMADB_DATABASE` — ChromaDB Cloud database
- `OWNER_PIN` — owner override PIN for bypassing upload rate limits
- AI Integrations provides `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` for GPT-5-mini chat

## Key Files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Drizzle schema: documents, chunks (with source label), conversations, messages, uploadLog |
| `server/routes.ts` | API routes: PDF upload with rate limiting, `/api/chat` SSE streaming, `/api/search` |
| `server/storage.ts` | DatabaseStorage implementing IStorage with PostgreSQL FTS fallback, upload logging, cleanup |
| `server/rag.ts` | chunkText, retrieveChunks (ChromaDB → FTS fallback), buildSystemPrompt, streamChat, estimateTokens |
| `server/embeddings.ts` | OpenAI text-embedding-3-small: generateEmbedding, generateEmbeddings (batch of 100) |
| `server/chromadb.ts` | ChromaDB CloudClient: indexChunks, semanticSearch, deleteDocumentCollection, getCollectionCount |
| `server/index.ts` | Express setup, session-ephemeral cleanup on startup (deletes non-default docs + ChromaDB collections) |
| `server/seed-war-and-peace.ts` | Seed script: downloads full War and Peace from Project Gutenberg, parses 365 chapters, creates ~5,469 overlapping chunks in PostgreSQL |
| `server/seed-books.ts` | Generic, config-driven Gutenberg seed: a `BOOKS` manifest (url + heading regex + optional content-start regex + label formatter) drives one parser/chunker for the additional default books (Aesop, Andersen, Iliad, Macbeth). Idempotent (skips by name); `DRY_RUN=1`/`VERBOSE=1` preview parsing without DB writes |
| `server/seed-chromadb.ts` | Seed script: indexes every default document's un-indexed chunks from PostgreSQL into ChromaDB Cloud with OpenAI embeddings (idempotent, resumes from collection count) |
| `client/src/store.ts` | Zustand store: documents, messages, pipeline steps, token tracking, document source toggle |
| `client/src/components/chat/ChatPanel.tsx` | Chat with real SSE streaming from `/api/chat` |
| `client/src/components/chat/ControlsPanel.tsx` | Document management, PDF upload, source switching, grounding/voice/style selectors |
| `client/src/components/chat/DebugPanel.tsx` | Retrieved chunks display, pipeline trace, token stats |

## Data Model

- **documents**: id, name, content, isDefault (boolean), createdAt
- **chunks**: id, documentId (FK, cascade delete), content, chunkIndex, source (nullable label like "BOOK ONE: 1805 — Ch. I")
- **conversations**: id, title, createdAt
- **messages**: id, conversationId (FK), role, content, chunksUsed, createdAt
- **upload_log**: id, uploadedAt — tracks uploads for rate limiting

## PDF Upload

- Frontend sends PDF as base64-encoded body to `POST /api/documents`
- Backend uses `pdf-parse` to extract text, then chunks and indexes into ChromaDB
- Express body limit set to 50MB to accommodate PDF uploads
- Rate limited: 1 upload per 24 hours globally
- Owner override: `X-Owner-Pin` header matching `OWNER_PIN` env secret bypasses rate limit
- Upload warning dialog with optional PIN input and "Don't show again" (localStorage)

## Abuse & Cost Protections

Hardening for public/anonymous exposure (e.g. shared on LinkedIn):

- **Per-IP rate limiting** (`server/rateLimit.ts`, via `express-rate-limit`):
  - `/api/chat`: 15/min · `/api/search`: 20/min · `/api/documents` (upload): 5/min · `/api/events`: 60/min
  - Over-limit requests get HTTP 429 with a clear message. `X-Owner-Pin` matching `OWNER_PIN` bypasses all limits.
  - `app.set("trust proxy", 1)` in `server/index.ts` so limits key on the real client IP behind Replit's proxy.
- **Input caps** (`server/routes.ts`, enforced before any OpenAI call): chat message ≤ 4000 chars; history ≤ 20 most-recent turns, each ≤ 4000 chars; search query ≤ 1000 chars; `topK` clamped to 1–10.
- **Body-size scoping** (`server/index.ts`): global JSON limit reduced to 100kb; the 50MB limit applies only to the `/api/documents` upload route.
- **Upload ceiling**: existing 1-per-24h global limit (atomic, in `createDocumentWithSlot`) **plus** a hard cap of 10 concurrent non-default documents (`getNonDefaultDocumentCount`). Tradeoff note: the daily limit is intentionally *global* (simple, strong cost cap) rather than per-IP, so one uploader blocks others for the demo window — acceptable for a demo; switch to a per-IP key if multi-user uploads are needed.
- **Events firehose bounding**: `/api/events` is rate-limited and drops oversized payloads (fields ≤ 512 chars, metadata ≤ 2000) while keeping fire-and-forget 204 behavior. `visitorId` is client-supplied (spoofable) — analytics are indicative, not authoritative.
- **Owner-only data endpoints**: `GET /api/documents/:id/chunks` (raw text dump) now requires `OWNER_PIN`; the app UI never calls it. `DELETE /api/documents/:id` stays open (the UI needs it; docs are ephemeral) but default docs remain undeletable.

### Operational backstops (configure outside code)

- Set a **hard monthly usage limit + alerts** in the OpenAI dashboard — the ultimate spend cap if any in-app limit is bypassed.
- Ensure **`OWNER_PIN` is set** in the deployment environment — the owner upload/rate-limit bypass and `/api/stats` page both depend on it (if unset, no owner bypass exists and `/api/stats` always returns 401).
- Choose deployment type deliberately: **Reserved VM** caps compute cost under attack; **Autoscale** scales up (cost) under a request flood.

## Session-Ephemeral Documents

- User-uploaded documents (isDefault=false) are automatically deleted on server restart
- Both PostgreSQL records and ChromaDB collections are cleaned up
- War and Peace (isDefault=true) persists across restarts

## Source Switching

- Default/User segmented toggle in ControlsPanel
- Switching source shows confirmation dialog if chat has content beyond welcome message
- On confirm: clears chat, switches source, selects first document in that source

## ChromaDB Architecture (Cyntric Pattern)

- One collection per document: `quickrag_doc_<documentId>`
- Embeddings pre-computed via OpenAI `text-embedding-3-small` (1536 dimensions)
- ChromaDB's built-in embedding function is NOT used
- L2 distance metric; threshold ≤ 1.8 for relevance; score = 1 - (distance / 1.8)
- Indexing in batches of 50 chunks (embeddings in batches of 100)
- On document upload: chunks indexed async (non-blocking response)
- On document delete: ChromaDB collection deleted

## Default Library

Five `isDefault=true` knowledge sources ship with the demo (all persist across restarts; all surface in the Source → Default dropdown):

| Document | Gutenberg | Sections | Chunks | Section label example |
|----------|-----------|----------|--------|-----------------------|
| War and Peace — Leo Tolstoy | #2600 | 365 chapters | ~5,469 | `BOOK ONE: 1805 — Ch. I` |
| Aesop's Fables — G. F. Townsend | #21 | 312 fables | 378 | `The Hare and the Tortoise` |
| Hans Christian Andersen's Fairy Tales | #1597 | 18 tales | 475 | `The Emperor's New Clothes` |
| The Iliad — Homer (Samuel Butler) | #2199 | 24 books | 1,352 | `Book I` |
| Macbeth — William Shakespeare | #1533 | 28 scenes | 164 | `ACT I — SCENE I. An open Place` |

War and Peace keeps its dedicated `seed-war-and-peace.ts` (already seeded; left untouched to avoid regressions). The other four are produced by the generic `seed-books.ts` pipeline.

## Chunking Strategy

All books share one chunker: ~800 chars per chunk, ~100 char overlap, sentence-boundary aware (splits on `.!?;`). Each chunk is tagged with a section-source label.

The generic `seed-books.ts` parser:
- Strips Gutenberg `*** START/END OF … ***` markers via a generic regex and normalizes CRLF.
- Detects section headings per-book via a `headingRegex` applied to the **raw** line (leading-whitespace table-of-contents entries are thereby excluded) and requires the heading line to be blank-surrounded.
- Discards text before the first heading (front matter / preface).
- Treats a heading with no body (e.g. `ACT I`) as a **persistent prefix** for the sections that follow (yields `ACT I — SCENE I. …`).
- Falls back to fixed-size blocks labelled `Section N` if fewer than 2 headings are detected.

## Design

- Cobalt blue `#0048ad` primary accent
- Three-panel layout: Configuration (left), Chat (center), Output (right)
- Collapsible side panels via chevron toggles
- Off-white background, Inter + JetBrains Mono fonts
- Minimal UI — no decorative icons
- Footer: "True North Applied Technologies"
