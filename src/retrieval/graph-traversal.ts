/**
 * Graph Traversal for Knowledge Retrieval
 *
 * Uses relationship types to find relevant connected chunks.
 * Supports type-aware traversal with configurable depth and filtering.
 */

import { getDatabase, prepareStatement } from '../db/connection.js';
import {
  ChunkV2,
  RelationshipType,
  RELATIONSHIP_METADATA,
  LearningContext,
} from '../utils/types.js';

export interface TraversalOptions {
  maxDepth?: number; // How many hops to traverse (default: 2)
  maxResults?: number; // Max chunks to return (default: 20)
  followTypes?: RelationshipType[]; // Only follow these types
  excludeTypes?: RelationshipType[]; // Don't follow these types
  minWeight?: number; // Minimum relationship weight (default: 0.3)
  includeTransitive?: boolean; // Follow transitive relationships (default: true)
}

export interface TraversalResult {
  chunk: ChunkV2;
  depth: number;
  path: { chunkId: string; relType: RelationshipType }[];
  pathScore: number; // Combined score based on relationship weights
}

/**
 * Parse a database row into ChunkV2
 */
function parseChunkRow(row: Record<string, unknown>): ChunkV2 {
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
 * Traverse graph from seed chunks to find related knowledge
 */
export function traverseGraph(
  seedChunkIds: string[],
  options: TraversalOptions = {}
): TraversalResult[] {
  const {
    maxDepth = 2,
    maxResults = 20,
    followTypes,
    excludeTypes = ['contradicts'], // Don't follow contradictions by default
    minWeight = 0.3,
    includeTransitive = true,
  } = options;

  const visited = new Set<string>(seedChunkIds);
  const results: TraversalResult[] = [];

  // BFS traversal
  let frontier: {
    chunkId: string;
    depth: number;
    path: { chunkId: string; relType: RelationshipType }[];
    score: number;
  }[] = seedChunkIds.map((id) => ({ chunkId: id, depth: 0, path: [], score: 1.0 }));

  const neighborStmt = prepareStatement(`
    SELECT r.to_chunk_id as neighbor_id, r.type, r.weight, c.*
    FROM relationships r
    JOIN chunks c ON c.id = r.to_chunk_id
    WHERE r.from_chunk_id = ?
      AND r.weight >= ?
      AND c.status != 'tombstone'
    UNION
    SELECT r.from_chunk_id as neighbor_id, r.type, r.weight, c.*
    FROM relationships r
    JOIN chunks c ON c.id = r.from_chunk_id
    WHERE r.to_chunk_id = ?
      AND r.weight >= ?
      AND c.status != 'tombstone'
  `);

  while (frontier.length > 0 && results.length < maxResults) {
    const current = frontier.shift()!;

    if (current.depth >= maxDepth) continue;

    const neighbors = neighborStmt.all(
      current.chunkId,
      minWeight,
      current.chunkId,
      minWeight
    ) as Record<string, unknown>[];

    for (const row of neighbors) {
      const relType = row.type as RelationshipType;
      const neighborId = row.neighbor_id as string;

      // Skip if already visited
      if (visited.has(neighborId)) continue;

      // Check type filters
      if (followTypes && !followTypes.includes(relType)) continue;
      if (excludeTypes && excludeTypes.includes(relType)) continue;

      // Check transitivity
      const metadata = RELATIONSHIP_METADATA[relType];
      if (!includeTransitive && !metadata.transitive && current.depth > 0) continue;

      visited.add(neighborId);

      const newPath = [...current.path, { chunkId: neighborId, relType }];
      const pathScore = current.score * (row.weight as number) * metadata.traversalWeight;

      // Parse chunk
      const chunk = parseChunkRow(row);

      results.push({
        chunk,
        depth: current.depth + 1,
        path: newPath,
        pathScore,
      });

      // Add to frontier for further exploration
      frontier.push({
        chunkId: neighborId,
        depth: current.depth + 1,
        path: newPath,
        score: pathScore,
      });
    }

    // Sort frontier by score to explore best paths first
    frontier.sort((a, b) => b.score - a.score);
  }

  // Sort results by path score
  results.sort((a, b) => b.pathScore - a.pathScore);

  return results.slice(0, maxResults);
}

/**
 * Find causal chain: what caused this chunk's knowledge?
 */
export function findCausalChain(chunkId: string, maxDepth: number = 3): TraversalResult[] {
  return traverseGraph([chunkId], {
    maxDepth,
    followTypes: ['caused_by', 'derived_from', 'depends_on'],
    includeTransitive: true,
  });
}

/**
 * Find dependencies: what does this chunk depend on?
 */
export function findDependencies(chunkId: string): TraversalResult[] {
  return traverseGraph([chunkId], {
    maxDepth: 2,
    followTypes: ['depends_on', 'requires', 'part_of'],
  });
}

/**
 * Find examples: get concrete examples of an abstract concept
 */
export function findExamples(chunkId: string): TraversalResult[] {
  return traverseGraph([chunkId], {
    maxDepth: 1,
    followTypes: ['example_of'],
  });
}

/**
 * Find supporting evidence
 */
export function findSupportingEvidence(chunkId: string): TraversalResult[] {
  return traverseGraph([chunkId], {
    maxDepth: 2,
    followTypes: ['supports', 'builds_on'],
  });
}

/**
 * Find contradicting knowledge
 */
export function findContradictions(chunkId: string): TraversalResult[] {
  return traverseGraph([chunkId], {
    maxDepth: 1,
    followTypes: ['contradicts'],
    excludeTypes: [],
  });
}

/**
 * Find sequence: what comes before/after?
 */
export function findSequence(
  chunkId: string,
  direction: 'before' | 'after' | 'both' = 'both'
): TraversalResult[] {
  // For 'precedes', from_chunk precedes to_chunk
  // So to find what comes before, we look at incoming 'precedes'
  // To find what comes after, we look at outgoing 'precedes'

  const results: TraversalResult[] = [];

  if (direction === 'before' || direction === 'both') {
    const beforeStmt = prepareStatement(`
      SELECT c.*, r.weight
      FROM relationships r
      JOIN chunks c ON c.id = r.from_chunk_id
      WHERE r.to_chunk_id = ?
        AND r.type = 'precedes'
        AND c.status != 'tombstone'
      ORDER BY r.weight DESC
    `);
    const before = beforeStmt.all(chunkId) as Record<string, unknown>[];
    for (const row of before) {
      results.push({
        chunk: parseChunkRow(row),
        depth: 1,
        path: [{ chunkId: row.id as string, relType: 'precedes' }],
        pathScore: row.weight as number,
      });
    }
  }

  if (direction === 'after' || direction === 'both') {
    const afterStmt = prepareStatement(`
      SELECT c.*, r.weight
      FROM relationships r
      JOIN chunks c ON c.id = r.to_chunk_id
      WHERE r.from_chunk_id = ?
        AND r.type = 'precedes'
        AND c.status != 'tombstone'
      ORDER BY r.weight DESC
    `);
    const after = afterStmt.all(chunkId) as Record<string, unknown>[];
    for (const row of after) {
      results.push({
        chunk: parseChunkRow(row),
        depth: 1,
        path: [{ chunkId: row.id as string, relType: 'precedes' }],
        pathScore: row.weight as number,
      });
    }
  }

  return results;
}

/**
 * Get the full hierarchy (part_of chain)
 */
export function getHierarchy(
  chunkId: string,
  direction: 'up' | 'down' | 'both' = 'both'
): TraversalResult[] {
  const results: TraversalResult[] = [];

  // Up: this chunk is part_of what?
  if (direction === 'up' || direction === 'both') {
    const upResults = traverseGraph([chunkId], {
      maxDepth: 5,
      followTypes: ['part_of'],
    });
    results.push(...upResults);
  }

  // Down: what is part_of this chunk?
  if (direction === 'down' || direction === 'both') {
    const childrenStmt = prepareStatement(`
      SELECT c.*, r.weight
      FROM relationships r
      JOIN chunks c ON c.id = r.from_chunk_id
      WHERE r.to_chunk_id = ?
        AND r.type = 'part_of'
        AND c.status != 'tombstone'
    `);

    const processLevel = (
      parentId: string,
      depth: number,
      path: { chunkId: string; relType: RelationshipType }[]
    ) => {
      if (depth > 5) return;
      const children = childrenStmt.all(parentId) as Record<string, unknown>[];
      for (const row of children) {
        const newPath = [
          ...path,
          { chunkId: row.id as string, relType: 'part_of' as RelationshipType },
        ];
        results.push({
          chunk: parseChunkRow(row),
          depth,
          path: newPath,
          pathScore: row.weight as number,
        });
        processLevel(row.id as string, depth + 1, newPath);
      }
    };

    processLevel(chunkId, 1, []);
  }

  return results;
}

/**
 * Get graph scores for a set of seed chunks (for hybrid search integration)
 */
export function getGraphScores(
  seedChunkIds: string[],
  options: { types?: RelationshipType[] } = {}
): Map<string, number> {
  const results = traverseGraph(seedChunkIds, {
    maxDepth: 2,
    maxResults: 30,
    followTypes: options.types,
    excludeTypes: ['contradicts'], // Don't pull in contradictions
  });

  const scores = new Map<string, number>();
  for (const r of results) {
    // Normalize path score to 0-1 range
    const normalizedScore = Math.min(1.0, r.pathScore);
    scores.set(r.chunk.id, normalizedScore);
  }

  return scores;
}
