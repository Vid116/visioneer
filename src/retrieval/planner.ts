/**
 * Query Planner & Retrieval System
 *
 * Analyzes queries and routes them to the appropriate retrieval mechanism:
 * - Operational queries → Working layer (structured SQL)
 * - Lookup queries → Tag filter + keyword match
 * - Exploration queries → Semantic search
 * - Connection queries → Relationship traversal
 * - Hybrid queries → Combination of above
 */

import {
  getTasks,
  getQuestions,
  searchChunksByTags,
  searchSemantic,
  getRelationships,
  getChunk,
  getRecentActivity,
} from "../db/queries.js";
import { embed } from "../embedding/index.js";
import { getKnowledgeConfig, getRetrievalConfig } from "../utils/config.js";
import { Chunk, Task, Question, Relationship, Activity, TaskStatus } from "../utils/types.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export type QueryType =
  | "operational"
  | "lookup"
  | "exploration"
  | "connection"
  | "hybrid";

export interface QueryPlan {
  type: QueryType;
  target: "working_layer" | "knowledge_layer" | "both";
  method: string;
  params: Record<string, unknown>;
  explanation: string;
}

export interface RetrievalResult {
  chunks: ScoredChunk[];
  tasks?: Task[];
  questions?: Question[];
  activities?: Activity[];
  plan: QueryPlan;
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
  source: "semantic" | "tags" | "relationship";
}

// =============================================================================
// Query Analysis Patterns
// =============================================================================

const OPERATIONAL_PATTERNS = [
  /what('s| is| are) blocked/i,
  /what .* blocked/i,
  /what can i do/i,
  /open questions/i,
  /pending tasks/i,
  /current status/i,
  /what('s| is| are) ready/i,
  /in progress/i,
  /recent activity/i,
];

const LOOKUP_PATTERNS = [
  /what did we decide/i,
  /the decision (about|on|for)/i,
  /resource for/i,
  /find the/i,
  /get the/i,
  /show me the/i,
];

const CONNECTION_PATTERNS = [
  /what contradicts/i,
  /what supports/i,
  /what builds on/i,
  /related to/i,
  /connections? (to|for|with)/i,
  /what requires/i,
];

const EXPLORATION_PATTERNS = [
  /what do (i|we) know about/i,
  /everything (on|about)/i,
  /tell me about/i,
  /explain/i,
  /how does .* work/i,
];

// =============================================================================
// Query Type Detection
// =============================================================================

function detectQueryType(query: string): QueryType {
  const normalizedQuery = query.toLowerCase().trim();

  // Check operational patterns
  for (const pattern of OPERATIONAL_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return "operational";
    }
  }

  // Check lookup patterns
  for (const pattern of LOOKUP_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return "lookup";
    }
  }

  // Check connection patterns
  for (const pattern of CONNECTION_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return "connection";
    }
  }

  // Check exploration patterns
  for (const pattern of EXPLORATION_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return "exploration";
    }
  }

  // Default to hybrid for ambiguous queries
  return "hybrid";
}

// =============================================================================
// Plan Generation
// =============================================================================

export function planQuery(query: string, context?: { projectId?: string }): QueryPlan {
  const queryType = detectQueryType(query);

  switch (queryType) {
    case "operational":
      return {
        type: "operational",
        target: "working_layer",
        method: "structured_query",
        params: extractOperationalParams(query),
        explanation: `Operational query detected. Using structured queries on working layer.`,
      };

    case "lookup":
      return {
        type: "lookup",
        target: "knowledge_layer",
        method: "tag_filter",
        params: extractLookupParams(query),
        explanation: `Lookup query detected. Using tag-based filtering.`,
      };

    case "connection":
      return {
        type: "connection",
        target: "knowledge_layer",
        method: "relationship_traversal",
        params: extractConnectionParams(query),
        explanation: `Connection query detected. Using relationship traversal.`,
      };

    case "exploration":
      return {
        type: "exploration",
        target: "knowledge_layer",
        method: "semantic_search",
        params: { query: extractSemanticQuery(query) },
        explanation: `Exploration query detected. Using semantic search.`,
      };

    case "hybrid":
    default:
      return {
        type: "hybrid",
        target: "both",
        method: "semantic_then_filter_then_expand",
        params: extractHybridParams(query),
        explanation: `Ambiguous query. Using hybrid approach: semantic search + filtering + relationship expansion.`,
      };
  }
}

// =============================================================================
// Parameter Extraction
// =============================================================================

