/**
 * Cross-Encoder Re-ranking Client
 *
 * Calls the Python reranker service for second-stage ranking.
 */

import { ChunkV2 } from '../utils/types';

// Configuration
export const RERANKER_CONFIG = {
  serviceUrl: process.env.RERANKER_URL || 'http://127.0.0.1:5050',
  enabled: true,
  topK: 10,
  candidateLimit: 20, // How many to send for re-ranking
  timeoutMs: 5000,
  fallbackOnError: true, // If reranker fails, return original order
};

/**
 * Reranker service status
 */
let serviceAvailable: boolean | null = null;
let lastHealthCheck: number = 0;
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute

/**
 * Check if reranker service is available
 */
export async function isRerankerAvailable(): Promise<boolean> {
  const now = Date.now();

  // Use cached result if recent
  if (
    serviceAvailable !== null &&
    now - lastHealthCheck < HEALTH_CHECK_INTERVAL
  ) {
    return serviceAvailable;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${RERANKER_CONFIG.serviceUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      serviceAvailable = data.ready === true;
    } else {
      serviceAvailable = false;
    }
  } catch {
    serviceAvailable = false;
  }

  lastHealthCheck = now;
  return serviceAvailable;
}

/**
 * Reset cached service availability (useful for testing)
 */
export function resetRerankerCache(): void {
  serviceAvailable = null;
  lastHealthCheck = 0;
}

/**
 * Re-rank result from service
 */
export interface RerankedResult {
  id: string;
  score: number;
  rank: number;
  originalRank?: number;
}

/**
 * Re-rank documents using cross-encoder
 */
export async function rerank(
  query: string,
  documents: { id: string; content: string }[],
  topK: number = RERANKER_CONFIG.topK
): Promise<RerankedResult[]> {
  // Handle empty documents
  if (!documents || documents.length === 0) {
    return [];
  }

  // Check if service is available
  if (!RERANKER_CONFIG.enabled || !(await isRerankerAvailable())) {
    // Return original order with synthetic scores
    return documents.slice(0, topK).map((doc, i) => ({
      id: doc.id,
      score: 1 - i * 0.05, // Decreasing scores
      rank: i + 1,
    }));
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      RERANKER_CONFIG.timeoutMs
    );

    const response = await fetch(`${RERANKER_CONFIG.serviceUrl}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        documents,
        top_k: topK,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Reranker returned ${response.status}`);
    }

    const data = await response.json();
    return data.results;
  } catch (error) {
    console.warn('Reranker failed, using original order:', error);

    if (RERANKER_CONFIG.fallbackOnError) {
      return documents.slice(0, topK).map((doc, i) => ({
        id: doc.id,
        score: 1 - i * 0.05,
        rank: i + 1,
      }));
    }

    throw error;
  }
}

/**
 * Re-rank ChunkV2 results
 * Convenience wrapper that handles chunk-to-document conversion
 */
export async function rerankChunks(
  query: string,
  chunks: ChunkV2[],
  topK: number = RERANKER_CONFIG.topK
): Promise<{ chunk: ChunkV2; score: number; rank: number }[]> {
  // Handle empty chunks
  if (!chunks || chunks.length === 0) {
    return [];
  }

  // Convert chunks to documents
  const documents = chunks.map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
  }));

  // Re-rank
  const reranked = await rerank(query, documents, topK);

  // Map back to chunks
  const chunkMap = new Map(chunks.map((c) => [c.id, c]));

  return reranked
    .map((r) => ({
      chunk: chunkMap.get(r.id)!,
      score: r.score,
      rank: r.rank,
    }))
    .filter((r) => r.chunk !== undefined);
}

/**
 * Start reranker service (if not running)
 * Call this during Visioneer startup
 */
export async function ensureRerankerRunning(): Promise<boolean> {
  if (await isRerankerAvailable()) {
    console.log('Reranker service is already running');
    return true;
  }

  console.log('Reranker service not available. Start it manually with:');
  console.log('  cd services/reranker && ./start.sh');
  console.log('Or on Windows:');
  console.log('  cd services\\reranker && .\\start.ps1');

  return false;
}

/**
 * Get reranker service health info
 */
