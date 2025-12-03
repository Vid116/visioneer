import { getDatabase, prepareStatement, withTransaction } from '../db/connection.js';
import { ChunkV2, ChunkStatus, DecayFunction, LearningContext } from '../utils/types.js';

/**
 * Memory Decay System
 *
 * Implements tick-based memory decay inspired by cognitive science forgetting curves.
 * Memories lose strength over cognitive time (ticks), simulating how human memory
 * naturally fades for unused information while preserving frequently accessed knowledge.
 *
 * ## Decay Functions
 *
 * - **Exponential**: `S(t) = S₀ × e^(-λt)` - Fast initial decay, long tail. Default for research.
 * - **Linear**: `S(t) = max(0, S₀ - k×t)` - Predictable, steady decline. Good for decisions.
 * - **Power Law**: `S(t) = S₀ × (1 + αt)^(-β)` - Very slow decay. Good for core skills.
 * - **None**: No decay. Used for user input and pinned content.
 *
 * ## Category Multipliers
 *
 * Different content types decay at different rates:
 * - `user_input`: 0 (never decays)
 * - `decision`: 0.3 (slow decay - decisions are important)
 * - `research`: 1.0 (standard decay)
 * - `attempt`: 1.5 (faster decay - failed attempts less valuable)
 * - `superseded`: 3.0 (rapid decay - replaced by newer info)
 *
 * ## Status Transitions
 *
 * As strength decays, chunks transition through statuses:
 * ```
 * active (>0.3) → warm (0.15-0.3) → cool (0.05-0.15) → cold (<0.05) → tombstone (0)
 * ```
 *
 * @example
 * ```typescript
 * // Run decay at end of each cycle
 * const result = runDecayProcess(projectId, currentTick, lastDecayTick);
 * console.log(`Processed ${result.processed}, tombstoned ${result.tombstoned}`);
 *
 * // Reactivate a memory when successfully used
 * reactivateMemory(chunkId, currentTick, true);
 * ```
 *
 * @see {@link TickManager} for tick management
 * @see {@link calculatePersistenceScore} for how decay interacts with persistence
 */

/**
 * Category-based decay multipliers
 * Multiply base decay rate by these values
 */
export const CATEGORY_MULTIPLIERS: Record<string, number> = {
  // No decay
  user_input: 0.0,

  // Slow decay
  decision: 0.3,
  user_preference: 0.1,
  goal_related: 0.4,

  // Standard decay
  research: 1.0,
  insight: 0.8,

  // Fast decay
  attempt: 1.5,
  superseded: 3.0,
};

/**
 * Status transition thresholds
 */
export const DECAY_THRESHOLDS = {
  archive: 0.3,       // Below this → consider archiving
  summarize: 0.15,    // Below this → summarize only
  tombstone: 0.05,    // Below this → tombstone
};

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
 * Apply tick-based decay to a chunk
 * Returns new strength value
 */
export function applyTickDecay(
  chunk: ChunkV2,
  ticksElapsed: number,
  currentTick: number
): number {
  const multiplier = getCategoryMultiplier(chunk);

  // No decay for this category
  if (multiplier === 0 || chunk.decay_function === 'none') {
    return chunk.current_strength;
  }

  const effectiveRate = chunk.decay_rate * multiplier;

  // Recency bonus: recently accessed memories decay slower
  let recencyFactor = 1.0;
  if (chunk.tick_last_accessed !== null) {
    const ticksSinceAccess = currentTick - chunk.tick_last_accessed;
    recencyFactor = 1 - 0.5 * Math.exp(-ticksSinceAccess / 50);
  }

  const adjustedRate = effectiveRate * recencyFactor;

  switch (chunk.decay_function) {
    case 'exponential':
      // S(t) = S₀ × e^(-λt)
      // Fast initial decay, long tail
      return chunk.current_strength * Math.exp(-adjustedRate * ticksElapsed);

    case 'linear':
      // S(t) = max(0, S₀ - k×t)
      // Predictable, steady decline
      return Math.max(0, chunk.current_strength - adjustedRate * ticksElapsed);

    case 'power_law':
      // S(t) = S₀ × (1 + αt)^(-β)
      // Very slow decay, good for persistent knowledge
      const alpha = 0.01;
      const beta = 0.3;
      return chunk.current_strength * Math.pow(1 + alpha * ticksElapsed, -beta);

    default:
      return chunk.current_strength;
  }
}

/**
 * Get decay multiplier for a chunk based on its characteristics
 */
function getCategoryMultiplier(chunk: ChunkV2): number {
  // Superseded content decays fastest
  if (chunk.superseded_by) {
    return CATEGORY_MULTIPLIERS.superseded;
  }

  // Type-based multipliers
  if (chunk.type in CATEGORY_MULTIPLIERS) {
    return CATEGORY_MULTIPLIERS[chunk.type];
  }

  // Tag-based multipliers
  if (chunk.tags.some(t => t.includes('goal') || t.includes('priority'))) {
    return CATEGORY_MULTIPLIERS.goal_related;
  }
  if (chunk.tags.includes('preference')) {
    return CATEGORY_MULTIPLIERS.user_preference;
  }

  return 1.0;
}

/**
 * Determine status based on current strength
 */
