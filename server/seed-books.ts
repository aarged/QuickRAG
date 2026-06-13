import { db } from "./db";
import { documents, chunks } from "@shared/schema";
import { eq } from "drizzle-orm";

const CHUNK_SIZE = 800;
const OVERLAP = 100;
const INSERT_BATCH = 200;

interface BookSource {
  name: string;
  url: string;
  // Lines (raw, not trimmed) fully matching this become section headings.
  // Applied to the raw line so leading-whitespace table-of-contents entries are excluded.
  headingRegex: RegExp;
  // Optional: skip everything before the first line matching this (skips front matter / TOC).
  contentStartRegex?: RegExp;
  // Optional: turn a raw heading line into a clean display label.
  formatLabel?: (raw: string) => string;
}

const BOOKS: BookSource[] = [
  {
    name: "Aesop's Fables — translated by George Fyler Townsend",
    url: "https://www.gutenberg.org/cache/epub/21/pg21.txt",
    // Flush-left, Title-Case fable titles: require a lowercase letter (excludes ALL-CAPS
    // front matter like CONTENTS/PREFACE) and no terminal period (excludes morals & prose).
    headingRegex: /^(?=.*[a-z])[A-Z][A-Za-z'’,.\-& ]{2,57}[A-Za-z'’)]\s*$/,
  },
  {
    name: "Hans Christian Andersen's Fairy Tales",
    url: "https://www.gutenberg.org/cache/epub/1597/pg1597.txt",
    // Flush-left ALL-CAPS tale titles (TOC entries are indented, so excluded).
    headingRegex: /^[A-Z][A-Z0-9'’.,;:!?\-& ]{3,}\s*$/,
    contentStartRegex: /^THE EMPEROR'?’?S NEW CLOTHES\s*$/m,
    formatLabel: toTitleCase,
  },
  {
    name: "The Iliad — Homer, translated by Samuel Butler",
    url: "https://www.gutenberg.org/cache/epub/2199/pg2199.txt",
    headingRegex: /^BOOK\s+[IVXLCDM]+\.?\s*$/,
    formatLabel: (raw) => {
      const m = raw.trim().match(/^BOOK\s+([IVXLCDM]+)/);
      return m ? `Book ${m[1]}` : raw.trim();
    },
  },
  {
    name: "Macbeth — William Shakespeare",
    url: "https://www.gutenberg.org/cache/epub/1533/pg1533.txt",
    // ACT lines carry no body and become a persistent prefix for the SCENE sections that follow.
    headingRegex: /^(ACT\s+[IVXLCDM]+|SCENE\s+[IVXLCDM]+\..*)$/,
    contentStartRegex: /^Dramatis Person/m,
    formatLabel: (raw) => raw.trim().replace(/\s+/g, " ").replace(/\.$/, ""),
  },
];

function toTitleCase(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ").replace(/\.$/, "");
  const small = new Set(["a", "an", "and", "the", "of", "in", "on", "to", "for", "or", "but", "nor", "by", "with"]);
  return cleaned
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (i > 0 && small.has(word)) return word;
      return word.replace(/^([a-z])/, (c) => c.toUpperCase());
    })
    .join(" ");
}

function defaultLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(/\.$/, "");
}

function stripGutenberg(raw: string): string {
  const norm = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const startRe = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
  const endRe = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;

  let body = norm;
  const sm = norm.match(startRe);
  if (sm && sm.index !== undefined) body = norm.slice(sm.index + sm[0].length);

  const em = body.match(endRe);
  if (em && em.index !== undefined) body = body.slice(0, em.index);

  return body.trim();
}

interface Section {
  label: string;
  text: string;
}

