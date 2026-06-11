---
name: ChromaDB default-embed warnings are harmless with pre-computed embeddings
description: chromadb JS client logs DefaultEmbeddingFunction errors even when you pass embeddings directly — they do not break index/query
---

When using the ChromaDB JS `CloudClient` with the "provide embeddings directly" pattern (no `embeddingFunction` passed to `getOrCreateCollection`), the client floods stderr with:
- "Cannot instantiate a collection with the DefaultEmbeddingFunction. Please install @chroma-core/default-embed..."
- "Collection ... was created with the default-embed embedding function. However, the @chroma-core/default-embed package is not installed. 'add' and 'query' will fail unless you provide them embeddings directly..."

**Why:** Newer chromadb JS versions default a collection's embedding function to `DefaultEmbeddingFunction`, which now lives in the separate `@chroma-core/default-embed` package. The warning fires on every collection instantiation/list/count. But when you supply `embeddings` directly to `upsert`/`query` (as this app does via OpenAI text-embedding-3-small), index and query still succeed — verified end-to-end (upsert 2 chunks → query returned correct top match).

**How to apply:** Treat these messages as noise, not failures, as long as every `upsert`/`query` passes explicit `embeddings`. To silence them, either install `@chroma-core/default-embed` or pass an explicit no-op/custom embeddingFunction to `getOrCreateCollection`. Do NOT assume the integration is broken just because these lines appear in logs.

Related: a wrong/short `CHROMADB_TENANT` (not a 36-char UUID) or a misspelled secret name surfaces as "You do not have permission to access the requested resource" on `listCollections()`. Check tenant is a valid UUID and secret names are exact before assuming the key is bad.
