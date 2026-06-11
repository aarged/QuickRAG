import { db } from "./db";
import { documents, chunks, conversations, messages, uploadLog, events } from "@shared/schema";
import type { Document, InsertDocument, Chunk, InsertChunk, Conversation, Message, Event, InsertEvent } from "@shared/schema";
import { eq, desc, sql, gt, ne } from "drizzle-orm";

// Fixed key for the transaction-scoped advisory lock that serializes daily
// upload-slot reservations (see createDocumentWithSlot).
const UPLOAD_SLOT_LOCK_KEY = 728931;

export interface IStorage {
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocument(id: number): Promise<Document | undefined>;
  getAllDocuments(): Promise<Document[]>;
  deleteDocument(id: number): Promise<void>;

  createChunks(docId: number, texts: string[], sourceLabels?: string[]): Promise<Chunk[]>;
  getChunksByDocument(docId: number): Promise<Chunk[]>;
  searchChunks(docId: number, query: string, topK?: number): Promise<(Chunk & { rank: number })[]>;

  createConversation(title: string): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  deleteConversation(id: number): Promise<void>;

  createMessage(msg: { conversationId: number; role: string; content: string; chunksUsed?: number }): Promise<Message>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  clearMessages(conversationId: number): Promise<void>;

  logUpload(): Promise<void>;
  getUploadCountLast24h(): Promise<number>;
  tryLogUploadAtomic(): Promise<boolean>;
  createDocumentWithSlot(
    doc: InsertDocument,
    texts: string[],
    sourceLabels: string[] | undefined,
    enforceLimit: boolean,
  ): Promise<{ status: "ok"; doc: Document; chunks: Chunk[] } | { status: "limit" }>;
  deleteNonDefaultDocuments(): Promise<number[]>;

  logEvent(event: InsertEvent): Promise<void>;
  getUniqueVisitorCount(): Promise<number>;
  getEventCountsByType(): Promise<{ eventType: string; count: number }[]>;
  getRecentEvents(limit?: number): Promise<Event[]>;
}

class DatabaseStorage implements IStorage {
  async createDocument(doc: InsertDocument): Promise<Document> {
    const [result] = await db.insert(documents).values(doc).returning();
    return result;
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [result] = await db.select().from(documents).where(eq(documents.id, id));
    return result;
  }

  async getAllDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async createChunks(docId: number, texts: string[], sourceLabels?: string[]): Promise<Chunk[]> {
    const values = texts.map((content, i) => ({
      documentId: docId,
      content,
      chunkIndex: i,
      source: sourceLabels?.[i] || null,
    }));
    return db.insert(chunks).values(values).returning();
  }

  async getChunksByDocument(docId: number): Promise<Chunk[]> {
    return db.select().from(chunks).where(eq(chunks.documentId, docId)).orderBy(chunks.chunkIndex);
  }

  async searchChunks(docId: number, query: string, topK: number = 3): Promise<(Chunk & { rank: number })[]> {
    const tsQuery = query
      .split(/\s+/)
      .filter(w => w.length > 1)
      .map(w => w.replace(/[^\w]/g, ''))
      .filter(Boolean)
      .join(' | ');

    if (!tsQuery) {
      const allChunks = await this.getChunksByDocument(docId);
      return allChunks.slice(0, topK).map(c => ({ ...c, rank: 0.5 }));
    }

    const results = await db.execute(sql`
      SELECT id, document_id as "documentId", content, chunk_index as "chunkIndex", source,
        ts_rank_cd(to_tsvector('english', content), to_tsquery('english', ${tsQuery})) as rank
      FROM chunks
      WHERE document_id = ${docId}
        AND to_tsvector('english', content) @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC
      LIMIT ${topK}
    `);

    if ((results as any).rows?.length > 0) {
      return (results as any).rows.map((r: any) => ({
        id: r.id,
        documentId: r.documentId,
        content: r.content,
        chunkIndex: r.chunkIndex,
        source: r.source || null,
        rank: parseFloat(r.rank),
      }));
    }

    const fallback = await this.getChunksByDocument(docId);
    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = fallback.map(chunk => {
      const contentLower = chunk.content.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (word.length > 2 && contentLower.includes(word)) {
          score += 1;
        }
      }
      return { ...chunk, rank: score / Math.max(queryWords.length, 1) };
    });

