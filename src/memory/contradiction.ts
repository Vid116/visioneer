/**
 * Contradiction Detection Module
 *
 * Detects when new knowledge contradicts existing knowledge before storage.
 * Uses a combination of semantic similarity, heuristic analysis, and optional
 * cross-encoder validation for high accuracy.
 *
 * ## Detection Process
 *
 * 1. Find similar existing chunks (embedding similarity > 0.85)
 * 2. For each candidate, analyze for contradiction signals:
 *    - **Direct negation**: "is not" vs "is", "cannot" vs "can"
 *    - **Opposite values**: "fast" vs "slow", "true" vs "false"
 *    - **Numeric differences**: "500ms" vs "50ms", "95%" vs "75%"
 *    - **Temporal markers**: "now", "updated", "changed"
 * 3. Calculate confidence score (0-1)
 * 4. Optionally validate with cross-encoder
 * 5. Determine action based on confidence thresholds
 *
 * ## Actions
 *
 * - **supersede** (>0.9): Mark old chunk as superseded, 3x decay rate
 * - **flag_for_review** (>0.7): Store both, flag for human review
 * - **store** (≤0.7): Store both, may be nuance not contradiction
 *
 * ## Relationships
 *
 * Creates `contradicts` relationship between conflicting chunks regardless
 * of action, enabling future conflict resolution and knowledge graph queries.
 *
 * @example
 * ```typescript
 * const result = await checkForContradictions(
 *   projectId,
 *   "The API response time is now 50ms",
 *   embedding,
 *   "research"
 * );
 *
 * if (result.hasContradiction) {
 *   console.log(`Contradicts: ${result.contradiction.existingChunkId}`);
 *   console.log(`Confidence: ${result.contradiction.confidence}`);
 *   console.log(`Action: ${result.contradiction.action}`);
 * }
 * ```
 *
 * @see {@link validateContradiction} for cross-encoder validation
 * @see {@link runDecayProcess} for superseded chunk decay
 */

import { searchSimilar } from "../db/vector-store.js";
import { getDatabase, prepareStatement } from "../db/connection.js";
import { ChunkV2, ChunkType, LearningContext } from "../utils/types.js";
import { dbLogger } from "../utils/logger.js";
import { loadConfig } from "../utils/config.js";
import { validateContradiction as crossEncoderValidate } from "../retrieval/reranker.js";
import { emitContradictionDetected } from "../events/event-bus.js";

// =============================================================================
// Configuration
// =============================================================================

export interface ContradictionConfig {
  enabled: boolean;
  similarityThreshold: number;
  maxCandidates: number;
  autoSupersede: boolean;
  contradictableTypes: string[];
  confidenceThresholds: {
    supersede: number;
    flagForReview: number;
    ignore: number;
  };
}

function getContradictionConfig(): ContradictionConfig {
  const config = loadConfig();
  return (
    (config.memory as Record<string, unknown>)?.contradiction as ContradictionConfig ?? {
      enabled: true,
      similarityThreshold: 0.85,
      maxCandidates: 5,
      autoSupersede: false,
      contradictableTypes: ["research", "insight", "decision"],
      confidenceThresholds: {
        supersede: 0.9,
        flagForReview: 0.7,
        ignore: 0.5,
      },
    }
  );
}

// =============================================================================
// Types
// =============================================================================

/**
 * Type of contradiction detected
 */
export type ConflictType = "direct" | "temporal" | "partial";

/**
 * Potential contradiction found
 */
export interface PotentialContradiction {
  existingChunk: ChunkV2;
  similarity: number;
  conflictType: ConflictType;
  confidence: number; // 0-1 how confident we are this is a contradiction
  explanation?: string;
}

/**
 * Suggested action for handling contradictions
 */
export type ContradictionAction =
  | "store"
  | "supersede"
  | "flag_for_review"
  | "reject";

/**
 * Result of contradiction check
 */
export interface ContradictionCheckResult {
  hasContradictions: boolean;
  contradictions: PotentialContradiction[];
  suggestedAction: ContradictionAction;
}

/**
 * Action to take when handling a detected contradiction
 */
export type HandleAction = "supersede" | "keep_both" | "link_only";

// =============================================================================
// Main Detection Function
// =============================================================================

/**
 * Check if new content contradicts existing knowledge
 */
