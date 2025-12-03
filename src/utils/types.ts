// =============================================================================
// Visioneer Core Types
// =============================================================================

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export type Phase = 
  | "intake"
  | "research"
  | "planning"
  | "execution"
  | "refinement"
  | "complete";

export type TaskStatus = "ready" | "in_progress" | "blocked" | "done" | "cancelled";

export type QuestionStatus = "open" | "answered";

export type ChunkType = 
  | "research"
  | "insight"
  | "decision"
  | "resource"
  | "attempt"
  | "user_input";

export type Confidence = "verified" | "inferred" | "speculative";

export type Source = "research" | "user" | "deduction" | "experiment";

export type RelationshipType =
  | "supports"
  | "contradicts"
  | "builds_on"
  | "replaces"
  | "requires"
  | "related_to"
  | "caused_by"
  | "depends_on"
  | "example_of"
  | "part_of"
  | "derived_from"
  | "precedes";

export type RelationshipOrigin = "explicit" | "implicit" | "inferred" | "auto";

/**
 * Metadata for relationship types used in graph traversal
 */
export interface RelationshipMetadata {
  directed: boolean;          // Is the relationship directional?
  transitive: boolean;        // Can it be followed transitively? (A->B->C means A->C)
  inverseType?: RelationshipType;  // What type represents the inverse?
  traversalWeight: number;    // Higher = more important for retrieval (0-1)
}

/**
 * Relationship metadata for intelligent graph traversal
 */
export const RELATIONSHIP_METADATA: Record<RelationshipType, RelationshipMetadata> = {
  supports: {
    directed: true,
    transitive: false,
    traversalWeight: 0.8
  },
  contradicts: {
    directed: false,
    transitive: false,
    traversalWeight: 0.9
  },
  builds_on: {
    directed: true,
    transitive: true,
    traversalWeight: 0.85
  },
  replaces: {
    directed: true,
    transitive: true,
    inverseType: 'replaces',
    traversalWeight: 0.7
  },
  requires: {
    directed: true,
    transitive: true,
    inverseType: 'depends_on',
    traversalWeight: 0.9
  },
  related_to: {
    directed: false,
    transitive: false,
    traversalWeight: 0.5
  },
  caused_by: {
    directed: true,
    transitive: true,
    inverseType: 'caused_by',
    traversalWeight: 0.85
  },
  depends_on: {
    directed: true,
    transitive: true,
    inverseType: 'requires',
    traversalWeight: 0.9
  },
  example_of: {
    directed: true,
    transitive: false,
    traversalWeight: 0.7
  },
  part_of: {
    directed: true,
    transitive: true,
    traversalWeight: 0.8
  },
  derived_from: {
    directed: true,
    transitive: false,
    traversalWeight: 0.75
  },
  precedes: {
    directed: true,
    transitive: true,
    traversalWeight: 0.6
  },
};

// ============================================
// PHASE 1 MEMORY TYPES
// ============================================

/**
 * Decay function types
 */
export type DecayFunction = 'exponential' | 'linear' | 'power_law' | 'none';

/**
 * Chunk status for tiered memory
 */
export type ChunkStatus = 'active' | 'warm' | 'cool' | 'cold' | 'archived' | 'tombstone';

/**
 * Learning context stored with each chunk
 * Enables "memory time travel" - context-triggered retrieval boost
 */
export interface LearningContext {
  tick: number;                    // Tick when learned
  task_id: string | null;          // Task being executed
  goal_id: string | null;          // Active goal
  phase: string;                   // Phase (research/planning/execution/etc)
  skill_area: string | null;       // Skill area being worked on
  query_context: string;           // Query/task that prompted learning
  related_chunks: string[];        // Other chunks retrieved at same time
}

/**
 * Tick-based agent state for memory tracking
 * (Distinct from AgentState which tracks runtime status)
 */
export interface TickState {
  project_id: string;
  current_tick: number;
  last_decay_tick: number;
  last_consolidation_tick: number;
  created_at: string;
  updated_at: string;
}

/**
 * Current context for retrieval (used for context boost)
 */
