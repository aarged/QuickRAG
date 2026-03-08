import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { chunkText, retrieveChunks, buildSystemPrompt, streamChat, estimateTokens } from "./rag";
import { indexChunks, deleteDocumentCollection } from "./chromadb";
import type { RAGConfig } from "./rag";

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

      const ownerPin = req.headers["x-owner-pin"] as string | undefined;
      const isOwner = ownerPin && process.env.OWNER_PIN && ownerPin === process.env.OWNER_PIN;

      const pdfBuffer = Buffer.from(pdfBase64, "base64");

      const MAX_PDF_SIZE = 10 * 1024 * 1024;
      if (pdfBuffer.length > MAX_PDF_SIZE) {
        return res.status(400).json({ error: "PDF exceeds 10MB size limit." });
      }

      if (!isOwner) {
        const logged = await storage.tryLogUploadAtomic();
        if (!logged) {
          return res.status(429).json({
            error: "Upload limit reached (1 per day). Try again tomorrow.",
          });
        }
      }

      const pdfParse = (await import("pdf-parse")).default;
      let extractedText: string;

      try {
        const pdfData = await pdfParse(pdfBuffer);
        extractedText = pdfData.text;
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        return res.status(400).json({ error: "Failed to parse PDF. Please ensure the file is a valid PDF." });
      }

      if (!extractedText || extractedText.trim().length < 50) {
        return res.status(400).json({ error: "PDF appears to contain no extractable text. Scanned/image PDFs are not supported." });
      }

      const doc = await storage.createDocument({ name, content: extractedText });
      const textChunks = chunkText(extractedText);
      const dbChunks = await storage.createChunks(doc.id, textChunks);

      if (isOwner) {
        await storage.logUpload();
      }

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
      const id = parseInt(req.params.id);
      const docChunks = await storage.getChunksByDocument(id);
      res.json(docChunks);
    } catch (error) {
      console.error("Error fetching chunks:", error);
      res.status(500).json({ error: "Failed to fetch chunks" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, documentId, config, history } = req.body as {
        message: string;
        documentId: number;
        config: RAGConfig;
        history: { role: "user" | "assistant"; content: string }[];
      };

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const retrievedChunks = documentId
        ? await retrieveChunks(documentId, message)
        : [];

      const systemPrompt = buildSystemPrompt(config || { grounding: "Strict", voice: "Standard", style: "Standard" }, retrievedChunks);

      const inputTokens = estimateTokens(systemPrompt + message + (history || []).map(h => h.content).join(" "));

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

      for await (const token of streamChat(systemPrompt, history || [], message)) {
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

  app.post("/api/search", async (req, res) => {
    try {
      const { query, documentId, topK } = req.body;
      if (!query || !documentId) {
        return res.status(400).json({ error: "Query and documentId are required" });
      }
      const results = await retrieveChunks(documentId, query, topK || 5);
      res.json(results);
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ error: "Failed to search" });
    }
  });

  return httpServer;
}
