import { getDatabase, prepareStatement } from '../db/connection.js';
import { searchSimilar } from '../db/vector-store.js';
import { embed } from '../embedding/index.js';
import { searchBM25 } from './bm25.js';
import { ChunkV2, RetrievalContext, BoostedSearchResult, LearningContext } from '../utils/types.js';
import { reactivateMemory } from '../memory/decay.js';

/**
 * Retrieval weights for RRF
 */
export const RETRIEVAL_WEIGHTS = {
  semantic: 0.40,
  keyword: 0.35,
  graph: 0.25,
};

const RRF_K = 60;

/**
 * Parse a database row into ChunkV2
 */
function rowToChunkV2(row: Record<string, unknown>): ChunkV2 {
  // Parse learning context
  let learningContext: LearningContext;
  if (typeof row.learning_context === 'string') {
    try {
      learningContext = JSON.parse(row.learning_context);
    } catch {
      learningContext = {
        tick: 0,
        task_id: null,
        goal_id: null,
        phase: 'unknown',
        skill_area: null,
        query_context: '',
        related_chunks: [],
      };
    }
  } else {
    learningContext = (row.learning_context as LearningContext) || {
      tick: 0,
      task_id: null,
      goal_id: null,
      phase: 'unknown',
      skill_area: null,
      query_context: '',
      related_chunks: [],
    };
  }

  // Parse tags
  let tags: string[];
  if (typeof row.tags === 'string') {
    try {
      tags = JSON.parse(row.tags);
    } catch {
      tags = [];
    }
  } else {
    tags = (row.tags as string[]) || [];
  }

  return {
    id: row.id as string,
    project_id: row.project_id as string,
    content: row.content as string,
    type: row.type as ChunkV2['type'],
    tags,
    confidence: row.confidence as ChunkV2['confidence'],
    source: row.source as ChunkV2['source'],
    created_at: row.created_at as string,
    last_accessed: row.last_accessed as string,
    last_useful: row.last_useful as string | null,
    tick_created: (row.tick_created as number) ?? 0,
    tick_last_accessed: row.tick_last_accessed as number | null,
    tick_last_useful: row.tick_last_useful as number | null,
    learning_context: learningContext,
    initial_strength: (row.initial_strength as number) ?? 1.0,
    current_strength: (row.current_strength as number) ?? 1.0,
    decay_function: (row.decay_function as ChunkV2['decay_function']) ?? 'exponential',
    decay_rate: (row.decay_rate as number) ?? 0.05,
    persistence_score: (row.persistence_score as number) ?? 0.5,
    access_count: (row.access_count as number) ?? 0,
    successful_uses: (row.successful_uses as number) ?? 0,
    status: (row.status as ChunkV2['status']) ?? 'active',
    pinned: row.pinned === 1 || row.pinned === true,
    superseded_by: row.superseded_by as string | null,
    valid_until_tick: row.valid_until_tick as number | null,
  };
}

/**
 * Calculate context match between learning context and retrieval context
 * Returns 0-1 score
 */
function calculateContextMatch(
  learningCtx: LearningContext,
  retrievalCtx: RetrievalContext
): number {
  let matchScore = 0;
  let totalWeight = 0;

  // Goal match (strongest signal)
  if (learningCtx.goal_id && retrievalCtx.goal_id) {
    totalWeight += 0.35;
    if (learningCtx.goal_id === retrievalCtx.goal_id) {
      matchScore += 0.35;
    }
  }

  // Skill area match
  if (learningCtx.skill_area && retrievalCtx.skill_area) {
    totalWeight += 0.25;
    if (learningCtx.skill_area === retrievalCtx.skill_area) {
      matchScore += 0.25;
    }
  }

  // Phase match
  totalWeight += 0.15;
  if (learningCtx.phase === retrievalCtx.phase) {
    matchScore += 0.15;
  }

  // Task match (very strong if same task)
  if (learningCtx.task_id && retrievalCtx.task_id) {
    totalWeight += 0.25;
    if (learningCtx.task_id === retrievalCtx.task_id) {
      matchScore += 0.25;
    }
  }

  return totalWeight > 0 ? matchScore / totalWeight : 0;
}

/**
 * Apply context boost to a chunk's retrieval score
 * This is the "memory time travel" mechanism
 */