function extractOperationalParams(query: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (/blocked/i.test(query)) {
    params.taskStatus = "blocked";
  } else if (/ready|can i do/i.test(query)) {
    params.taskStatus = "ready";
  } else if (/in progress/i.test(query)) {
    params.taskStatus = "in_progress";
  } else if (/questions/i.test(query)) {
    params.questionStatus = "open";
  } else if (/activity/i.test(query)) {
    params.activityLimit = 20;
  }

  return params;
}

function extractLookupParams(query: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Extract potential tags from query
  const tags: string[] = [];

  // Common tag patterns
  if (/decision/i.test(query)) tags.push("decision");
  if (/resource/i.test(query)) tags.push("resource");
  if (/research/i.test(query)) tags.push("research");
  if (/insight/i.test(query)) tags.push("insight");

  // Extract quoted strings as potential tags
  const quoted = query.match(/"([^"]+)"/g);
  if (quoted) {
    tags.push(...quoted.map((q) => q.replace(/"/g, "")));
  }

  params.tags = tags;
  params.types = tags.filter((t) => ["decision", "resource", "research", "insight", "attempt"].includes(t));

  return params;
}

function extractConnectionParams(query: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Determine relationship type
  if (/contradicts/i.test(query)) {
    params.relationshipType = "contradicts";
  } else if (/supports/i.test(query)) {
    params.relationshipType = "supports";
  } else if (/builds on/i.test(query)) {
    params.relationshipType = "builds_on";
  } else if (/requires/i.test(query)) {
    params.relationshipType = "requires";
  } else {
    params.relationshipType = "related_to";
  }

  return params;
}

function extractSemanticQuery(query: string): string {
  // Remove common query prefixes
  return query
    .replace(/what do (i|we) know about/i, "")
    .replace(/everything (on|about)/i, "")
    .replace(/tell me about/i, "")
    .replace(/explain/i, "")
    .replace(/how does/i, "")
    .replace(/work\??$/i, "")
    .trim();
}

function extractHybridParams(query: string): Record<string, unknown> {
  return {
    semanticQuery: query,
    limit: 20,
    expandLimit: 5,
    minWeight: 0.6,
  };
}

// =============================================================================
// Query Execution
// =============================================================================

export async function executeQuery(
  projectId: string,
  query: string,
  options?: {
    limit?: number;
    minSimilarity?: number;
    includeRelated?: boolean;
  }
): Promise<RetrievalResult> {
  const plan = planQuery(query, { projectId });
  const config = getKnowledgeConfig();
  const retrievalConfig = getRetrievalConfig();

  const limit = options?.limit || config.default_search_limit;
  const minSimilarity = options?.minSimilarity || config.min_similarity_threshold;

  dbLogger.debug("Executing query plan", { query, plan: plan.type, method: plan.method });

  switch (plan.type) {
    case "operational":
      return executeOperationalQuery(projectId, plan);

    case "lookup":
      return executeLookupQuery(projectId, plan, limit);

    case "connection":
      return executeConnectionQuery(projectId, plan, limit);

    case "exploration":
      return executeExplorationQuery(projectId, plan, limit, minSimilarity);

    case "hybrid":
    default:
      return executeHybridQuery(projectId, plan, limit, minSimilarity, retrievalConfig);
  }
}

// =============================================================================
// Execution Implementations
// =============================================================================

async function executeOperationalQuery(
  projectId: string,
  plan: QueryPlan
): Promise<RetrievalResult> {
  const result: RetrievalResult = {
    chunks: [],
    plan,
  };

  const params = plan.params;

  if (params.taskStatus) {
    result.tasks = getTasks(projectId, params.taskStatus as TaskStatus);
  }

  if (params.questionStatus) {
    result.questions = getQuestions(projectId, params.questionStatus as "open" | "answered");
  }

  if (params.activityLimit) {
    result.activities = getRecentActivity(projectId, params.activityLimit as number);
  }

  // If no specific filter, get overview
  if (!params.taskStatus && !params.questionStatus && !params.activityLimit) {
    result.tasks = getTasks(projectId);
    result.questions = getQuestions(projectId, "open");
    result.activities = getRecentActivity(projectId, 10);
  }

  return result;
}

async function executeLookupQuery(
  projectId: string,
  plan: QueryPlan,
  limit: number
): Promise<RetrievalResult> {
  const params = plan.params;
  const tags = (params.tags as string[]) || [];
  const types = (params.types as string[]) || undefined;

  const chunks = searchChunksByTags(projectId, tags, undefined, undefined, limit);

  return {
    chunks: chunks.map((chunk) => ({
      chunk,
      score: 1.0, // Exact tag match
      source: "tags" as const,
    })),
    plan,
  };
}

async function executeConnectionQuery(
  projectId: string,
  plan: QueryPlan,
  limit: number
): Promise<RetrievalResult> {
  const params = plan.params;
  const relationshipType = params.relationshipType as string | undefined;

  // For connection queries, we need a starting chunk
  // This would typically come from context, but for now we'll search semantically first
  const allChunks = searchChunksByTags(projectId, [], undefined, undefined, limit);

  const results: ScoredChunk[] = [];

  for (const chunk of allChunks) {
    const relationships = getRelationships(
      chunk.id,
      relationshipType as any,
      0.1,
      "both",
      10
    );

    for (const { relationship, direction } of relationships) {
      const relatedId =
        direction === "outgoing"
          ? relationship.to_chunk_id
          : relationship.from_chunk_id;

      const relatedChunk = getChunk(relatedId);
      if (relatedChunk) {
        results.push({
          chunk: relatedChunk,
          score: relationship.weight,
          source: "relationship",
        });
      }
    }
  }

  // Deduplicate and sort by score
  const seen = new Set<string>();
  const dedupedResults = results.filter((r) => {
    if (seen.has(r.chunk.id)) return false;
    seen.add(r.chunk.id);
    return true;
  });

  dedupedResults.sort((a, b) => b.score - a.score);

  return {
    chunks: dedupedResults.slice(0, limit),
    plan,
  };
}

async function executeExplorationQuery(
  projectId: string,
  plan: QueryPlan,
  limit: number,
  minSimilarity: number
): Promise<RetrievalResult> {
  const semanticQuery = plan.params.query as string;
  const queryEmbedding = await embed(semanticQuery);

  const searchResults = searchSemantic(projectId, queryEmbedding, limit, minSimilarity);

  const chunks: ScoredChunk[] = [];
  for (const result of searchResults) {
    const chunk = getChunk(result.chunkId);
    if (chunk) {
      chunks.push({
        chunk,
        score: result.similarity,
        source: "semantic",
      });
    }
  }

  return {
    chunks,
    plan,
  };
}

async function executeHybridQuery(
  projectId: string,
  plan: QueryPlan,
  limit: number,
  minSimilarity: number,
  retrievalConfig: ReturnType<typeof getRetrievalConfig>
): Promise<RetrievalResult> {
  const params = plan.params;
  const semanticQuery = params.semanticQuery as string;
  const expandLimit = (params.expandLimit as number) || 5;
  const minWeight = (params.minWeight as number) || 0.6;

  // Step 1: Semantic Search (broad)
  const queryEmbedding = await embed(semanticQuery);
  const semanticResults = searchSemantic(projectId, queryEmbedding, limit * 2, minSimilarity * 0.8);

  const chunks: ScoredChunk[] = [];
  const chunkIds = new Set<string>();

  for (const result of semanticResults) {
    const chunk = getChunk(result.chunkId);
    if (chunk) {
      chunks.push({
        chunk,
        score: result.similarity,
        source: "semantic",
      });
      chunkIds.add(chunk.id);
    }
  }

  // Step 2: Expand via relationships (enrich)
  const topChunks = chunks.slice(0, expandLimit);

  for (const scoredChunk of topChunks) {
    const relationships = getRelationships(scoredChunk.chunk.id, undefined, minWeight, "both", 5);

    for (const { relationship, direction } of relationships) {
      const relatedId =
        direction === "outgoing"
          ? relationship.to_chunk_id
          : relationship.from_chunk_id;

      if (chunkIds.has(relatedId)) continue;

      const relatedChunk = getChunk(relatedId);
      if (relatedChunk) {
        // Score based on original similarity + relationship weight
        const combinedScore = scoredChunk.score * 0.7 + relationship.weight * 0.3;
        chunks.push({
          chunk: relatedChunk,
          score: combinedScore,
          source: "relationship",
        });
        chunkIds.add(relatedId);
      }
    }
  }

  // Step 3: Apply confidence weighting
  for (const scoredChunk of chunks) {
    const confidenceWeight =
      retrievalConfig.confidence_weights[scoredChunk.chunk.confidence] || 0.5;
    scoredChunk.score *= confidenceWeight;
  }

  // Step 4: Sort and limit
  chunks.sort((a, b) => b.score - a.score);

  return {
    chunks: chunks.slice(0, limit),
    plan,
  };
}
