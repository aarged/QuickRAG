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

async function seed() {
  console.log("Checking for existing War and Peace document...");
  const existing = await db.select().from(documents).where(eq(documents.name, DOC_NAME));
  if (existing.length > 0) {
    console.log("War and Peace already seeded (document id:", existing[0].id, "). Skipping.");
    process.exit(0);
  }

  console.log("Downloading War and Peace from Project Gutenberg...");
  const response = await fetch(GUTENBERG_URL);
  if (!response.ok) {
    console.error("Failed to download:", response.status, response.statusText);
    process.exit(1);
  }
  const rawText = await response.text();
  console.log(`Downloaded ${(rawText.length / 1024 / 1024).toFixed(1)} MB of text.`);

  console.log("Parsing chapters...");
  const chapters = parseChapters(rawText);
  console.log(`Found ${chapters.length} chapters.`);

  const startMarker = "*** START OF THE PROJECT GUTENBERG EBOOK WAR AND PEACE ***";
  const endMarker = "*** END OF THE PROJECT GUTENBERG EBOOK WAR AND PEACE ***";
  let startIdx = rawText.indexOf(startMarker);
  if (startIdx === -1) startIdx = 0; else startIdx += startMarker.length;
  let endIdx = rawText.indexOf(endMarker);
  if (endIdx === -1) endIdx = rawText.length;
  const cleanText = rawText.slice(startIdx, endIdx).trim();

  console.log("Creating document record...");
  const [doc] = await db.insert(documents).values({
    name: DOC_NAME,
    content: cleanText,
    isDefault: true,
  }).returning();
  console.log(`Document created with id ${doc.id}.`);

  console.log("Chunking and inserting...");
  let totalChunks = 0;
  const BATCH_SIZE = 200;

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    const chapterChunks = chunkChapterText(chapter.text);

    const values = chapterChunks.map((content, i) => ({
      documentId: doc.id,
      content,
      chunkIndex: totalChunks + i,
      source: chapter.label,
    }));

    for (let b = 0; b < values.length; b += BATCH_SIZE) {
      const batch = values.slice(b, b + BATCH_SIZE);
      await db.insert(chunks).values(batch);
    }

    totalChunks += chapterChunks.length;

    if ((ci + 1) % 50 === 0 || ci === chapters.length - 1) {
      console.log(`  Processed ${ci + 1}/${chapters.length} chapters, ${totalChunks} chunks so far...`);
    }
  }

  console.log(`\nDone! Seeded ${totalChunks} chunks across ${chapters.length} chapters.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