function applyContextBoost(
  chunk: ChunkV2,
  baseSimilarity: number,
  retrievalCtx: RetrievalContext
): { score: number; boosted: boolean; boostReason?: BoostedSearchResult['boostReason'] } {
  // Parse learning context if needed
  const learningCtx = typeof chunk.learning_context === 'string'
    ? JSON.parse(chunk.learning_context)
    : chunk.learning_context;

  const contextMatch = calculateContextMatch(learningCtx, retrievalCtx);

  // Base score uses current strength
  let score = (chunk.current_strength ?? 1.0) * baseSimilarity;
  let boosted = false;
  let boostReason: BoostedSearchResult['boostReason'] | undefined;

  // Strong context match → significant boost
  if (contextMatch > 0.7) {
    score *= 1 + (contextMatch - 0.5) * 0.6;  // Up to 1.3x
    boosted = true;
    boostReason = 'strong_context_match';
  } else if (contextMatch > 0.4) {
    score *= 1 + (contextMatch - 0.3) * 0.3;  // Up to 1.15x
    boosted = true;
    boostReason = 'moderate_context_match';
  }

  // Memory time travel: weak but context-matched memories get floor score
  const strength = chunk.current_strength ?? 1.0;
  if (strength < 0.3 && contextMatch > 0.6) {
    const restoredScore = contextMatch * baseSimilarity * 0.7;
    if (restoredScore > score) {
      score = restoredScore;
      boosted = true;
      boostReason = 'memory_reactivation';
    }
  }

  return { score, boosted, boostReason };
}

/**
 * Reciprocal Rank Fusion
 */
function reciprocalRankFusion(
  rankings: Map<string, number>[],
  weights: number[]
): Map<string, number> {
  const scores = new Map<string, number>();

  rankings.forEach((ranking, i) => {
    const weight = weights[i];
    const sorted = [...ranking.entries()].sort((a, b) => b[1] - a[1]);

    sorted.forEach(([id], rank) => {
      const rrf = 1 / (RRF_K + rank);
      scores.set(id, (scores.get(id) || 0) + weight * rrf);
    });
  });

  return scores;
}

/**
 * Hybrid search with context boost
 */
export async function hybridSearchWithContext(
  projectId: string,
  query: string,
  retrievalCtx: RetrievalContext,
  options: {
    limit?: number;
    types?: string[];
    includeGraph?: boolean;
    minSimilarity?: number;
  } = {}
): Promise<BoostedSearchResult[]> {
  const { limit = 10, types, includeGraph = true, minSimilarity = 0.5 } = options;

  // Embed the query for semantic search
  let queryEmbedding: Float32Array;
  try {
    queryEmbedding = await embed(query);
  } catch (error) {
    console.warn('Failed to embed query, falling back to BM25 only:', error);
    // Fall back to BM25 only
    const bm25Results = await searchBM25(query, projectId, { limit, types });
    return bm25ResultsToBoostResults(bm25Results, projectId, retrievalCtx);
  }

  // Run semantic and BM25 in parallel
  const [semanticResults, bm25Results] = await Promise.all([
    Promise.resolve(searchSimilar(projectId, queryEmbedding, 50, minSimilarity)),
    searchBM25(query, projectId, { limit: 50, types }),
  ]);

  // Build score maps
  const semanticScores = new Map<string, number>();
  for (const r of semanticResults) {
    semanticScores.set(r.chunkId, r.similarity);
  }

  const keywordScores = new Map<string, number>();
  for (const r of bm25Results) {
    keywordScores.set(r.chunkId, r.score);
  }

  // Graph expansion (optional)
  const graphScores = new Map<string, number>();
  if (includeGraph) {
    const topSemanticIds = [...semanticScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    for (const id of topSemanticIds) {
      const relStmt = prepareStatement(`
        SELECT to_chunk_id, weight FROM relationships
        WHERE from_chunk_id = ? AND weight > 0.2
        UNION
        SELECT from_chunk_id, weight FROM relationships
        WHERE to_chunk_id = ? AND weight > 0.2
      `);
      const related = relStmt.all(id, id) as { to_chunk_id?: string; from_chunk_id?: string; weight: number }[];

      for (const rel of related) {
        const relatedId = rel.to_chunk_id || rel.from_chunk_id!;
        const current = graphScores.get(relatedId) || 0;
        graphScores.set(relatedId, Math.max(current, rel.weight));
      }
    }
  }

  // Combine with RRF
  const combinedScores = reciprocalRankFusion(
    [semanticScores, keywordScores, graphScores],
    [RETRIEVAL_WEIGHTS.semantic, RETRIEVAL_WEIGHTS.keyword, RETRIEVAL_WEIGHTS.graph]
  );

  // Get top candidates
  const topIds = [...combinedScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.min(50, limit * 5));  // Get more for context boosting

  // Load chunks and apply context boost
  const results: BoostedSearchResult[] = [];

  for (const [id] of topIds) {
    const chunkStmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);
    const row = chunkStmt.get(id) as Record<string, unknown> | undefined;

    if (!row) continue;

    const chunk = rowToChunkV2(row);
    if (chunk.status === 'tombstone') continue;

    // Get raw similarity for this chunk
    const rawSimilarity = semanticScores.get(id) || keywordScores.get(id) || 0.5;

    // Apply context boost
    const { score, boosted, boostReason } = applyContextBoost(chunk, rawSimilarity, retrievalCtx);

    results.push({
      chunk,
      rawSimilarity,
      score,
      boosted,
      boostReason,
      sources: {
        semantic: semanticScores.get(id),
        keyword: keywordScores.get(id),
        graph: graphScores.get(id),
      },
    });
  }

  // Sort by boosted score and limit
  results.sort((a, b) => b.score - a.score);
  const finalResults = results.slice(0, limit);

  // Track retrieval (update access counts)
  for (const r of finalResults) {
    reactivateMemory(r.chunk.id, retrievalCtx.tick, false);
  }

  // Log memory reactivations
  const reactivated = finalResults.filter(r => r.boostReason === 'memory_reactivation');
  if (reactivated.length > 0) {
    console.log(`Memory time travel: ${reactivated.length} weak memories reactivated`);
  }

  return finalResults;
}