export async function checkForContradictions(
  projectId: string,
  newContent: string,
  newEmbedding: Float32Array,
  newType: string,
  options: {
    skipTypes?: string[];
    forceCheck?: boolean;
    useCrossEncoder?: boolean;
  } = {}
): Promise<ContradictionCheckResult> {
  const config = getContradictionConfig();
  const { useCrossEncoder = true } = options;

  // Check if enabled
  if (!config.enabled && !options.forceCheck) {
    return {
      hasContradictions: false,
      contradictions: [],
      suggestedAction: "store",
    };
  }

  // Skip check for non-contradictable types (like 'attempt', 'resource')
  if (
    !options.forceCheck &&
    !config.contradictableTypes.includes(newType)
  ) {
    return {
      hasContradictions: false,
      contradictions: [],
      suggestedAction: "store",
    };
  }

  // Find similar existing chunks
  const similarChunks = searchSimilar(
    projectId,
    newEmbedding,
    config.maxCandidates,
    config.similarityThreshold
  );

  if (similarChunks.length === 0) {
    return {
      hasContradictions: false,
      contradictions: [],
      suggestedAction: "store",
    };
  }

  // Load full chunk data for candidates
  let contradictions: PotentialContradiction[] = [];

  for (const { chunkId, similarity } of similarChunks) {
    const stmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);
    const existing = stmt.get(chunkId) as Record<string, unknown> | undefined;

    if (!existing) continue;

    // Skip if types shouldn't contradict
    if (options.skipTypes?.includes(existing.type as string)) continue;

    // Analyze for contradiction using heuristics
    const analysis = analyzeContradiction(
      newContent,
      existing.content as string,
      similarity
    );

    if (analysis.isContradiction) {
      contradictions.push({
        existingChunk: parseChunkRow(existing),
        similarity,
        conflictType: analysis.conflictType,
        confidence: analysis.confidence,
        explanation: analysis.explanation,
      });
    }
  }

  // If cross-encoder available, validate contradictions for higher accuracy
  if (useCrossEncoder && contradictions.length > 0) {
    dbLogger.debug(`Validating ${contradictions.length} potential contradictions with cross-encoder`);

    const validatedContradictions: PotentialContradiction[] = [];

    for (const contradiction of contradictions) {
      const validation = await crossEncoderValidate(
        { id: "new", content: newContent },
        {
          id: contradiction.existingChunk.id,
          content: contradiction.existingChunk.content,
        },
        contradiction.confidence
      );

      if (validation) {
        // Update confidence based on cross-encoder
        const updatedContradiction = {
          ...contradiction,
          confidence: validation.confidence,
          explanation: validation.explanation,
        };

        // Only keep if cross-encoder confirms contradiction
        if (validation.isContradiction && validation.confidence > 0.5) {
          validatedContradictions.push(updatedContradiction);
          dbLogger.debug("Cross-encoder confirmed contradiction", {
            existingChunkId: contradiction.existingChunk.id,
            originalConfidence: contradiction.confidence,
            newConfidence: validation.confidence,
            explanation: validation.explanation,
          });
        } else {
          dbLogger.debug("Cross-encoder rejected contradiction", {
            existingChunkId: contradiction.existingChunk.id,
            originalConfidence: contradiction.confidence,
            newConfidence: validation.confidence,
            explanation: validation.explanation,
          });
        }
      } else {
        // Cross-encoder unavailable, keep original heuristic result
        validatedContradictions.push(contradiction);
      }
    }

    contradictions = validatedContradictions;
  }

  // Determine suggested action
  let suggestedAction: ContradictionAction = "store";

  if (contradictions.length > 0) {
    const maxConfidence = Math.max(...contradictions.map((c) => c.confidence));

    if (maxConfidence > config.confidenceThresholds.supersede) {
      suggestedAction = config.autoSupersede ? "supersede" : "flag_for_review";
    } else if (maxConfidence > config.confidenceThresholds.flagForReview) {
      suggestedAction = "flag_for_review";
    } else {
      suggestedAction = "store"; // Low confidence - might be nuance, store both
    }
  }

  dbLogger.debug("Contradiction check complete", {
    projectId,
    candidatesChecked: similarChunks.length,
    contradictionsFound: contradictions.length,
    suggestedAction,
    usedCrossEncoder: useCrossEncoder,
  });

  return {
    hasContradictions: contradictions.length > 0,
    contradictions,
    suggestedAction,
  };
}

// =============================================================================
// Heuristic Analysis
// =============================================================================

interface AnalysisResult {
  isContradiction: boolean;
  conflictType: ConflictType;
  confidence: number;
  explanation?: string;
}

/**
 * Analyze if two pieces of content contradict
 * Uses heuristic analysis (can be enhanced with LLM later)
 */
