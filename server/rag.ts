import OpenAI from "openai";
import { storage } from "./storage";
import { semanticSearch } from "./chromadb";
import type { Chunk } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const result: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      result.push(current.trim());
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(overlap / 5));
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

export interface RetrievedChunk {
  id: number;
  content: string;
  chunkIndex: number;
  score: number;
  source: string;
}

export async function retrieveChunks(
  documentId: number,
  query: string,
  topK: number = 5
): Promise<RetrievedChunk[]> {
  const doc = await storage.getDocument(documentId);
  if (!doc) return [];

  try {
    const chromaResults = await semanticSearch(documentId, query, topK);
    if (chromaResults.length > 0) {
      console.log(`[RAG] ChromaDB returned ${chromaResults.length} results for query: "${query.slice(0, 50)}..."`);
      return chromaResults.map(r => ({
        id: r.id,
        content: r.content,
        chunkIndex: r.chunkIndex,
        score: r.score,
        source: r.source || `${doc.name} — Chunk ${r.chunkIndex + 1}`,
      }));
    }
  } catch (err) {
    console.error("[RAG] ChromaDB search failed, falling back to PostgreSQL FTS:", err);
  }

  console.log(`[RAG] Falling back to PostgreSQL FTS for query: "${query.slice(0, 50)}..."`);
  const results = await storage.searchChunks(documentId, query, topK);

  if (results.length === 0) {
    const allChunks = await storage.getChunksByDocument(documentId);
    return allChunks.slice(0, topK).map(c => ({
      id: c.id,
      content: c.content,
      chunkIndex: c.chunkIndex,
      score: 0.3,
      source: c.source || `${doc.name} — Chunk ${c.chunkIndex + 1}`,
    }));
  }

  const maxRank = Math.max(...results.map(r => r.rank), 0.01);
  return results.map(r => ({
    id: r.id,
    content: r.content,
    chunkIndex: r.chunkIndex,
    score: Math.min(0.95, 0.5 + (r.rank / maxRank) * 0.45),
    source: r.source || `${doc.name} — Chunk ${r.chunkIndex + 1}`,
  }));
}

export interface RAGConfig {
  grounding: "Strict" | "Creative";
  voice: string;
  style: string;
}

export function buildSystemPrompt(config: RAGConfig, retrievedChunks: RetrievedChunk[]): string {
  let prompt = "You are an AI assistant powered by a RAG pipeline.\n\n";

  switch (config.voice) {
    case "Yoda": prompt += "VOICE: Speak like Yoda from Star Wars. Use inverted sentence structure. Be cryptic on occasion.\n"; break;
    case "Pirate": prompt += "VOICE: Speak like a pirate. Use nautical terms.\n"; break;
    case "Valley Girl": prompt += "VOICE: Speak like a valley girl. Use words like 'like' and 'literally'.\n"; break;
    case "Surfer Dude": prompt += "VOICE: Speak like a surfer dude. Use words like 'gnarly' and 'dude'.\n"; break;
    case "Snarky Comic": prompt += "VOICE: Be sarcastic and slightly condescending, but helpful.\n"; break;
    default: prompt += "VOICE: Use a standard, helpful, professional tone.\n";
  }

  switch (config.style) {
    case "Terse": prompt += "STYLE: Be extremely brief. One or two sentences maximum.\n"; break;
    case "Verbose": prompt += "STYLE: Be detailed and comprehensive. Elaborate extensively.\n"; break;
    default: prompt += "STYLE: Provide a balanced, moderately detailed response.\n";
  }

  if (config.grounding === "Strict") {
    prompt += "\nGROUNDING: STRICT. Answer using ONLY the provided retrieved context below. Synthesize and summarize the information from the context passages to answer the question as fully as possible. If the retrieved context is completely unrelated to the question and contains no relevant information whatsoever, say 'I do not have enough information to answer that.' Do NOT use outside knowledge.\n";
  } else {
    prompt += "\nGROUNDING: CREATIVE. Base your answer primarily on the retrieved context. If the context is insufficient, you may supplement with your general knowledge, but clearly indicate when doing so.\n";
  }

  if (retrievedChunks.length > 0) {
    prompt += "\n--- RETRIEVED CONTEXT ---\n";
    for (const chunk of retrievedChunks) {
      prompt += `\n[Source: ${chunk.source} | Relevance: ${(chunk.score * 100).toFixed(0)}%]\n${chunk.content}\n`;
    }
    prompt += "\n--- END CONTEXT ---\n";
  } else {
    prompt += "\nNo context was retrieved for this query.\n";
  }

  return prompt;
}

export async function* streamChat(
  systemPrompt: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  userMessage: string
): AsyncGenerator<string> {
  const messagesForApi: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...chatHistory,
    { role: "user", content: userMessage },
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messagesForApi,
    stream: true,
    max_tokens: 2048,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
