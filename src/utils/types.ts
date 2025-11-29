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

export type TaskStatus = "ready" | "in_progress" | "blocked" | "done";

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
  | "related_to";

export type RelationshipOrigin = "explicit" | "implicit";

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
