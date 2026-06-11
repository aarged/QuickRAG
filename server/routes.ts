import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { chunkText, retrieveChunks, buildSystemPrompt, streamChat, estimateTokens } from "./rag";
import { indexChunks, deleteDocumentCollection } from "./chromadb";
import type { RAGConfig } from "./rag";
import { insertEventSchema } from "@shared/schema";
import { chatLimiter, searchLimiter, eventsLimiter, isOwnerRequest } from "./rateLimit";

// Input caps applied before any OpenAI call so abusive payloads are rejected
// cheaply (no embedding/completion cost is ever incurred for an over-limit
// request).
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_ITEM_CHARS = 4000;
const MAX_QUERY_CHARS = 1000;
const MAX_TOPK = 10;
// Hard ceiling on concurrent user-uploaded (non-default) documents so ChromaDB
// collections cannot accumulate between restarts.
const MAX_USER_DOCUMENTS = 10;
// Per-field length caps for anonymous analytics events.
const MAX_EVENT_FIELD_CHARS = 512;
const MAX_EVENT_METADATA_CHARS = 2000;

function cleanPdfText(raw: string): string {
  if (!raw) return "";

  const lines = raw.split(/\n/);

  const lineCounts = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 2) {
      lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1);
    }
  }

  const cleaned = lines
    .map(line => line.trim())
    .filter(line => {
      if (line.length === 0) return true;
      if (/^\d[\d\s.,]*$/.test(line) && line.length < 20) return false;
      if (line.length < 3) return false;
      const count = lineCounts.get(line) || 0;
      if (count > 5 && line.length < 50) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/documents", async (req, res) => {
    try {
      const docs = await storage.getAllDocuments();
      res.json(docs);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const { name, pdfBase64 } = req.body;
      if (!name || !pdfBase64) {
        return res.status(400).json({ error: "Name and PDF content are required" });
      }

      const isOwner = isOwnerRequest(req);

      // Defense-in-depth beyond the 1/day global limit: refuse new uploads once
      // the pool of user-uploaded documents is full so ChromaDB collections
      // can't accumulate between restarts. The owner is exempt.
      if (!isOwner) {
        const userDocCount = await storage.getNonDefaultDocumentCount();
        if (userDocCount >= MAX_USER_DOCUMENTS) {
          return res.status(429).json({
            error: "The demo already has the maximum number of uploaded documents right now. Please try again later.",
          });
        }
      }

      const pdfBuffer = Buffer.from(pdfBase64, "base64");

      const MAX_PDF_SIZE = 10 * 1024 * 1024;
      if (pdfBuffer.length > MAX_PDF_SIZE) {
        return res.status(400).json({ error: "This PDF is larger than the 10MB limit. Please upload a smaller file." });
      }

      const { PDFParse } = await import("pdf-parse");
      let extractedText: string;

      try {
        const pdfUint8 = new Uint8Array(pdfBuffer);
        const parser = new PDFParse(pdfUint8);
        const textResult = await parser.getText();
        extractedText = textResult.text;
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        return res.status(400).json({ error: "We couldn't read this file as a PDF. Please make sure it's a valid, unencrypted PDF." });
      }

      const cleanedText = cleanPdfText(extractedText);
      const alphaChars = (cleanedText.match(/[a-zA-Z]/g) || []).length;
      const alphaRatio = cleanedText.length > 0 ? alphaChars / cleanedText.length : 0;

      if (!cleanedText || cleanedText.length < 100 || (alphaRatio < 0.3 && cleanedText.length < 500)) {
        return res.status(400).json({
          error: "This PDF is mostly images, tables, or scanned pages, so there's too little text to use. Text-based PDFs work best.",
        });
      }

      // Reserve the daily slot, create the document, and persist its chunks in a
      // single transaction (only after the PDF has passed validation). A rejected
      // file never reaches this point, and if persistence fails the slot is rolled
      // back — so only successful uploads consume a non-owner's daily upload.
      const textChunks = chunkText(cleanedText);
      const result = await storage.createDocumentWithSlot(
        { name, content: cleanedText },
        textChunks,
        undefined,
        !isOwner,
      );

      if (result.status === "limit") {
        return res.status(429).json({
          error: "Upload limit reached (1 per day). Try again tomorrow.",
        });
      }

      const doc = result.doc;
      const dbChunks = result.chunks;

      res.status(201).json({ ...doc, chunkCount: textChunks.length });

      try {
        const chunksToIndex = dbChunks.map(c => ({
          id: c.id,
          content: c.content,
          chunkIndex: c.chunkIndex,
          source: c.source || `${name} — Chunk ${c.chunkIndex + 1}`,
        }));
        indexChunks(doc.id, chunksToIndex, (done, total) => {
          console.log(`[ChromaDB] Indexing document "${name}": ${done}/${total} chunks`);
        }).then((count) => {
          console.log(`[ChromaDB] Finished indexing ${count} chunks for "${name}"`);
        }).catch((err) => {
          console.error(`[ChromaDB] Failed to index document "${name}":`, err);
        });
      } catch (err) {
        console.error("[ChromaDB] Failed to start indexing:", err);
      }
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.getDocument(id);
      if (doc?.isDefault) {
        return res.status(403).json({ error: "Default documents cannot be deleted" });
      }
      await storage.deleteDocument(id);

      deleteDocumentCollection(id).catch((err) => {
        console.error(`[ChromaDB] Failed to delete collection for document ${id}:`, err);
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.get("/api/documents/:id/chunks", async (req, res) => {
    try {
      // Raw chunk dumps are owner-only: they expose the full text of any
      // uploaded document. The app's own UI never calls this endpoint.
      if (!isOwnerRequest(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      const docChunks = await storage.getChunksByDocument(id);
      res.json(docChunks);
    } catch (error) {
      console.error("Error fetching chunks:", error);
      res.status(500).json({ error: "Failed to fetch chunks" });
    }
  });

  app.post("/api/chat", chatLimiter, async (req, res) => {
    try {
      const { message, documentId, config, history, visitorId } = req.body as {
        message: string;
        documentId: number;
        config: RAGConfig;
        history: { role: "user" | "assistant"; content: string }[];
        visitorId?: string;
      };

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      if (message.length > MAX_MESSAGE_CHARS) {
        return res.status(400).json({
          error: `Your message is too long (max ${MAX_MESSAGE_CHARS} characters). Please shorten it.`,
        });
      }

      // Bound the conversation history that gets forwarded to OpenAI: keep only
      // the most recent turns and drop any oversized entries, so a crafted
      // history array can't inflate input-token cost.
      const safeHistory = Array.isArray(history)
        ? history
            .filter(
              (h) =>
                h &&
                (h.role === "user" || h.role === "assistant") &&
                typeof h.content === "string" &&
                h.content.length <= MAX_HISTORY_ITEM_CHARS,
            )
            .slice(-MAX_HISTORY_MESSAGES)
        : [];

      const retrievedChunks = documentId
        ? await retrieveChunks(documentId, message)
        : [];

      // A chat message against a document triggers a semantic search/retrieval.
      // Log it as a distinct "search" event tied to the anonymous visitor (the
      // client-side "chat" event still records the message send itself).
      if (documentId && visitorId) {
        storage
          .logEvent({
            visitorId,
            eventType: "search",
            metadata: JSON.stringify({ documentId, results: retrievedChunks.length }),
            path: null,
            referrer: null,
          })
          .catch((err) => console.error("Failed to log search event:", err));
      }

      const systemPrompt = buildSystemPrompt(config || { grounding: "Strict", voice: "Standard", style: "Standard" }, retrievedChunks);

      const inputTokens = estimateTokens(systemPrompt + message + safeHistory.map(h => h.content).join(" "));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      res.write(`data: ${JSON.stringify({
        type: "context",
        chunks: retrievedChunks,
        inputTokens,
        systemPromptTokens: estimateTokens(systemPrompt),
      })}\n\n`);

      let fullResponse = "";

      for await (const token of streamChat(systemPrompt, safeHistory, message)) {
        fullResponse += token;
        res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
      }

      const outputTokens = estimateTokens(fullResponse);

      res.write(`data: ${JSON.stringify({
        type: "done",
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        chunksUsed: retrievedChunks.length,
      })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in chat:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to generate response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process chat" });
      }
    }
  });

  app.post("/api/search", searchLimiter, async (req, res) => {
    try {
      const { query, documentId, topK } = req.body;
      if (!query || typeof query !== "string" || !documentId) {
        return res.status(400).json({ error: "Query and documentId are required" });
      }
      if (query.length > MAX_QUERY_CHARS) {
        return res.status(400).json({
          error: `Your search query is too long (max ${MAX_QUERY_CHARS} characters).`,
        });
      }
      // Clamp topK to a small range so a caller can't request an oversized
      // retrieval.
      const safeTopK = Math.min(Math.max(1, Number(topK) || 5), MAX_TOPK);
      const results = await retrieveChunks(documentId, query, safeTopK);

      const visitorId = (req.body?.visitorId as string | undefined) || (req.headers["x-visitor-id"] as string | undefined);
      if (visitorId) {
        storage
          .logEvent({
            visitorId,
            eventType: "search",
            metadata: JSON.stringify({ documentId, results: results.length }),
            path: null,
            referrer: null,
          })
          .catch((err) => console.error("Failed to log search event:", err));
      }

      res.json(results);
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ error: "Failed to search" });
    }
  });

  // Anonymous in-app event ingest. Fire-and-forget from the client: a failed
  // event log must never break the user's action, so we still return 204 on
  // validation/storage errors.
  app.post("/api/events", eventsLimiter, async (req, res) => {
    try {
      const parsed = insertEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(204).send();
      }

      // Drop oversized/abusive event payloads early (still returning 204 so a
      // legitimate client's action is never disrupted). Caps each field so the
      // events table can't be stuffed with large strings.
      const e = parsed.data;
      const tooLong =
        e.visitorId.length > MAX_EVENT_FIELD_CHARS ||
        e.eventType.length > MAX_EVENT_FIELD_CHARS ||
        (e.metadata?.length ?? 0) > MAX_EVENT_METADATA_CHARS ||
        (e.path?.length ?? 0) > MAX_EVENT_FIELD_CHARS ||
        (e.referrer?.length ?? 0) > MAX_EVENT_FIELD_CHARS;
      if (tooLong) {
        return res.status(204).send();
      }

      await storage.logEvent(e);
      res.status(204).send();
    } catch (error) {
      console.error("Failed to log event:", error);
      res.status(204).send();
    }
  });

  // Owner-only analytics stats. Gated by the existing OWNER_PIN, sent via the
  // X-Owner-Pin header (same mechanism as the upload-limit override).
  app.get("/api/stats", async (req, res) => {
    try {
      const ownerPin = req.headers["x-owner-pin"] as string | undefined;
      if (!process.env.OWNER_PIN || !ownerPin || ownerPin !== process.env.OWNER_PIN) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const [uniqueVisitors, countsByType, recentEvents] = await Promise.all([
        storage.getUniqueVisitorCount(),
        storage.getEventCountsByType(),
        storage.getRecentEvents(50),
      ]);

      res.json({ uniqueVisitors, countsByType, recentEvents });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  return httpServer;
}
