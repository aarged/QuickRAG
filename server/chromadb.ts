import { CloudClient } from "chromadb";
import { generateEmbedding, generateEmbeddings } from "./embeddings";

let client: CloudClient | null = null;

function getClient(): CloudClient {
  if (!client) {
    client = new CloudClient({
      apiKey: process.env.CHROMADB_API_KEY!,
      tenant: process.env.CHROMADB_TENANT!,
      database: process.env.CHROMADB_DATABASE!,
    });
  }
  return client;
}

function collectionName(documentId: number): string {
  return `quickrag_doc_${documentId}`;
}

export async function getCollection(documentId: number) {
  const chroma = getClient();
  return chroma.getOrCreateCollection({
    name: collectionName(documentId),
    metadata: { "hnsw:space": "l2" },
  });
}

export interface ChunkToIndex {
  id: number;
  content: string;
  chunkIndex: number;
  source: string;
}

const INDEX_BATCH_SIZE = 50;

export async function indexChunks(
  documentId: number,
  chunks: ChunkToIndex[],
  onProgress?: (indexed: number, total: number) => void
): Promise<number> {
  const collection = await getCollection(documentId);

  let indexed = 0;
  for (let i = 0; i < chunks.length; i += INDEX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + INDEX_BATCH_SIZE);
    const texts = batch.map(c => c.content);
    const embeddings = await generateEmbeddings(texts);

    const ids = batch.map(c => `chunk_${c.id}`);
    const metadatas = batch.map(c => ({
      document_id: documentId,
      chunk_index: c.chunkIndex,
      source: c.source || "",
    }));

    await collection.upsert({
      ids,
      embeddings,
      documents: texts,
      metadatas,
    });

    indexed += batch.length;
    if (onProgress) onProgress(indexed, chunks.length);

    if (i + INDEX_BATCH_SIZE < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return indexed;
}

export interface SemanticResult {
  id: number;
  content: string;
  chunkIndex: number;
  source: string;
  score: number;
  distance: number;
}

export async function semanticSearch(
  documentId: number,
  query: string,
  topK: number = 5
): Promise<SemanticResult[]> {
  const collection = await getCollection(documentId);
  const queryEmbedding = await generateEmbedding(query);

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
  });

  if (!results.ids[0] || results.ids[0].length === 0) {
    return [];
  }

  const maxDistance = 1.8;

  return results.ids[0]
    .map((id, i) => {
      const distance = results.distances?.[0]?.[i] ?? 999;
      const score = Math.max(0, Math.min(1, 1 - distance / maxDistance));
      const chunkIdNum = parseInt(id.replace("chunk_", ""), 10);
      const metadata = results.metadatas?.[0]?.[i] as Record<string, any> | undefined;

      return {
        id: chunkIdNum,
        content: results.documents?.[0]?.[i] || "",
        chunkIndex: metadata?.chunk_index ?? 0,
        source: metadata?.source ?? "",
        score,
        distance,
      };
    })
    .filter(r => r.distance <= maxDistance);
}

export async function deleteDocumentCollection(documentId: number): Promise<void> {
  const chroma = getClient();
  try {
    await chroma.deleteCollection({ name: collectionName(documentId) });
  } catch (err: any) {
    if (err?.message?.includes("does not exist")) return;
    throw err;
  }
}

export async function getCollectionCount(documentId: number): Promise<number> {
  try {
    const collection = await getCollection(documentId);
    return await collection.count();
  } catch {
    return 0;
  }
}