function parseSections(body: string, book: BookSource): Section[] {
  let working = body;
  if (book.contentStartRegex) {
    const m = working.match(book.contentStartRegex);
    if (m && m.index !== undefined) working = working.slice(m.index);
  }

  const lines = working.split("\n");
  const format = book.formatLabel ?? defaultLabel;

  const isHeading = (i: number): boolean => {
    const line = lines[i];
    if (!book.headingRegex.test(line)) return false;
    const prevBlank = i === 0 || lines[i - 1].trim() === "";
    const nextBlank = i === lines.length - 1 || lines[i + 1].trim() === "";
    return prevBlank && nextBlank;
  };

  const raw: Section[] = [];
  let curLabel: string | null = null;
  let curLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (isHeading(i)) {
      if (curLabel !== null) {
        raw.push({ label: curLabel, text: curLines.join("\n").trim() });
      }
      curLabel = format(lines[i]);
      curLines = [];
    } else if (curLabel !== null) {
      curLines.push(lines[i]);
    }
  }
  if (curLabel !== null) {
    raw.push({ label: curLabel, text: curLines.join("\n").trim() });
  }

  // Headings with no body (e.g. "ACT I" before its scenes) become a persistent
  // prefix applied to the following sections until the next empty heading replaces it.
  const sections: Section[] = [];
  let prefix = "";
  for (const s of raw) {
    if (s.text.length === 0) {
      prefix = s.label;
      continue;
    }
    sections.push({
      label: prefix ? `${prefix} — ${s.label}` : s.label,
      text: s.text,
    });
  }

  // Fallback: if heading detection found too little structure, split into fixed-size blocks.
  if (sections.length < 2) {
    return fixedSections(working.trim());
  }

  return sections;
}

function fixedSections(body: string): Section[] {
  const BLOCK = 6000;
  const result: Section[] = [];
  let idx = 0;
  for (let i = 0; i < body.length; i += BLOCK) {
    idx += 1;
    result.push({ label: `Section ${idx}`, text: body.slice(i, i + BLOCK).trim() });
  }
  return result;
}

function chunkText(text: string): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?;])\s+/);
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

async function seedBook(book: BookSource): Promise<void> {
  const existing = await db.select().from(documents).where(eq(documents.name, book.name));
  if (existing.length > 0) {
    console.log(`[skip] "${book.name}" already seeded (doc id ${existing[0].id}).`);
    return;
  }

  console.log(`\nDownloading "${book.name}" from ${book.url} ...`);
  const response = await fetch(book.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${book.name}: ${response.status} ${response.statusText}`);
  }
  const rawText = await response.text();
  const body = stripGutenberg(rawText);
  console.log(`  Downloaded ${(rawText.length / 1024).toFixed(0)} KB, body ${(body.length / 1024).toFixed(0)} KB.`);

  const sections = parseSections(body, book);
  console.log(`  Parsed ${sections.length} sections. Sample labels: ${sections.slice(0, 3).map((s) => s.label).join(" | ")}`);

  if (process.env.DRY_RUN) {
    let totalChunks = 0;
    for (const s of sections) totalChunks += chunkText(s.text).length;
    console.log(`  [dry-run] would create ${totalChunks} chunks. Skipping DB write.`);
    if (process.env.VERBOSE) {
      sections.forEach((s, i) => console.log(`    ${i + 1}. ${s.label} (${s.text.length} chars)`));
    }
    return;
  }

  // Build all chunk rows first, then write document + chunks in a single transaction
  // so a mid-run failure rolls back cleanly (the skip-by-name guard stays correct —
  // a document row only ever exists with its full chunk set).
  let totalChunks = 0;
  const allValues: Array<{ content: string; chunkIndex: number; source: string }> = [];
  for (const section of sections) {
    const sectionChunks = chunkText(section.text);
    sectionChunks.forEach((content, i) => {
      allValues.push({ content, chunkIndex: totalChunks + i, source: section.label });
    });
    totalChunks += sectionChunks.length;
  }

  const docId = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({ name: book.name, content: body, isDefault: true })
      .returning();
    for (let b = 0; b < allValues.length; b += INSERT_BATCH) {
      const batch = allValues.slice(b, b + INSERT_BATCH).map((v) => ({ documentId: doc.id, ...v }));
      await tx.insert(chunks).values(batch);
    }
    return doc.id;
  });

  console.log(`  Done: document id ${docId}, ${totalChunks} chunks across ${sections.length} sections.`);
}

async function seed() {
  console.log("Seeding default book library...");
  for (const book of BOOKS) {
    try {
      await seedBook(book);
    } catch (err) {
      console.error(`Failed to seed "${book.name}":`, err);
      process.exitCode = 1;
    }
  }
  console.log("\nAll done. Run seed-chromadb.ts to index new chunks into ChromaDB.");
  process.exit(process.exitCode ?? 0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
