import { db } from "./db";
import { documents, chunks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { indexChunks, getCollectionCount } from "./chromadb";
import type { ChunkToIndex } from "./chromadb";

async function indexDocument(docId: number, docName: string): Promise<void> {
  const existingCount = await getCollectionCount(docId);
  const allChunks = await db
    .select()
    .from(chunks)
    .where(eq(chunks.documentId, docId))
    .orderBy(chunks.chunkIndex);

  console.log(`\n"${docName}" (id ${docId}): PostgreSQL ${allChunks.length} chunks, ChromaDB ${existingCount} items.`);

  if (allChunks.length === 0) {
    console.log("  No chunks to index. Skipping.");
    return;
  }

  if (existingCount >= allChunks.length) {
    console.log("  Already fully indexed. Skipping.");
    return;
  }

  const remaining = existingCount > 0 ? allChunks.slice(existingCount) : allChunks;
  if (existingCount > 0) {
    console.log(`  Partial data (${existingCount}/${allChunks.length}). Resuming from chunk ${existingCount}...`);
  }

  const chunksToIndex: ChunkToIndex[] = remaining.map((c) => ({
    id: c.id,
    content: c.content,
    chunkIndex: c.chunkIndex,
    source: c.source || `Chunk ${c.chunkIndex + 1}`,
  }));

  console.log(`  Indexing ${chunksToIndex.length} chunks into ChromaDB Cloud (generating OpenAI embeddings)...`);
  const startTime = Date.now();

  const indexed = await indexChunks(docId, chunksToIndex, (done, total) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (done / parseFloat(elapsed || "1")).toFixed(1);
    console.log(`    ${done}/${total} chunks indexed (${elapsed}s elapsed, ~${rate} chunks/sec)`);
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const finalCount = await getCollectionCount(docId);
  console.log(`  Done: indexed ${indexed} chunks in ${totalTime}s. Collection now has ${finalCount} items.`);
}

async function seed() {
  console.log("Indexing default documents into ChromaDB Cloud...");
  const docs = await db.select().from(documents).where(eq(documents.isDefault, true));

  if (docs.length === 0) {
    console.error("No default documents found. Run seed-war-and-peace.ts / seed-books.ts first.");
    process.exit(1);
  }

  for (const doc of docs) {
    try {
      await indexDocument(doc.id, doc.name);
    } catch (err) {
      console.error(`Failed to index "${doc.name}" (id ${doc.id}):`, err);
      process.exitCode = 1;
    }
  }

  console.log("\nAll default documents processed.");
  process.exit(process.exitCode ?? 0);
}

seed().catch((err) => {
  console.error("ChromaDB seed failed:", err);
  process.exit(1);
});
