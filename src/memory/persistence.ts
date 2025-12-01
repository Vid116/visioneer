import { getDatabase, prepareStatement } from '../db/connection.js';
import { ChunkV2, LearningContext } from '../utils/types.js';

/**
 * Persistence Score weights (sum to 1.0)
 */
export const PS_WEIGHTS = {
  frequency: 0.25,      // How often accessed
  salience: 0.20,       // Importance indicators
  connection: 0.25,     // Graph centrality
  recency: 0.15,        // Time since last access (tick-based)
  importance: 0.15,     // Explicit importance markers
};

/**
 * Configuration
 */
export const PS_CONFIG = {
  frequencyK: 0.3,           // Saturation rate
  recencyTauTicks: 100,      // Ticks for 63% decay
  maxConnections: 20,        // Cap for normalization
};

/**
 * Calculate Persistence Score for a chunk
 * PS = 0.25·F + 0.20·S + 0.25·C + 0.15·R + 0.15·I
 */
export function calculatePersistenceScore(
  chunk: ChunkV2,
  currentTick: number,
  relationshipCount: number
): number {
  const F = frequencyScore(chunk.access_count);
  const S = salienceScore(chunk);
  const C = connectionScore(relationshipCount);
  const R = recencyScore(chunk.tick_last_accessed, currentTick);
  const I = importanceScore(chunk);

  const ps =
    PS_WEIGHTS.frequency * F +
    PS_WEIGHTS.salience * S +
    PS_WEIGHTS.connection * C +
    PS_WEIGHTS.recency * R +
    PS_WEIGHTS.importance * I;

  return Math.min(1.0, Math.max(0.0, ps));
}

/**
 * Frequency: Saturating function with diminishing returns
 * f(n) = 1 - e^(-k*n)
 */
function frequencyScore(accessCount: number): number {
  return 1 - Math.exp(-PS_CONFIG.frequencyK * accessCount);
}

/**
 * Salience: Importance indicators based on chunk characteristics
 */
function salienceScore(chunk: ChunkV2): number {
  let score = 0.0;

  // Type-based salience
  const typeSalience: Record<string, number> = {
    user_input: 0.30,
    decision: 0.25,
    insight: 0.20,
    research: 0.10,
    attempt: 0.05,
    resource: 0.05,
  };
  score += typeSalience[chunk.type] || 0.10;

  // Source-based salience
  if (chunk.source === 'user') score += 0.20;
  if (chunk.source === 'experiment') score += 0.15;
  if (chunk.source === 'deduction') score += 0.10;

  // Confidence-based salience
  if (chunk.confidence === 'verified') score += 0.15;
  if (chunk.confidence === 'inferred') score += 0.05;

  // Tag-based salience
  if (chunk.tags.some(t => t.includes('goal') || t.includes('priority'))) {
    score += 0.10;
  }

  return Math.min(1.0, score);
}

/**
 * Connection: Based on relationship count (graph centrality proxy)
 */
function connectionScore(relationshipCount: number): number {
  return Math.min(1.0, relationshipCount / PS_CONFIG.maxConnections);
}

/**
 * Recency: Tick-based exponential decay from last access
 */
function recencyScore(tickLastAccessed: number | null, currentTick: number): number {
  if (tickLastAccessed === null) return 0;

  const ticksSince = currentTick - tickLastAccessed;
  return Math.exp(-ticksSince / PS_CONFIG.recencyTauTicks);
}

/**
 * Importance: Explicit markers
 */
function importanceScore(chunk: ChunkV2): number {
  if (chunk.pinned) return 1.0;
  if (chunk.type === 'user_input') return 1.0;
  if (chunk.type === 'decision') return 0.8;

  // Check for importance tags
  if (chunk.tags.includes('pinned')) return 1.0;
  if (chunk.tags.includes('core')) return 0.9;
  if (chunk.tags.includes('important')) return 0.7;

  return 0.0;
}

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
    learningContext = row.learning_context as LearningContext;
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
 * Update persistence score for a chunk
 */
export function updateChunkPersistenceScore(
  chunkId: string,
  currentTick: number
): number {
  // Get chunk
  const chunkStmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);
  const row = chunkStmt.get(chunkId) as Record<string, unknown> | undefined;
  if (!row) return 0;

  const chunk = rowToChunkV2(row);

  // Count relationships
  const relStmt = prepareStatement(`
    SELECT COUNT(*) as count FROM relationships
    WHERE from_chunk_id = ? OR to_chunk_id = ?
  `);
  const relCount = (relStmt.get(chunkId, chunkId) as { count: number }).count;

  // Calculate score
  const ps = calculatePersistenceScore(chunk, currentTick, relCount);

  // Update
  const updateStmt = prepareStatement(`
    UPDATE chunks SET persistence_score = ? WHERE id = ?
  `);
  updateStmt.run(ps, chunkId);

  return ps;
}

/**
 * Batch update persistence scores for all active chunks
 */
export function updateAllPersistenceScores(
  projectId: string,
  currentTick: number
): { updated: number; avgScore: number } {
  const chunksStmt = prepareStatement(`
    SELECT id FROM chunks
    WHERE project_id = ? AND status = 'active'
  `);
  const chunks = chunksStmt.all(projectId) as { id: string }[];

  let totalScore = 0;
  for (const chunk of chunks) {
    const ps = updateChunkPersistenceScore(chunk.id, currentTick);
    totalScore += ps;
  }

  return {
    updated: chunks.length,
    avgScore: chunks.length > 0 ? totalScore / chunks.length : 0,
  };
}