    scored.sort((a, b) => b.rank - a.rank);
    return scored.slice(0, topK).filter(c => c.rank > 0);
  }

  async createConversation(title: string): Promise<Conversation> {
    const [result] = await db.insert(conversations).values({ title }).returning();
    return result;
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [result] = await db.select().from(conversations).where(eq(conversations.id, id));
    return result;
  }

  async getAllConversations(): Promise<Conversation[]> {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async createMessage(msg: { conversationId: number; role: string; content: string; chunksUsed?: number }): Promise<Message> {
    const [result] = await db.insert(messages).values(msg).returning();
    return result;
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async clearMessages(conversationId: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
  }

  async logUpload(): Promise<void> {
    await db.insert(uploadLog).values({});
  }

  async getUploadCountLast24h(): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(uploadLog)
      .where(gt(uploadLog.uploadedAt, oneDayAgo));
    return Number(result[0]?.count || 0);
  }

  async tryLogUploadAtomic(): Promise<boolean> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db.execute(sql`
      INSERT INTO upload_log (uploaded_at)
      SELECT NOW()
      WHERE (SELECT COUNT(*) FROM upload_log WHERE uploaded_at > ${oneDayAgo}) < 1
      RETURNING id
    `);
    return (result as any).length > 0 || (result as any).rowCount > 0;
  }

  async createDocumentWithSlot(
    doc: InsertDocument,
    texts: string[],
    sourceLabels: string[] | undefined,
    enforceLimit: boolean,
  ): Promise<{ status: "ok"; doc: Document; chunks: Chunk[] } | { status: "limit" }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return db.transaction(async (tx) => {
      // Serialize concurrent upload reservations with a transaction-scoped
      // advisory lock so the count-check + insert below cannot race (two
      // callers both reading count=0 and each inserting a row). The lock is
      // released automatically when the transaction commits or rolls back.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${UPLOAD_SLOT_LOCK_KEY})`);

      // Reserve the daily slot inside the transaction. When enforcing the
      // limit, the insert only succeeds if under the daily cap; otherwise
      // (owner uploads) the row is always inserted for tracking. If document
      // or chunk persistence fails below, the whole transaction — including
      // this slot reservation — rolls back, so only successful uploads count.
      const reserve = enforceLimit
        ? await tx.execute(sql`
            INSERT INTO upload_log (uploaded_at)
            SELECT NOW()
            WHERE (SELECT COUNT(*) FROM upload_log WHERE uploaded_at > ${oneDayAgo}) < 1
            RETURNING id
          `)
        : await tx.execute(sql`
            INSERT INTO upload_log (uploaded_at)
            SELECT NOW()
            RETURNING id
          `);
      const reserved = (reserve as any).length > 0 || (reserve as any).rowCount > 0;
      if (enforceLimit && !reserved) {
        return { status: "limit" as const };
      }

      const [createdDoc] = await tx.insert(documents).values(doc).returning();
      const values = texts.map((content, i) => ({
        documentId: createdDoc.id,
        content,
        chunkIndex: i,
        source: sourceLabels?.[i] || null,
      }));
      const createdChunks = await tx.insert(chunks).values(values).returning();
      return { status: "ok" as const, doc: createdDoc, chunks: createdChunks };
    });
  }

  async deleteNonDefaultDocuments(): Promise<number[]> {
    const nonDefaultDocs = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.isDefault, false));
    const ids = nonDefaultDocs.map(d => d.id);
    if (ids.length > 0) {
      for (const id of ids) {
        await db.delete(documents).where(eq(documents.id, id));
      }
    }
    return ids;
  }

  async logEvent(event: InsertEvent): Promise<void> {
    await db.insert(events).values(event);
  }

  async getUniqueVisitorCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(distinct ${events.visitorId})` })
      .from(events);
    return Number(result[0]?.count || 0);
  }

  async getEventCountsByType(): Promise<{ eventType: string; count: number }[]> {
    const result = await db
      .select({
        eventType: events.eventType,
        count: sql<number>`count(*)`,
      })
      .from(events)
      .groupBy(events.eventType)
      .orderBy(desc(sql`count(*)`));
    return result.map((r) => ({ eventType: r.eventType, count: Number(r.count) }));
  }

  async getRecentEvents(limit: number = 50): Promise<Event[]> {
    return db.select().from(events).orderBy(desc(events.createdAt)).limit(limit);
  }
}

export const storage = new DatabaseStorage();