export function determineStatus(
  strength: number,
  currentStatus: ChunkStatus
): ChunkStatus {
  // Status hierarchy (can only go down, not up through decay)
  const hierarchy: ChunkStatus[] = ['active', 'warm', 'cool', 'cold', 'archived', 'tombstone'];
  const currentIndex = hierarchy.indexOf(currentStatus);

  let newStatus: ChunkStatus;

  if (strength >= DECAY_THRESHOLDS.archive) {
    newStatus = 'active';
  } else if (strength >= DECAY_THRESHOLDS.summarize) {
    newStatus = 'warm';
  } else if (strength >= DECAY_THRESHOLDS.tombstone) {
    newStatus = 'cool';
  } else if (strength > 0) {
    newStatus = 'cold';
  } else {
    newStatus = 'tombstone';
  }

  const newIndex = hierarchy.indexOf(newStatus);

  // Only demote, never promote through decay
  return newIndex > currentIndex ? newStatus : currentStatus;
}

/**
 * Result of decay process
 */
export interface DecayResult {
  processed: number;
  statusChanges: number;
  tombstoned: number;
  avgStrength: number;
}

/**
 * Run decay process for a project
 */
export function runDecayProcess(
  projectId: string,
  currentTick: number,
  lastDecayTick: number
): DecayResult {
  const ticksElapsed = currentTick - lastDecayTick;

  if (ticksElapsed <= 0) {
    return { processed: 0, statusChanges: 0, tombstoned: 0, avgStrength: 0 };
  }

  const result: DecayResult = {
    processed: 0,
    statusChanges: 0,
    tombstoned: 0,
    avgStrength: 0,
  };

  return withTransaction(() => {
    // Get all active chunks that can decay
    const chunksStmt = prepareStatement(`
      SELECT * FROM chunks
      WHERE project_id = ?
        AND status IN ('active', 'warm', 'cool', 'cold')
        AND decay_function != 'none'
    `);
    const rows = chunksStmt.all(projectId) as Record<string, unknown>[];

    let totalStrength = 0;

    for (const row of rows) {
      const chunk = rowToChunkV2(row);

      // Calculate new strength
      const newStrength = applyTickDecay(chunk, ticksElapsed, currentTick);

      // Determine new status
      const newStatus = determineStatus(newStrength, chunk.status);

      // Update if changed
      if (newStrength !== chunk.current_strength || newStatus !== chunk.status) {
        if (newStatus === 'tombstone' && chunk.status !== 'tombstone') {
          // Archive before tombstoning
          archiveChunk(chunk, currentTick);
          result.tombstoned++;
        }

        const updateStmt = prepareStatement(`
          UPDATE chunks
          SET current_strength = ?, status = ?
          WHERE id = ?
        `);
        updateStmt.run(newStrength, newStatus, chunk.id);

        if (newStatus !== chunk.status) {
          result.statusChanges++;
        }
      }

      totalStrength += newStrength;
      result.processed++;
    }

    result.avgStrength = result.processed > 0 ? totalStrength / result.processed : 0;

    return result;
  });
}

/**
 * Archive a chunk before tombstoning
 */
function archiveChunk(chunk: ChunkV2, currentTick: number): void {
  // Create summary (first 200 chars)
  const summary = chunk.content.length > 200
    ? chunk.content.slice(0, 197) + '...'
    : chunk.content;

  // Simple hash for deduplication
  let hash = 0;
  for (let i = 0; i < chunk.content.length; i++) {
    const char = chunk.content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const insertStmt = prepareStatement(`
    INSERT OR REPLACE INTO chunks_archive (
      id, project_id, content_summary, content_hash, type, tags,
      learning_context, tick_created, tick_archived, final_strength
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    chunk.id,
    chunk.project_id,
    summary,
    hash.toString(16),
    chunk.type,
    JSON.stringify(chunk.tags),
    JSON.stringify(chunk.learning_context),
    chunk.tick_created,
    currentTick,
    chunk.current_strength
  );
}

/**
 * Reactivate a memory when it's successfully used
 */
export function reactivateMemory(
  chunkId: string,
  currentTick: number,
  wasHelpful: boolean
): void {
  const db = getDatabase();

  const chunkStmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);
  const row = chunkStmt.get(chunkId) as Record<string, unknown> | undefined;
  if (!row) return;

  const chunk = rowToChunkV2(row);

  // Always update access tracking
  const updates: string[] = [
    'access_count = access_count + 1',
    'tick_last_accessed = ?',
  ];
  const params: (string | number)[] = [currentTick];

  if (wasHelpful) {
    // Strength boost (diminishing returns)
    const boost = 0.2 * (1 - chunk.current_strength);
    const newStrength = Math.min(1.0, chunk.current_strength + boost);

    updates.push('successful_uses = successful_uses + 1');
    updates.push('tick_last_useful = ?');
    updates.push('current_strength = ?');
    updates.push('decay_rate = MAX(0.01, decay_rate * 0.95)');

    params.push(currentTick, newStrength);

    // Promote status if warranted
    if (chunk.status !== 'active' && newStrength > 0.4) {
      updates.push("status = 'active'");
    }
  }

  params.push(chunkId);

  const sql = `UPDATE chunks SET ${updates.join(', ')} WHERE id = ?`;
  const updateStmt = db.prepare(sql);
  updateStmt.run(...params);
}
