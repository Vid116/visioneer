/**
 * In-memory Vector Store with SQLite persistence.
 *
 * This is a drop-in replacement for sqlite-vss that:
 * - Stores embeddings in memory for fast cosine similarity search
 * - Persists embeddings to SQLite for durability
 * - Loads embeddings from SQLite on startup
 *
 * Performance: O(n) search, but fast enough for <10k chunks.
 * Memory: ~12KB per chunk (3072 dimensions * 4 bytes)
 */

import { getDatabase, prepareStatement } from "./connection.js";
import { dbLogger } from "../utils/logger.js";

interface VectorEntry {
  chunkId: string;
  projectId: string;
  embedding: Float32Array;
}

// In-memory index
const vectorIndex: Map<string, VectorEntry> = new Map();

// Track if we've loaded from DB
let initialized = false;

/**
 * Computes cosine similarity between two vectors.
 * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Initializes the vector store schema in SQLite.
 * Creates table if not exists.
 */
export function initializeVectorStore(): void {
  const db = getDatabase();

  // Create embeddings table (replaces chunk_embedding_map + vss virtual table)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunk_embeddings_store (
      chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL,
      embedding BLOB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_project ON chunk_embeddings_store(project_id);
  `);

  dbLogger.info("Vector store schema initialized");
}

/**
 * Loads all embeddings from SQLite into memory.
 * Called once on startup.
 */
export function loadVectorIndex(): void {
  if (initialized) return;

  const db = getDatabase();

  // Check if table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_embeddings_store'
  `).get();

  if (!tableExists) {
    initializeVectorStore();
    initialized = true;
    return;
  }

  const rows = db.prepare(`
    SELECT chunk_id, project_id, embedding FROM chunk_embeddings_store
  `).all() as { chunk_id: string; project_id: string; embedding: Buffer }[];

  for (const row of rows) {
    const embedding = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.length / 4);
    vectorIndex.set(row.chunk_id, {
      chunkId: row.chunk_id,
      projectId: row.project_id,
      embedding,
    });
  }

  initialized = true;
  dbLogger.info(`Loaded ${vectorIndex.size} embeddings into memory`);
}

/**
 * Stores an embedding for a chunk.
 * Saves to both memory and SQLite.
 */
export function storeEmbedding(chunkId: string, projectId: string, embedding: Float32Array): void {
  // Ensure initialized
  if (!initialized) loadVectorIndex();

  // Store in memory
  vectorIndex.set(chunkId, {
    chunkId,
    projectId,
    embedding,
  });

  // Persist to SQLite
  const stmt = prepareStatement(`
    INSERT INTO chunk_embeddings_store (chunk_id, project_id, embedding)
    VALUES (?, ?, ?)
    ON CONFLICT (chunk_id) DO UPDATE SET
      embedding = excluded.embedding
  `);

  stmt.run(chunkId, projectId, Buffer.from(embedding.buffer));

  dbLogger.debug("Stored embedding", { chunkId, dimensions: embedding.length });
}

/**
 * Removes an embedding for a chunk.
 */
export function removeEmbedding(chunkId: string): void {
  vectorIndex.delete(chunkId);

  prepareStatement(`
    DELETE FROM chunk_embeddings_store WHERE chunk_id = ?
  `).run(chunkId);
}

/**
 * Searches for similar chunks using cosine similarity.
 * Returns chunks sorted by similarity (highest first).
 */
export function searchSimilar(
  projectId: string,
  queryEmbedding: Float32Array,
  limit: number = 10,
  minSimilarity: number = 0.7
): { chunkId: string; similarity: number }[] {
  // Ensure initialized
  if (!initialized) loadVectorIndex();

  const results: { chunkId: string; similarity: number }[] = [];

  // Linear scan through all vectors (O(n))
  for (const [chunkId, entry] of vectorIndex) {
    // Filter by project
    if (entry.projectId !== projectId) continue;

    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);

    if (similarity >= minSimilarity) {
      results.push({ chunkId, similarity });
    }
  }

  // Sort by similarity (descending)
  results.sort((a, b) => b.similarity - a.similarity);

  // Limit results
  return results.slice(0, limit);
}

/**
 * Gets the embedding for a specific chunk.
 */
export function getEmbedding(chunkId: string): Float32Array | null {
  if (!initialized) loadVectorIndex();

  const entry = vectorIndex.get(chunkId);
  return entry?.embedding || null;
}

/**
 * Returns stats about the vector store.
 */
export function getVectorStoreStats(): { totalVectors: number; projectCounts: Record<string, number> } {
  if (!initialized) loadVectorIndex();

  const projectCounts: Record<string, number> = {};

  for (const entry of vectorIndex.values()) {
    projectCounts[entry.projectId] = (projectCounts[entry.projectId] || 0) + 1;
  }

  return {
    totalVectors: vectorIndex.size,
    projectCounts,
  };
}

/**
 * Clears the in-memory index (for testing).
 * Does NOT clear SQLite storage.
 */
export function clearVectorIndex(): void {
  vectorIndex.clear();
  initialized = false;
}
