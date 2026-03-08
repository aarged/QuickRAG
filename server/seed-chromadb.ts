import { db } from "./db";
import { documents, chunks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { indexChunks, getCollectionCount } from "./chromadb";
import type { ChunkToIndex } from "./chromadb";

async function seed() {
  console.log("Looking for War and Peace document in PostgreSQL...");
  const docs = await db.select().from(documents);
  const warAndPeace = docs.find(d => d.name.includes("War and Peace"));

  if (!warAndPeace) {
    console.error("War and Peace document not found in database. Run seed-war-and-peace.ts first.");
    process.exit(1);
  }

  console.log(`Found document: "${warAndPeace.name}" (id: ${warAndPeace.id})`);

  const existingCount = await getCollectionCount(warAndPeace.id);
  const allChunks = await db.select().from(chunks).where(eq(chunks.documentId, warAndPeace.id)).orderBy(chunks.chunkIndex);
  console.log(`PostgreSQL has ${allChunks.length} chunks.`);
  console.log(`ChromaDB collection has ${existingCount} items.`);

  if (existingCount >= allChunks.length) {
    console.log("ChromaDB already has all chunks indexed. Skipping.");
    process.exit(0);
  }

  let chunksToIndex: ChunkToIndex[];

  if (existingCount > 0) {
    console.log(`ChromaDB has partial data (${existingCount}/${allChunks.length}). Resuming from chunk ${existingCount}...`);
    chunksToIndex = allChunks.slice(existingCount).map(c => ({
      id: c.id,
      content: c.content,
      chunkIndex: c.chunkIndex,
      source: c.source || `Chunk ${c.chunkIndex + 1}`,
    }));
  } else {
    chunksToIndex = allChunks.map(c => ({
      id: c.id,
      content: c.content,
      chunkIndex: c.chunkIndex,
      source: c.source || `Chunk ${c.chunkIndex + 1}`,
    }));
  }

  console.log(`Indexing ${chunksToIndex.length} remaining chunks into ChromaDB Cloud...`);
  console.log("(This will generate OpenAI embeddings in batches — may take several minutes)");

  const startTime = Date.now();

  const indexed = await indexChunks(warAndPeace.id, chunksToIndex, (done, total) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (done / parseFloat(elapsed || "1")).toFixed(1);
    console.log(`  ${done}/${total} chunks indexed (${elapsed}s elapsed, ~${rate} chunks/sec)`);
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Indexed ${indexed} chunks in ${totalTime}s.`);

  const finalCount = await getCollectionCount(warAndPeace.id);
  console.log(`ChromaDB collection now has ${finalCount} items.`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("ChromaDB seed failed:", err);
  process.exit(1);
});
