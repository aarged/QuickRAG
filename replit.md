# QuickRag

A full-stack RAG (Retrieval-Augmented Generation) chatbot demo built with React + Express + PostgreSQL + ChromaDB Cloud + OpenAI.

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express on port 5000, serves API + Vite dev middleware
- **Database**: PostgreSQL via Drizzle ORM (document/chunk storage, metadata)
- **Vector Search**: ChromaDB Cloud via `CloudClient` + OpenAI `text-embedding-3-small` embeddings (Cyntric pattern — pre-computed embeddings, ChromaDB built-in embedding disabled)
- **AI Chat**: OpenAI GPT-4o-mini via Replit AI Integrations (env vars `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`)
- **Embeddings**: OpenAI `text-embedding-3-small` via direct `OPENAI_API_KEY` (not AI Integrations — embeddings API not supported there)
- **Retrieval**: Semantic vector search via ChromaDB Cloud, with PostgreSQL FTS as graceful fallback

## Secrets Required

- `OPENAI_API_KEY` — for embedding generation (text-embedding-3-small)
- `CHROMADB_API_KEY` — ChromaDB Cloud authentication
- `CHROMADB_TENANT` — ChromaDB Cloud tenant
- `CHROMADB_DATABASE` — ChromaDB Cloud database
- AI Integrations provides `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` for GPT-4o-mini chat

## Key Files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Drizzle schema: documents, chunks (with source label), conversations, messages |
| `server/routes.ts` | API routes: documents CRUD, `/api/chat` SSE streaming, `/api/search` |
| `server/storage.ts` | DatabaseStorage implementing IStorage with PostgreSQL FTS fallback |
| `server/rag.ts` | chunkText, retrieveChunks (ChromaDB → FTS fallback), buildSystemPrompt, streamChat, estimateTokens |
| `server/embeddings.ts` | OpenAI text-embedding-3-small: generateEmbedding, generateEmbeddings (batch of 100) |
| `server/chromadb.ts` | ChromaDB CloudClient: indexChunks, semanticSearch, deleteDocumentCollection, getCollectionCount |
| `server/seed-war-and-peace.ts` | Seed script: downloads full War and Peace from Project Gutenberg, parses 365 chapters, creates ~5,469 overlapping chunks in PostgreSQL |
| `server/seed-chromadb.ts` | Seed script: indexes all War and Peace chunks from PostgreSQL into ChromaDB Cloud with OpenAI embeddings |
| `client/src/store.ts` | Zustand store: documents, messages, pipeline steps, token tracking |
| `client/src/components/chat/ChatPanel.tsx` | Chat with real SSE streaming from `/api/chat` |
| `client/src/components/chat/ControlsPanel.tsx` | Document management, grounding/voice/style selectors |
| `client/src/components/chat/DebugPanel.tsx` | Retrieved chunks display, pipeline trace, token stats |

## Data Model

- **documents**: id, name, content, createdAt
- **chunks**: id, documentId (FK), content, chunkIndex, source (nullable label like "BOOK ONE: 1805 — Ch. I")
- **conversations**: id, title, createdAt
- **messages**: id, conversationId (FK), role, content, chunksUsed, createdAt

## ChromaDB Architecture (Cyntric Pattern)

- One collection per document: `quickrag_doc_<documentId>`
- Embeddings pre-computed via OpenAI `text-embedding-3-small` (1536 dimensions)
- ChromaDB's built-in embedding function is NOT used
- L2 distance metric; threshold ≤ 1.8 for relevance; score = 1 - (distance / 1.8)
- Indexing in batches of 50 chunks (embeddings in batches of 100)
- On document upload: chunks indexed async (non-blocking response)
- On document delete: ChromaDB collection deleted

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
