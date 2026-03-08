# QuickRag

A full-stack RAG (Retrieval-Augmented Generation) chatbot demo built with React + Express + PostgreSQL + OpenAI.

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express on port 5000, serves API + Vite dev middleware
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: OpenAI GPT-4o-mini via Replit AI Integrations (env vars `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`)
- **Retrieval**: PostgreSQL full-text search (ts_vector/ts_query) with keyword fallback — no vector DB required

## Key Files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Drizzle schema: documents, chunks (with source label), conversations, messages |
| `server/routes.ts` | API routes: documents CRUD, `/api/chat` SSE streaming, `/api/search` |
| `server/storage.ts` | DatabaseStorage implementing IStorage with FTS search |
| `server/rag.ts` | chunkText, retrieveChunks, buildSystemPrompt, streamChat, estimateTokens |
| `server/seed-war-and-peace.ts` | Seed script: downloads full War and Peace from Project Gutenberg, parses 365 chapters, creates ~5,469 overlapping chunks |
| `client/src/store.ts` | Zustand store: documents, messages, pipeline steps, token tracking |
| `client/src/components/chat/ChatPanel.tsx` | Chat with real SSE streaming from `/api/chat` |
| `client/src/components/chat/ControlsPanel.tsx` | Document management, grounding/voice/style selectors |
| `client/src/components/chat/DebugPanel.tsx` | Retrieved chunks display, pipeline trace, token stats |

## Data Model

- **documents**: id, name, content, createdAt
- **chunks**: id, documentId (FK), content, chunkIndex, source (nullable label like "BOOK ONE: 1805 — Ch. I")
- **conversations**: id, title, createdAt
- **messages**: id, conversationId (FK), role, content, chunksUsed, createdAt

## Chunking Strategy

War and Peace is chunked per-chapter with overlapping, equitably-sized chunks:
- ~800 chars per chunk, ~100 char overlap
- Sentence-boundary aware (splits on `.!?;`)
- Each chunk tagged with source label: `"BOOK X — Ch. Y"`
- 365 chapters → 5,469 chunks

## Design

- Cobalt blue `#0048ad` primary accent
- Three-panel layout: Configuration (left), Chat (center), Output (right)
- Collapsible side panels via chevron toggles
- Off-white background, Inter + JetBrains Mono fonts
- Minimal UI — no decorative icons
- Footer: "True North Applied Technologies"
