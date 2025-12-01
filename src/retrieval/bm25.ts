import { create, insert, remove, search } from '@orama/orama';
import type { Orama, Results, SearchParams } from '@orama/orama';
import { getDatabase, prepareStatement } from '../db/connection.js';
import { ChunkV2, LearningContext } from '../utils/types.js';

// Define the schema type for our index
interface ChunkSchema {
  id: string;
  projectId: string;
  content: string;
  type: string;
  tags: string[];
}

type ChunkIndex = Orama<{
  id: 'string';
  projectId: 'string';
  content: 'string';
  type: 'string';
  tags: 'string[]';
}>;

let bm25Index: ChunkIndex | null = null;

/**
 * Initialize BM25 index
 */
async function initIndex(): Promise<ChunkIndex> {
  return create({
    schema: {
      id: 'string',
      projectId: 'string',
      content: 'string',
      type: 'string',
      tags: 'string[]',
    } as const,
    // Note: Orama v3 doesn't support stemming/stopWords config in this format
    // The default tokenizer handles these automatically
  });
}

/**
 * Get or create the BM25 index
 */
export async function getBM25Index(): Promise<ChunkIndex> {
  if (!bm25Index) {
    bm25Index = await initIndex();
  }
  return bm25Index;
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
 * Index a single chunk
 */
export async function indexChunk(chunk: ChunkV2): Promise<void> {
  const index = await getBM25Index();

  try {
    await insert(index, {
      id: chunk.id,
      projectId: chunk.project_id,
      content: chunk.content,
      type: chunk.type,
      tags: chunk.tags,
    });
  } catch (error) {
    // Ignore duplicate key errors
    console.warn(`Failed to index chunk ${chunk.id}:`, error);
  }
}

/**
 * Remove a chunk from index
 */
export async function removeFromIndex(chunkId: string): Promise<void> {
  const index = await getBM25Index();
  try {
    await remove(index, chunkId);
  } catch {
    // Ignore if not found
  }
}

/**
 * Rebuild index from database
 */
export async function rebuildBM25Index(projectId?: string): Promise<number> {
  // Reset index
  bm25Index = await initIndex();

  const db = getDatabase();

  const sql = projectId
    ? `SELECT * FROM chunks WHERE project_id = ? AND status = 'active'`
    : `SELECT * FROM chunks WHERE status = 'active'`;

  const stmt = projectId
    ? prepareStatement(sql)
    : db.prepare(sql);

  const rows = (projectId ? stmt.all(projectId) : stmt.all()) as Record<string, unknown>[];

  for (const row of rows) {
    const chunk = rowToChunkV2(row);
    await indexChunk(chunk);
  }

  console.log(`BM25 index rebuilt with ${rows.length} chunks`);
  return rows.length;
}

/**
 * BM25 search result
 */
export interface BM25Result {
  chunkId: string;
  score: number;
}

/**
 * Search using BM25
 */
export async function searchBM25(
  query: string,
  projectId: string,
  options: {
    limit?: number;
    types?: string[];
  } = {}
): Promise<BM25Result[]> {
  const index = await getBM25Index();
  const { limit = 50, types } = options;

  // Search without filters first, then filter results manually
  // (Orama v3 where clause can be problematic)
  const results = await search(index, {
    term: query,
    limit: limit * 10, // Get more results to filter
  });

  // Filter by projectId and types manually
  const filtered = results.hits.filter(hit => {
    const doc = hit.document as ChunkSchema;
    if (doc.projectId !== projectId) return false;
    if (types && types.length > 0 && !types.includes(doc.type)) return false;
    return true;
  });

  return filtered.slice(0, limit).map(hit => ({
    chunkId: (hit.document as ChunkSchema).id,
    score: hit.score,
  }));
}

/**
 * Check if the BM25 index is initialized and has documents
 */
export async function isBM25IndexReady(): Promise<boolean> {
  if (!bm25Index) return false;

  // Do a simple search to check if index has documents
  try {
    const results = await search(bm25Index, {
      term: '',
      limit: 1,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the count of documents in the BM25 index
 */
export async function getBM25IndexCount(): Promise<number> {
  if (!bm25Index) return 0;

  try {
    const results = await search(bm25Index, {
      term: '',
      limit: 0,
    });
    return results.count;
  } catch {
    return 0;
  }
}