export interface RetrievalContext {
  tick: number;
  task_id: string | null;
  goal_id: string | null;
  phase: string;
  skill_area: string | null;
  query: string;
}

/**
 * Search result with context boost info
 */
export interface BoostedSearchResult {
  chunk: ChunkV2;
  rawSimilarity: number;
  score: number;
  boosted: boolean;
  boostReason?: 'strong_context_match' | 'moderate_context_match' | 'memory_reactivation';
  sources: {
    semantic?: number;
    keyword?: number;
    graph?: number;
  };
}

// -----------------------------------------------------------------------------
// Orientation Layer
// -----------------------------------------------------------------------------

export interface SkillNode {
  skill: string;
  parent: string | null;
  dependencies: string[];
  status: "not_started" | "in_progress" | "achieved";
  notes: string;
}

export interface Decision {
  decision: string;
  reasoning: string;
  date: string; // ISO timestamp
}

export interface Progress {
  area: string;
  status: "not_started" | "early" | "progressing" | "nearly_done" | "complete";
  percent: number | null;
  blockers: string[];
}

export interface Orientation {
  project_id: string;
  vision_summary: string;
  success_criteria: string[];
  constraints: string[];
  skill_map: SkillNode[];
  current_phase: Phase;
  key_decisions: Decision[];
  active_priorities: string[];
  progress_snapshot: Progress[];
  last_rewritten: string; // ISO timestamp
  version: number;
}

// -----------------------------------------------------------------------------
// Working Layer
// -----------------------------------------------------------------------------

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  skill_area: string;
  depends_on: string[];
  blocked_by: string[];
  outcome: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  // Failure tracking for retry logic
  failure_reason: string | null;
  failure_context: FailureContext | null;
  failed_at: string | null;
  // Pivot/cancellation tracking
  cancelled_reason: string | null;
  cancelled_at: string | null;
}

export interface FailureContext {
  toolCalls?: Array<{ name: string; count: number }>;
  partialResults?: string;
  iterations?: number;
  error?: string;
}

export interface Question {
  id: string;
  project_id: string;
  question: string;
  context: string;
  status: QuestionStatus;
  answer: string | null;
  blocks_tasks: string[];
  asked_at: string;
  answered_at: string | null;
}

export interface Activity {
  id: string;
  project_id: string;
  action: string;
  details: Record<string, unknown> | null;
  timestamp: string;
}

export interface Blocker {
  task: Task;
  blocked_by: Question[] | Task[];
  blocker_type: "question" | "dependency";
}

// -----------------------------------------------------------------------------
// Knowledge Layer
// -----------------------------------------------------------------------------

export interface Chunk {
  id: string;
  project_id: string;
  content: string;
  type: ChunkType;
  tags: string[];
  confidence: Confidence;
  source: Source;
  created_at: string;
  last_accessed: string;
  last_useful: string | null;
  embedding?: Float32Array;

  // Phase 1 fields (optional for backward compatibility)
  tick_created?: number;
  tick_last_accessed?: number | null;
  tick_last_useful?: number | null;
  learning_context?: LearningContext;
  initial_strength?: number;
  current_strength?: number;
  decay_function?: DecayFunction;
  decay_rate?: number;
  persistence_score?: number;
  access_count?: number;
  successful_uses?: number;
  status?: ChunkStatus;
  pinned?: boolean;
  superseded_by?: string | null;
  valid_until_tick?: number | null;
}

/**
 * Extended chunk with Phase 1 memory fields (all required)
 */
export interface ChunkV2 extends Omit<Chunk,
  'tick_created' | 'tick_last_accessed' | 'tick_last_useful' | 'learning_context' |
  'initial_strength' | 'current_strength' | 'decay_function' | 'decay_rate' |
  'persistence_score' | 'access_count' | 'successful_uses' | 'status' | 'pinned' |
  'superseded_by' | 'valid_until_tick'
> {
  // Tick-based timing
  tick_created: number;
  tick_last_accessed: number | null;
  tick_last_useful: number | null;

  // Learning context
  learning_context: LearningContext;

  // Strength & Decay
  initial_strength: number;
  current_strength: number;
  decay_function: DecayFunction;
  decay_rate: number;

  // Persistence
  persistence_score: number;
  access_count: number;
  successful_uses: number;

  // Status
  status: ChunkStatus;
  pinned: boolean;

  // Versioning
  superseded_by: string | null;
  valid_until_tick: number | null;
}