export function analyzeContradiction(
  newContent: string,
  existingContent: string,
  similarity: number
): AnalysisResult {
  const newLower = newContent.toLowerCase();
  const existingLower = existingContent.toLowerCase();

  // Check for negation patterns
  const negationPatterns: Array<{
    pattern: RegExp;
    type: ConflictType;
  }> = [
    {
      pattern:
        /\b(is not|isn't|are not|aren't|was not|wasn't|were not|weren't)\b/,
      type: "direct",
    },
    {
      pattern: /\b(never|no longer|not|cannot|can't|don't|doesn't|didn't)\b/,
      type: "direct",
    },
    {
      pattern: /\b(instead of|rather than|contrary to|opposite of)\b/,
      type: "direct",
    },
    {
      pattern: /\b(now|currently|updated|changed|revised)\b/,
      type: "temporal",
    },
    { pattern: /\b(however|but|although|despite|yet)\b/, type: "partial" },
  ];

  let isContradiction = false;
  let conflictType: ConflictType = "partial";
  let confidence = 0;
  let explanation: string | undefined;

  // High similarity + different assertions = likely contradiction
  if (similarity > 0.9) {
    // Very similar content - check for negation
    for (const { pattern, type } of negationPatterns) {
      if (pattern.test(newLower) && !pattern.test(existingLower)) {
        isContradiction = true;
        conflictType = type;
        confidence = 0.85;
        explanation = `New content contains negation pattern not in existing`;
        break;
      }
    }
  }

  // Check for opposite value statements
  const valuePatterns = [
    {
      positive: /\b(best|recommended|preferred|optimal)\b/,
      negative: /\b(worst|avoid|not recommended)\b/,
    },
    {
      positive: /\b(true|correct|valid|accurate)\b/,
      negative: /\b(false|incorrect|invalid|inaccurate)\b/,
    },
    {
      positive: /\b(always|must|should)\b/,
      negative: /\b(never|must not|should not)\b/,
    },
    {
      positive: /\b(fast|quick|efficient)\b/,
      negative: /\b(slow|inefficient)\b/,
    },
    {
      positive: /\b(easy|simple|straightforward)\b/,
      negative: /\b(hard|difficult|complex|complicated)\b/,
    },
  ];

  for (const { positive, negative } of valuePatterns) {
    const newHasPositive = positive.test(newLower);
    const newHasNegative = negative.test(newLower);
    const existingHasPositive = positive.test(existingLower);
    const existingHasNegative = negative.test(existingLower);

    if (
      (newHasPositive && existingHasNegative) ||
      (newHasNegative && existingHasPositive)
    ) {
      isContradiction = true;
      conflictType = "direct";
      confidence = Math.max(confidence, 0.8);
      explanation = `Opposing value statements detected`;
    }
  }

  // Check for numeric contradictions (different numbers for same metric)
  const numberPattern =
    /\b(\d+(?:\.\d+)?)\s*(%|percent|ms|seconds|minutes|hours|days|MB|GB|KB)\b/gi;
  const newNumbers = [...newLower.matchAll(numberPattern)];
  const existingNumbers = [...existingLower.matchAll(numberPattern)];

  if (newNumbers.length > 0 && existingNumbers.length > 0) {
    // Same unit but different value
    for (const newMatch of newNumbers) {
      for (const existingMatch of existingNumbers) {
        if (newMatch[2].toLowerCase() === existingMatch[2].toLowerCase()) {
          if (
            Math.abs(parseFloat(newMatch[1]) - parseFloat(existingMatch[1])) >
            0.01
          ) {
            isContradiction = true;
            conflictType = "temporal"; // Might just be updated data
            confidence = Math.max(confidence, 0.7);
            explanation = `Different numeric values for same metric: ${newMatch[0]} vs ${existingMatch[0]}`;
          }
        }
      }
    }
  }

  // If very high similarity but no clear contradiction signals, flag as potential
  if (similarity > 0.92 && !isContradiction) {
    isContradiction = true;
    conflictType = "partial";
    confidence = 0.5; // Low confidence
    explanation = `Very high similarity (${(similarity * 100).toFixed(1)}%) - may be redundant or contradictory`;
  }

  return { isContradiction, conflictType, confidence, explanation };
}

// =============================================================================
// Contradiction Handling
// =============================================================================

/**
 * Handle detected contradiction by creating relationship and optionally superseding
 */
