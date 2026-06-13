import { db } from "./db";
import { documents, chunks } from "@shared/schema";
import { eq } from "drizzle-orm";

const GUTENBERG_URL = "https://www.gutenberg.org/cache/epub/2600/pg2600.txt";
const DOC_NAME = "War and Peace — Leo Tolstoy";
const CHUNK_SIZE = 800;
const OVERLAP = 100;

function chunkChapterText(text: string): string[] {
  const sentences = text.split(/(?<=[.!?;])\s+/);
  const result: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > CHUNK_SIZE && current.length > 0) {
      result.push(current.trim());
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(OVERLAP / 5));
      current = overlapWords.join(" ") + " " + sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

interface Chapter {
  book: string;
  chapter: string;
  label: string;
  text: string;
}

function parseChapters(rawText: string): Chapter[] {
  const startMarker = "*** START OF THE PROJECT GUTENBERG EBOOK WAR AND PEACE ***";
  const endMarker = "*** END OF THE PROJECT GUTENBERG EBOOK WAR AND PEACE ***";

  let startIdx = rawText.indexOf(startMarker);
  if (startIdx === -1) startIdx = 0;
  else startIdx += startMarker.length;

  let endIdx = rawText.indexOf(endMarker);
  if (endIdx === -1) endIdx = rawText.length;

  let bodyText = rawText.slice(startIdx, endIdx).trim();

  const bookPattern = /^(BOOK\s+\w+:.*|FIRST EPILOGUE:.*|SECOND EPILOGUE.*)$/m;
  const firstBookMatch = bodyText.match(bookPattern);
  if (firstBookMatch && firstBookMatch.index !== undefined) {
    bodyText = bodyText.slice(firstBookMatch.index);
  }

  const lines = bodyText.split("\n");
  const chapters: Chapter[] = [];
  let currentBook = "";
  let currentChapter = "";
  let currentLabel = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const bookMatch = trimmed.match(/^(BOOK\s+\w+:.*|FIRST EPILOGUE:.*|SECOND EPILOGUE.*)$/);
    if (bookMatch) {
      currentBook = bookMatch[1].replace(/\s+/g, " ").trim();
      continue;
    }

    const chapterMatch = trimmed.match(/^CHAPTER\s+([IVXLCDM]+|[0-9]+)\s*$/);
    if (chapterMatch) {
      if (currentLabel && currentLines.length > 0) {
        chapters.push({
          book: currentBook,
          chapter: currentChapter,
          label: currentLabel,
          text: currentLines.join("\n").trim(),
        });
      }
      currentChapter = `Ch. ${chapterMatch[1]}`;
      currentLabel = `${currentBook} — ${currentChapter}`;
      currentLines = [];
      continue;
    }

    if (currentLabel) {
      currentLines.push(line);
    }
  }

  if (currentLabel && currentLines.length > 0) {
    chapters.push({
      book: currentBook,
      chapter: currentChapter,
      label: currentLabel,
      text: currentLines.join("\n").trim(),
    });
  }

  return chapters;
}

// Idempotent (skip-by-name). Throws on failure so callers can record it.
// Kept as its own function — and not folded into the generic seed-defaults BOOKS
// manifest — so War and Peace's exact chapter parsing, labels, and chunk counts
// are preserved. Called by the startup bootstrap so a fresh/production database
// reliably gets all default books, not just the generically-parsed ones.
export async function seedWarAndPeace(): Promise<void> {
  console.log("[seed-wap] checking for existing War and Peace document...");
  const existing = await db.select().from(documents).where(eq(documents.name, DOC_NAME));
  if (existing.length > 0) {
    console.log(`[seed-wap] already seeded (document id ${existing[0].id}). Skipping.`);
    return;
  }

  console.log("[seed-wap] downloading War and Peace from Project Gutenberg...");
  const response = await fetch(GUTENBERG_URL);
  if (!response.ok) {
    throw new Error(`Failed to download War and Peace: ${response.status} ${response.statusText}`);
  }
  const rawText = await response.text();
  console.log(`[seed-wap] downloaded ${(rawText.length / 1024 / 1024).toFixed(1)} MB of text.`);

  console.log("[seed-wap] parsing chapters...");
  const chapters = parseChapters(rawText);
  console.log(`[seed-wap] found ${chapters.length} chapters.`);

  const startMarker = "*** START OF THE PROJECT GUTENBERG EBOOK WAR AND PEACE ***";
  const endMarker = "*** END OF THE PROJECT GUTENBERG EBOOK WAR AND PEACE ***";
  let startIdx = rawText.indexOf(startMarker);
  if (startIdx === -1) startIdx = 0; else startIdx += startMarker.length;
  let endIdx = rawText.indexOf(endMarker);
  if (endIdx === -1) endIdx = rawText.length;
  const cleanText = rawText.slice(startIdx, endIdx).trim();

  // Build all chunk rows first, then write document + chunks in a single transaction
  // so a mid-run failure rolls back cleanly and the skip-by-name guard stays correct.
  let totalChunks = 0;
  const BATCH_SIZE = 200;
  const allValues: Array<{ content: string; chunkIndex: number; source: string }> = [];
  for (const chapter of chapters) {
    const chapterChunks = chunkChapterText(chapter.text);
    chapterChunks.forEach((content, i) => {
      allValues.push({ content, chunkIndex: totalChunks + i, source: chapter.label });
    });
    totalChunks += chapterChunks.length;
  }

  const docId = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({ name: DOC_NAME, content: cleanText, isDefault: true })
      .returning();
    for (let b = 0; b < allValues.length; b += BATCH_SIZE) {
      const batch = allValues.slice(b, b + BATCH_SIZE).map((v) => ({ documentId: doc.id, ...v }));
      await tx.insert(chunks).values(batch);
    }
    return doc.id;
  });

  console.log(`[seed-wap] done: document id ${docId}, ${totalChunks} chunks across ${chapters.length} chapters.`);
}

// CLI entrypoint: only runs when this file is executed directly (tsx server/seed-war-and-peace.ts),
// not when imported by the startup bootstrap.
async function cli() {
  await seedWarAndPeace();
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("seed-war-and-peace.ts")) {
  cli().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