/**
 * Convert BM25-only results to BoostedSearchResult format (fallback)
 */
async function bm25ResultsToBoostResults(
  bm25Results: { chunkId: string; score: number }[],
  projectId: string,
  retrievalCtx: RetrievalContext
): Promise<BoostedSearchResult[]> {
  const results: BoostedSearchResult[] = [];

  for (const r of bm25Results) {
    const chunkStmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);
    const row = chunkStmt.get(r.chunkId) as Record<string, unknown> | undefined;

    if (!row) continue;

    const chunk = rowToChunkV2(row);
    if (chunk.status === 'tombstone') continue;

    const { score, boosted, boostReason } = applyContextBoost(chunk, r.score, retrievalCtx);

    results.push({
      chunk,
      rawSimilarity: r.score,
      score,
      boosted,
      boostReason,
      sources: {
        keyword: r.score,
      },
    });
  }

  // Track retrieval
  for (const r of results) {
    reactivateMemory(r.chunk.id, retrievalCtx.tick, false);
  }

  return results;
}

/**
 * Build retrieval context from current state
 */
export function buildRetrievalContext(
  tick: number,
  task: { id: string; skill_area: string } | null,
  goalId: string | null,
  phase: string,
  query: string
): RetrievalContext {
  return {
    tick,
    task_id: task?.id ?? null,
    goal_id: goalId,
    phase,
    skill_area: task?.skill_area ?? null,
    query,
  };
}

/**
 * Simple hybrid search without context boost (for backward compatibility)
 */
export async function hybridSearch(
  projectId: string,
  query: string,
  options: {
    limit?: number;
    types?: string[];
    minSimilarity?: number;
  } = {}
): Promise<{ chunk: ChunkV2; score: number; sources: { semantic?: number; keyword?: number } }[]> {
  const { limit = 10, types, minSimilarity = 0.5 } = options;

  // Embed the query
  let queryEmbedding: Float32Array;
  try {
    queryEmbedding = await embed(query);
  } catch {
    // Fall back to BM25 only
    const bm25Results = await searchBM25(query, projectId, { limit, types });
    const results: { chunk: ChunkV2; score: number; sources: { keyword: number } }[] = [];

    for (const r of bm25Results) {
      const chunkStmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);
      const row = chunkStmt.get(r.chunkId) as Record<string, unknown> | undefined;
      if (!row) continue;

      const chunk = rowToChunkV2(row);
      if (chunk.status === 'tombstone') continue;

      results.push({ chunk, score: r.score, sources: { keyword: r.score } });
    }

    return results;
  }

  // Run both searches
  const [semanticResults, bm25Results] = await Promise.all([
    Promise.resolve(searchSimilar(projectId, queryEmbedding, 50, minSimilarity)),
    searchBM25(query, projectId, { limit: 50, types }),
  ]);

  // Build score maps
  const semanticScores = new Map<string, number>();
  for (const r of semanticResults) {
    semanticScores.set(r.chunkId, r.similarity);
  }

  const keywordScores = new Map<string, number>();
  for (const r of bm25Results) {
    keywordScores.set(r.chunkId, r.score);
  }

  // Combine with RRF (without graph)
  const combinedScores = reciprocalRankFusion(
    [semanticScores, keywordScores],
    [0.6, 0.4]  // Slightly favor semantic for simple hybrid
  );

  // Get top candidates
  const topIds = [...combinedScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  // Load chunks
  const results: { chunk: ChunkV2; score: number; sources: { semantic?: number; keyword?: number } }[] = [];

  for (const [id, score] of topIds) {
    const chunkStmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);
    const row = chunkStmt.get(id) as Record<string, unknown> | undefined;
    if (!row) continue;

    const chunk = rowToChunkV2(row);
    if (chunk.status === 'tombstone') continue;

    results.push({
      chunk,
      score,
      sources: {
        semantic: semanticScores.get(id),
        keyword: keywordScores.get(id),
      },
    });
  }

  return results;
}