export async function getRerankerHealth(): Promise<{
  available: boolean;
  model?: string;
  device?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${RERANKER_CONFIG.serviceUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        available: data.ready === true,
        model: data.model,
        device: data.device,
      };
    }
  } catch {
    // Service not available
  }

  return { available: false };
}

// =============================================================================
// Relationship Scoring
// =============================================================================

import type { RelationshipType } from '../utils/types';

/**
 * Score a relationship between two chunks using cross-encoder
 */
export interface RelationshipScore {
  score: number;
  scoreAtoB: number;
  scoreBtoA: number;
  suggestedType: RelationshipType;
  typeConfidence: number;
  bidirectional: boolean;
}

/**
 * Score a relationship between two chunks using cross-encoder
 */
export async function scoreRelationship(
  chunkA: { id: string; content: string; type?: string },
  chunkB: { id: string; content: string; type?: string }
): Promise<RelationshipScore | null> {
  if (!(await isRerankerAvailable())) {
    return null; // Fall back to embedding similarity
  }

  try {
    const response = await fetch(
      `${RERANKER_CONFIG.serviceUrl}/score_relationship`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunk_a: chunkA,
          chunk_b: chunkB,
        }),
        signal: AbortSignal.timeout(RERANKER_CONFIG.timeoutMs),
      }
    );

    if (!response.ok) {
      throw new Error(`Reranker returned ${response.status}`);
    }

    const data = await response.json();

    return {
      score: data.score,
      scoreAtoB: data.score_a_to_b,
      scoreBtoA: data.score_b_to_a,
      suggestedType: data.suggested_type as RelationshipType,
      typeConfidence: data.type_confidence,
      bidirectional: data.bidirectional,
    };
  } catch (error) {
    console.warn('scoreRelationship failed:', error);
    return null;
  }
}

/**
 * Batch score multiple relationships (more efficient)
 */
export async function batchScoreRelationships(
  pairs: Array<{
    chunkA: { id: string; content: string; type?: string };
    chunkB: { id: string; content: string; type?: string };
  }>
): Promise<(RelationshipScore | null)[]> {
  if (!(await isRerankerAvailable()) || pairs.length === 0) {
    return pairs.map(() => null);
  }

  try {
    const response = await fetch(
      `${RERANKER_CONFIG.serviceUrl}/batch_score_relationships`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairs: pairs.map((p) => ({
            chunk_a: p.chunkA,
            chunk_b: p.chunkB,
          })),
        }),
        signal: AbortSignal.timeout(RERANKER_CONFIG.timeoutMs * 2),
      }
    );

    if (!response.ok) {
      throw new Error(`Reranker returned ${response.status}`);
    }

    const data = await response.json();

    return data.results.map((r: Record<string, unknown>) => {
      if (r.error) return null;
      return {
        score: r.score as number,
        scoreAtoB: r.score_a_to_b as number,
        scoreBtoA: r.score_b_to_a as number,
        suggestedType: r.suggested_type as RelationshipType,
        typeConfidence: r.type_confidence as number,
        bidirectional: r.bidirectional as boolean,
      };
    });
  } catch (error) {
    console.warn('batchScoreRelationships failed:', error);
    return pairs.map(() => null);
  }
}

/**
 * Validate a potential contradiction using cross-encoder
 */
export interface ContradictionValidation {
  isContradiction: boolean;
  confidence: number;
  similarity: number;
  explanation: string;
}

export async function validateContradiction(
  chunkA: { id: string; content: string },
  chunkB: { id: string; content: string },
  initialConfidence: number
): Promise<ContradictionValidation | null> {
  if (!(await isRerankerAvailable())) {
    return null; // Fall back to heuristic only
  }

  try {
    const response = await fetch(
      `${RERANKER_CONFIG.serviceUrl}/validate_contradiction`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunk_a: chunkA,
          chunk_b: chunkB,
          initial_confidence: initialConfidence,
        }),
        signal: AbortSignal.timeout(RERANKER_CONFIG.timeoutMs),
      }
    );

    if (!response.ok) {
      throw new Error(`Reranker returned ${response.status}`);
    }

    const data = await response.json();

    return {
      isContradiction: data.is_contradiction,
      confidence: data.confidence,
      similarity: data.similarity,
      explanation: data.explanation,
    };
  } catch (error) {
    console.warn('validateContradiction failed:', error);
    return null;
  }
}