export function handleContradiction(
  newChunkId: string,
  contradiction: PotentialContradiction,
  action: HandleAction
): void {
  const db = getDatabase();

  // Always create the contradicts relationship
  const createRelStmt = prepareStatement(`
    INSERT INTO relationships (id, from_chunk_id, to_chunk_id, type, weight, context_tags, origin, created_at)
    VALUES (?, ?, ?, 'contradicts', ?, ?, 'explicit', CURRENT_TIMESTAMP)
    ON CONFLICT (from_chunk_id, to_chunk_id, type) DO UPDATE SET
      weight = MAX(relationships.weight, excluded.weight)
  `);

  const relationshipId = `rel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  createRelStmt.run(
    relationshipId,
    newChunkId,
    contradiction.existingChunk.id,
    contradiction.confidence,
    JSON.stringify([contradiction.conflictType])
  );

  dbLogger.debug("Created contradicts relationship", {
    newChunkId,
    existingChunkId: contradiction.existingChunk.id,
    confidence: contradiction.confidence,
    conflictType: contradiction.conflictType,
  });

  // Emit event for dashboard
  emitContradictionDetected(
    newChunkId,
    contradiction.existingChunk.id,
    contradiction.confidence
  );

  if (action === "supersede") {
    // Mark old chunk as superseded
    const supersedeStmt = prepareStatement(`
      UPDATE chunks SET
        superseded_by = ?,
        valid_until_tick = (SELECT current_tick FROM agent_state WHERE project_id =
          (SELECT project_id FROM chunks WHERE id = ?))
      WHERE id = ?
    `);
    supersedeStmt.run(newChunkId, newChunkId, contradiction.existingChunk.id);

    // Increase decay rate on superseded chunk
    const decayStmt = prepareStatement(`
      UPDATE chunks SET decay_rate = decay_rate * 3.0 WHERE id = ?
    `);
    decayStmt.run(contradiction.existingChunk.id);

    dbLogger.info("Superseded chunk", {
      newChunkId,
      oldChunkId: contradiction.existingChunk.id,
    });
  }
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get all contradictions for a chunk
 */
export function getContradictions(chunkId: string): ChunkV2[] {
  const stmt = prepareStatement(`
    SELECT c.* FROM chunks c
    JOIN relationships r ON (r.to_chunk_id = c.id OR r.from_chunk_id = c.id)
    WHERE r.type = 'contradicts'
      AND (r.from_chunk_id = ? OR r.to_chunk_id = ?)
      AND c.id != ?
  `);

  const rows = stmt.all(chunkId, chunkId, chunkId) as Array<
    Record<string, unknown>
  >;
  return rows.map(parseChunkRow);
}

/**
 * Get all contradiction relationships for a project
 */
export function getProjectContradictions(
  projectId: string
): Array<{
  from: ChunkV2;
  to: ChunkV2;
  confidence: number;
  conflictType: string;
}> {
  const stmt = prepareStatement(`
    SELECT
      r.from_chunk_id,
      r.to_chunk_id,
      r.weight as confidence,
      r.context_tags
    FROM relationships r
    JOIN chunks c1 ON r.from_chunk_id = c1.id
    JOIN chunks c2 ON r.to_chunk_id = c2.id
    WHERE r.type = 'contradicts'
      AND c1.project_id = ?
    ORDER BY r.created_at DESC
  `);

  const rows = stmt.all(projectId) as Array<{
    from_chunk_id: string;
    to_chunk_id: string;
    confidence: number;
    context_tags: string;
  }>;

  const results: Array<{
    from: ChunkV2;
    to: ChunkV2;
    confidence: number;
    conflictType: string;
  }> = [];

  for (const row of rows) {
    const fromStmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);
    const toStmt = prepareStatement(`SELECT * FROM chunks WHERE id = ?`);

    const fromRow = fromStmt.get(row.from_chunk_id) as Record<string, unknown>;
    const toRow = toStmt.get(row.to_chunk_id) as Record<string, unknown>;

    if (fromRow && toRow) {
      const contextTags = JSON.parse(row.context_tags || "[]") as string[];
      results.push({
        from: parseChunkRow(fromRow),
        to: parseChunkRow(toRow),
        confidence: row.confidence,
        conflictType: contextTags[0] || "unknown",
      });
    }
  }

  return results;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse database row to ChunkV2
 */
function parseChunkRow(row: Record<string, unknown>): ChunkV2 {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    content: row.content as string,
    type: row.type as ChunkType,
    tags: JSON.parse((row.tags as string) || "[]"),
    confidence: row.confidence as "verified" | "inferred" | "speculative",
    source: row.source as "research" | "user" | "deduction" | "experiment",
    created_at: row.created_at as string,
    last_accessed: row.last_accessed as string,
    last_useful: row.last_useful as string | null,
    tick_created: row.tick_created as number,
    tick_last_accessed: row.tick_last_accessed as number | null,
    tick_last_useful: row.tick_last_useful as number | null,
    learning_context: JSON.parse(
      (row.learning_context as string) || "{}"
    ) as LearningContext,
    initial_strength: row.initial_strength as number,
    current_strength: row.current_strength as number,
    decay_function: row.decay_function as
      | "exponential"
      | "linear"
      | "power_law"
      | "none",
    decay_rate: row.decay_rate as number,
    persistence_score: row.persistence_score as number,
    access_count: row.access_count as number,
    successful_uses: row.successful_uses as number,
    status: row.status as
      | "active"
      | "warm"
      | "cool"
      | "cold"
      | "archived"
      | "tombstone",
    pinned: Boolean(row.pinned),
    superseded_by: row.superseded_by as string | null,
    valid_until_tick: row.valid_until_tick as number | null,
  };
}