export interface Relationship {
  id: string;
  from_chunk_id: string;
  to_chunk_id: string;
  type: RelationshipType;
  weight: number;
  last_activated: string;
  activation_count: number;
  context_tags: string[];
  origin: RelationshipOrigin;
  created_at: string;
}

export interface ChunkWithRelationship {
  chunk: Chunk;
  relationship: Relationship;
  direction: "outgoing" | "incoming";
}

export interface SearchResult {
  chunk: Chunk;
  similarity: number;
}

export interface Contradiction {
  chunk_a: Chunk;
  chunk_b: Chunk;
  relationship: Relationship;
  detected_at: string;
}

// -----------------------------------------------------------------------------
// Project
// -----------------------------------------------------------------------------

export interface Project {
  id: string;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Goals
// -----------------------------------------------------------------------------

export interface Goal {
  id: string;
  project_id: string;
  goal: string;
  active: boolean;
  created_at: string;
  completed_at: string | null;
  outcome: string | null;
}

export interface PendingGoal {
  project_id: string;
  goal: string;
  queued_at: string;
}

// -----------------------------------------------------------------------------
// Coherence Warnings
// -----------------------------------------------------------------------------

export type CoherenceResolution = "executed" | "dismissed" | "modified";

export interface CoherenceWarning {
  id: string;
  task_id: string;
  project_id: string;
  concern: string;
  suggestion: string | null;
  created_at: string;
  resolved: boolean;
  resolution: CoherenceResolution | null;
}

export interface ProjectSummary {
  project_id: string;
  vision_summary: string;
  current_phase: Phase;
  last_updated: string;
}

// -----------------------------------------------------------------------------
// Agent State
// -----------------------------------------------------------------------------

export interface AgentState {
  status: "ready" | "waiting_for_user" | "complete" | "error";
  orientation?: Orientation;
  current_task?: Task | null;
  task_queue?: Task[];
  open_questions?: Question[];
  pending_questions?: Question[];
  message?: string;
  context_loaded: boolean;
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export interface EmbeddingConfig {
  provider: "openai" | "voyage" | "ollama" | "mock";
  model: string;
  dimensions: number;
  batch_size: number;
}

export interface StorageConfig {
  database_path: string;
  backup_enabled: boolean;
  backup_interval_hours: number;
}

export interface OrientationConfig {
  max_tokens: number;
  time_trigger_hours: number;
  activity_trigger_count: number;
  decisions_to_keep: number;
  priorities_to_keep: number;
}

export interface WorkingConfig {
  activity_log_size: number;
  task_history_days: number;
}

export interface KnowledgeConfig {
  min_similarity_threshold: number;
  default_search_limit: number;
  coretrieval_threshold: number;
  implicit_relationship_initial_weight: number;
  strengthen_amount: number;
  weaken_amount: number;
  archive_weight_threshold: number;
}

export interface RetrievalConfig {
  recency_boost_halflife_days: number;
  confidence_weights: {
    verified: number;
    inferred: number;
    speculative: number;
  };
}

export interface AgentConfig {
  model: string;
  max_tasks_per_session: number;
  question_batch_threshold: number;
}

export interface WebSearchConfig {
  enabled: boolean;
  provider: "serper" | "tavily" | "serpapi";
  max_results: number;
}

export interface WebFetchConfig {
  enabled: boolean;
  max_content_length: number;
}

export interface ArtifactsConfig {
  enabled: boolean;
  directory: string;
}

export interface ToolsConfig {
  web_search: WebSearchConfig;
  web_fetch: WebFetchConfig;
  artifacts: ArtifactsConfig;
}

export interface VisioneerConfig {
  version: string;
  embedding: EmbeddingConfig;
  storage: StorageConfig;
  orientation: OrientationConfig;
  working: WorkingConfig;
  knowledge: KnowledgeConfig;
  retrieval: RetrievalConfig;
  agent: AgentConfig;
  tools?: ToolsConfig;
}
