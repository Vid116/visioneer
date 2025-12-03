import { v4 as uuidv4 } from "uuid";
import { prepareStatement, withTransaction, getDatabase } from "./connection.js";
import { storeEmbedding as storeVectorEmbedding, searchSimilar } from "./vector-store.js";
import {
  Project,
  Orientation,
  Task,
  TaskStatus,
  Question,
  QuestionStatus,
  Activity,
  Chunk,
  ChunkType,
  Confidence,
  Source,
  Relationship,
  RelationshipType,
  RelationshipOrigin,
  Goal,
  PendingGoal,
  CoherenceWarning,
  CoherenceResolution,
  DecayFunction,
  ChunkStatus,
  LearningContext,
} from "../utils/types.js";
import { dbLogger } from "../utils/logger.js";
import { emitChunkCreated, emitRelationshipCreated } from "../events/event-bus.js";
import {
  batchScoreRelationships,
  isRerankerAvailable,
} from "../retrieval/reranker.js";

// =============================================================================
// Projects
// =============================================================================

export function createProject(): Project {
  const id = uuidv4();
  const stmt = prepareStatement(`
    INSERT INTO projects (id) VALUES (?)
  `);
  stmt.run(id);
  
  dbLogger.debug("Created project", { id });
  
  return {
    id,
    created_at: new Date().toISOString(),
  };
}

export function getProject(id: string): Project | null {
  const stmt = prepareStatement(`
    SELECT id, created_at FROM projects WHERE id = ?
  `);
  const row = stmt.get(id) as { id: string; created_at: string } | undefined;
  
  if (!row) return null;
  
  return {
    id: row.id,
    created_at: row.created_at,
  };
}

export function listProjects(): Project[] {
  const stmt = prepareStatement(`
    SELECT id, created_at FROM projects ORDER BY created_at DESC
  `);
  return stmt.all() as Project[];
}

// =============================================================================
// Orientation
// =============================================================================

export function getOrientation(projectId: string): Orientation | null {
  const stmt = prepareStatement(`
    SELECT content FROM orientation WHERE project_id = ?
  `);
  const row = stmt.get(projectId) as { content: string } | undefined;
  
  if (!row) return null;
  
  return JSON.parse(row.content) as Orientation;
}

export function saveOrientation(orientation: Orientation): void {
  const stmt = prepareStatement(`
    INSERT INTO orientation (project_id, content, last_rewritten, version)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (project_id) DO UPDATE SET
      content = excluded.content,
      last_rewritten = excluded.last_rewritten,
      version = excluded.version
  `);
  
  stmt.run(
    orientation.project_id,
    JSON.stringify(orientation),
    orientation.last_rewritten,
    orientation.version
  );
  
  dbLogger.debug("Saved orientation", { 
    projectId: orientation.project_id, 
    version: orientation.version 
  });
}

// =============================================================================
// Tasks
// =============================================================================

export function createTask(
  projectId: string,
  title: string,
  description: string,
  skillArea: string,
  dependsOn: string[] = []
): Task {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  // Determine initial status based on dependencies
  let status: TaskStatus = "ready";
  if (dependsOn.length > 0) {
    const incompleteDeps = getIncompleteDependencies(dependsOn);
    if (incompleteDeps.length > 0) {
      status = "blocked";
    }
  }
  
  const stmt = prepareStatement(`
    INSERT INTO tasks (id, project_id, title, description, skill_area, status, depends_on, blocked_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    projectId,
    title,
    description,
    skillArea,
    status,
    JSON.stringify(dependsOn),
    JSON.stringify([]),
    now,
    now
  );
  
  dbLogger.debug("Created task", { id, title, status });
  
  return {
    id,
    project_id: projectId,
    title,
    description,
    status,
    skill_area: skillArea,
    depends_on: dependsOn,
    blocked_by: [],
    outcome: null,
    created_at: now,
    updated_at: now,
    started_at: null,
    completed_at: null,
    failure_reason: null,
    failure_context: null,
    failed_at: null,
    cancelled_reason: null,
    cancelled_at: null,
  };
}

export function getTask(taskId: string): Task | null {
  const stmt = prepareStatement(`
    SELECT * FROM tasks WHERE id = ?
  `);
  const row = stmt.get(taskId) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  return rowToTask(row);
}

export function getTasks(
  projectId: string,
  status?: TaskStatus,
  skillArea?: string
): Task[] {
  let sql = "SELECT * FROM tasks WHERE project_id = ?";
  const params: unknown[] = [projectId];
  
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  
  if (skillArea) {
    sql += " AND skill_area = ?";
    params.push(skillArea);
  }
  
  sql += " ORDER BY created_at ASC";
  
  const stmt = getDatabase().prepare(sql);
  const rows = stmt.all(...params) as Record<string, unknown>[];
  
  return rows.map(rowToTask);
}

export function updateTask(
  taskId: string,
  updates: Partial<{
    status: TaskStatus;
    blocked_by: string[];
    description: string;
    outcome: string;
    failure_reason: string | null;
    failure_context: Record<string, unknown> | null;
    failed_at: string | null;
  }>
): Task | null {
  const task = getTask(taskId);
  if (!task) return null;

  const now = new Date().toISOString();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);

    if (updates.status === "in_progress" && !task.started_at) {
      sets.push("started_at = ?");
      params.push(now);
    }

    if (updates.status === "done") {
      sets.push("completed_at = ?");
      params.push(now);

      // Check and unblock dependent tasks after this update completes
      setTimeout(() => unblockDependentTasks(taskId), 0);
    }

    // Clear failure fields when task becomes ready or done
    if (updates.status === "ready" || updates.status === "done") {
      sets.push("failure_reason = NULL, failure_context = NULL, failed_at = NULL");
    }
  }

  if (updates.blocked_by !== undefined) {
    sets.push("blocked_by = ?");
    params.push(JSON.stringify(updates.blocked_by));
  }

  if (updates.description !== undefined) {
    sets.push("description = ?");
    params.push(updates.description);
  }

  if (updates.outcome !== undefined) {
    sets.push("outcome = ?");
    params.push(updates.outcome);
  }

  // Handle failure fields
  if (updates.failure_reason !== undefined) {
    sets.push("failure_reason = ?");
    params.push(updates.failure_reason);
  }

  if (updates.failure_context !== undefined) {
    sets.push("failure_context = ?");
    params.push(updates.failure_context ? JSON.stringify(updates.failure_context) : null);
  }

  if (updates.failed_at !== undefined) {
    sets.push("failed_at = ?");
    params.push(updates.failed_at);
  }

  if (sets.length === 0) return task;

  params.push(taskId);

  const sql = `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`;
  getDatabase().prepare(sql).run(...params);

  dbLogger.debug("Updated task", { taskId, updates });

  return getTask(taskId);
}

function getIncompleteDependencies(taskIds: string[]): string[] {
  if (taskIds.length === 0) return [];

  const placeholders = taskIds.map(() => "?").join(",");
  const stmt = getDatabase().prepare(`
    SELECT id FROM tasks WHERE id IN (${placeholders}) AND status != 'done'
  `);

  const rows = stmt.all(...taskIds) as { id: string }[];
  return rows.map(r => r.id);
}

/**
 * Checks for tasks that depend on the given completed task
 * and unblocks them if all their dependencies are now complete.
 */
function unblockDependentTasks(completedTaskId: string): void {
  // Find all blocked tasks that depend on this task
  const stmt = getDatabase().prepare(`
    SELECT * FROM tasks
    WHERE status = 'blocked'
    AND depends_on LIKE ?
  `);

  const rows = stmt.all(`%${completedTaskId}%`) as Record<string, unknown>[];

  for (const row of rows) {
    const task = rowToTask(row);
    const incompleteDeps = getIncompleteDependencies(task.depends_on);

    // If no incomplete dependencies and not blocked by questions, unblock
    if (incompleteDeps.length === 0 && task.blocked_by.length === 0) {
      getDatabase().prepare(`
        UPDATE tasks SET status = 'ready' WHERE id = ?
      `).run(task.id);

      dbLogger.debug("Unblocked task after dependency completed", {
        taskId: task.id,
        title: task.title,
        completedDep: completedTaskId,
      });
    }
  }
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as TaskStatus,
    skill_area: row.skill_area as string,
    depends_on: JSON.parse((row.depends_on as string) || "[]"),
    blocked_by: JSON.parse((row.blocked_by as string) || "[]"),
    outcome: row.outcome as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    started_at: row.started_at as string | null,
    completed_at: row.completed_at as string | null,
    failure_reason: row.failure_reason as string | null,
    failure_context: row.failure_context
      ? JSON.parse(row.failure_context as string)
      : null,
    failed_at: row.failed_at as string | null,
    cancelled_reason: row.cancelled_reason as string | null,
    cancelled_at: row.cancelled_at as string | null,
  };
}

/**
 * Cancels all non-done tasks for a project due to a pivot.
 * Tasks that are already 'done' are preserved as completed work.
 *
 * @param projectId The project ID
 * @param reason The reason for cancellation (user feedback)
 * @returns Number of tasks cancelled
 */
export function cancelTasksForPivot(projectId: string, reason: string): number {
  const now = new Date().toISOString();

  const stmt = prepareStatement(`
    UPDATE tasks
    SET status = 'cancelled',
        cancelled_reason = ?,
        cancelled_at = ?
    WHERE project_id = ?
      AND status NOT IN ('done', 'cancelled')
  `);

  const result = stmt.run(reason, now, projectId);

  dbLogger.info("Cancelled tasks for pivot", {
    projectId,
    cancelledCount: result.changes,
    reason: reason.slice(0, 100),
  });

  return result.changes;
}

// =============================================================================
// Questions
// =============================================================================

export function createQuestion(
  projectId: string,
  question: string,
  context: string,
  blocksTasks: string[] = []
): Question {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const stmt = prepareStatement(`
    INSERT INTO questions (id, project_id, question, context, status, blocks_tasks, asked_at)
    VALUES (?, ?, ?, ?, 'open', ?, ?)
  `);
  
  stmt.run(id, projectId, question, context, JSON.stringify(blocksTasks), now);
  
  // Mark blocked tasks
  if (blocksTasks.length > 0) {
    for (const taskId of blocksTasks) {
      const task = getTask(taskId);
      if (task) {
        const newBlockedBy = [...task.blocked_by, id];
        updateTask(taskId, { status: "blocked", blocked_by: newBlockedBy });
      }
    }
  }
  
  dbLogger.debug("Created question", { id, blocksTasks });
  
  return {
    id,
    project_id: projectId,
    question,
    context,
    status: "open",
    answer: null,
    blocks_tasks: blocksTasks,
    asked_at: now,
    answered_at: null,
  };
}

export function getQuestion(questionId: string): Question | null {
  const stmt = prepareStatement(`
    SELECT * FROM questions WHERE id = ?
  `);
  const row = stmt.get(questionId) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  return rowToQuestion(row);
}

export function getQuestions(
  projectId: string,
  status?: QuestionStatus
): Question[] {
  let sql = "SELECT * FROM questions WHERE project_id = ?";
  const params: unknown[] = [projectId];
  
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  
  sql += " ORDER BY asked_at ASC";
  
  const stmt = getDatabase().prepare(sql);
  const rows = stmt.all(...params) as Record<string, unknown>[];
  
  return rows.map(rowToQuestion);
}

/**
 * Result of answering a question, including pivot detection.
 */
export interface AnswerQuestionResult {
  question: Question;
  unblockedTasks: Task[];
  chunk: Chunk;
  pivotDetected: boolean;
  pivotSignals: string[];
}

export function answerQuestion(
  questionId: string,
  answer: string
): AnswerQuestionResult {
  const now = new Date().toISOString();

  // First get the question to access project_id and context
  const questionBefore = getQuestion(questionId);
  if (!questionBefore) {
    throw new Error(`Question not found: ${questionId}`);
  }

  const stmt = prepareStatement(`
    UPDATE questions SET status = 'answered', answer = ?, answered_at = ?
    WHERE id = ?
  `);
  stmt.run(answer, now, questionId);

  const question = getQuestion(questionId)!;
  const unblockedTasks: Task[] = [];

  // Import pivot detection (deferred to avoid circular dependency)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { detectPivotSignals, extractPivotSignals } = require("../agent/orientation-rewrite.js");

  // Check for pivot signals in the answer
  const pivotDetected = detectPivotSignals(answer);
  const pivotSignals = pivotDetected ? extractPivotSignals(answer) : [];

  if (pivotDetected) {
    dbLogger.info("Pivot detected in user answer - triggering orientation rewrite", {
      questionId,
      projectId: question.project_id,
      pivotSignals,
      answerPreview: answer.slice(0, 100),
    });
  }

  // Check each blocked task
  for (const taskId of question.blocks_tasks) {
    const task = getTask(taskId);
    if (!task) continue;

    const remainingBlockers = task.blocked_by.filter(qId => qId !== questionId);

    if (remainingBlockers.length === 0) {
      // Check if all dependencies are also done
      const incompleteDeps = getIncompleteDependencies(task.depends_on);

      if (incompleteDeps.length === 0) {
        updateTask(taskId, { status: "ready", blocked_by: [] });
        unblockedTasks.push(getTask(taskId)!);
      } else {
        updateTask(taskId, { blocked_by: remainingBlockers });
      }
    } else {
      updateTask(taskId, { blocked_by: remainingBlockers });
    }
  }

  // Store user answer as a knowledge chunk for retrieval during task execution
  // This ensures the agent sees the user's feedback when working on unblocked tasks
  const chunkContent = `USER FEEDBACK on "${question.question}":\n${answer}`;
  const tags = ["user_answer", "feedback", "user_input"];

  // Add pivot tag if detected
  if (pivotDetected) {
    tags.push("pivot", "direction_change");
  }

  // Add task-related tags for better retrieval
  for (const taskId of question.blocks_tasks) {
    tags.push(`task:${taskId}`);
  }

  // Add context-derived tags if available
  if (question.context) {
    // Extract keywords from context (simple approach)
    const contextWords = question.context
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 5);
    tags.push(...contextWords);
  }

  const chunk = storeChunk(
    question.project_id,
    chunkContent,
    "user_input",
    tags,
    "verified",  // User input is always verified
    "user"
  );

  dbLogger.debug("Answered question and created chunk", {
    questionId,
    unblockedCount: unblockedTasks.length,
    chunkId: chunk.id,
    pivotDetected,
  });

  return { question, unblockedTasks, chunk, pivotDetected, pivotSignals };
}

function rowToQuestion(row: Record<string, unknown>): Question {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    question: row.question as string,
    context: row.context as string,
    status: row.status as QuestionStatus,
    answer: row.answer as string | null,
    blocks_tasks: JSON.parse((row.blocks_tasks as string) || "[]"),
    asked_at: row.asked_at as string,
    answered_at: row.answered_at as string | null,
  };
}

/**
 * Get all answered questions that were blocking a specific task.
 * Used to include user feedback in task execution prompts.
 */
export function getAnswersForTask(taskId: string): Question[] {
  // Find all questions where blocks_tasks contains this taskId
  // SQLite JSON handling: blocks_tasks is a JSON array stored as TEXT
  const stmt = prepareStatement(`
    SELECT * FROM questions
    WHERE status = 'answered'
      AND blocks_tasks LIKE ?
    ORDER BY answered_at DESC
  `);

  // Search for the taskId within the JSON array
  const rows = stmt.all(`%${taskId}%`) as Record<string, unknown>[];

  // Filter to ensure exact match within the JSON array (not substring match)
  return rows
    .map(rowToQuestion)
    .filter(q => q.blocks_tasks.includes(taskId));
}

/**
 * Get recently answered questions for a project (for general context).
 * Useful for including recent user decisions in any task.
 */
export function getRecentAnswers(projectId: string, limit: number = 5): Question[] {
  const stmt = prepareStatement(`
    SELECT * FROM questions
    WHERE project_id = ?
      AND status = 'answered'
    ORDER BY answered_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(projectId, limit) as Record<string, unknown>[];
  return rows.map(rowToQuestion);
}

// =============================================================================
// Activities
// =============================================================================

export function logActivity(
  projectId: string,
  action: string,
  details?: Record<string, unknown>
): Activity {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const stmt = prepareStatement(`
    INSERT INTO activities (id, project_id, action, details, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, projectId, action, details ? JSON.stringify(details) : null, now);
  
  return {
    id,
    project_id: projectId,
    action,
    details: details || null,
    timestamp: now,
  };
}

export function getRecentActivity(projectId: string, limit: number = 20): Activity[] {
  const stmt = prepareStatement(`
    SELECT * FROM activities 
    WHERE project_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  
  const rows = stmt.all(projectId, limit) as Record<string, unknown>[];
  
  return rows.map(row => ({
    id: row.id as string,
    project_id: row.project_id as string,
    action: row.action as string,
    details: row.details ? JSON.parse(row.details as string) : null,
    timestamp: row.timestamp as string,
  }));
}

// =============================================================================
// Chunks
// =============================================================================

export function storeChunk(
  projectId: string,
  content: string,
  type: ChunkType,
  tags: string[],
  confidence: Confidence,
  source: Source,
  embedding?: Float32Array
): Chunk {
  const id = uuidv4();
  const now = new Date().toISOString();

  return withTransaction(() => {
    const stmt = prepareStatement(`
      INSERT INTO chunks (id, project_id, content, type, tags, confidence, source, created_at, last_accessed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, projectId, content, type, JSON.stringify(tags), confidence, source, now, now);

    // Store embedding in vector store if provided
    if (embedding) {
      storeVectorEmbedding(id, projectId, embedding);
    }

    dbLogger.debug("Stored chunk", { id, type, confidence, hasEmbedding: !!embedding });

    return {
      id,
      project_id: projectId,
      content,
      type,
      tags,
      confidence,
      source,
      created_at: now,
      last_accessed: now,
      last_useful: null,
    };
  });
}

/**
 * Phase 1 memory options for chunk storage
 */
export interface ChunkV2Options {
  tick_created: number;
  learning_context: string; // JSON serialized LearningContext
  decay_function: DecayFunction;
  decay_rate: number;
  initial_strength?: number;
  persistence_score?: number;
  pinned?: boolean;
}

/**
 * Store a chunk with Phase 1 memory fields
 */
export function storeChunkV2(
  projectId: string,
  content: string,
  type: ChunkType,
  tags: string[],
  confidence: Confidence,
  source: Source,
  embedding: Float32Array | undefined,
  options: ChunkV2Options
): Chunk {
  const id = uuidv4();
  const now = new Date().toISOString();

  return withTransaction(() => {
    const stmt = prepareStatement(`
      INSERT INTO chunks (
        id, project_id, content, type, tags, confidence, source,
        created_at, last_accessed,
        tick_created, tick_last_accessed, learning_context,
        initial_strength, current_strength, decay_function, decay_rate,
        persistence_score, access_count, successful_uses,
        status, pinned
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialStrength = options.initial_strength ?? 1.0;
    const persistenceScore = options.persistence_score ?? 0.5;

    stmt.run(
      id,
      projectId,
      content,
      type,
      JSON.stringify(tags),
      confidence,
      source,
      now,
      now,
      options.tick_created,
      options.tick_created, // tick_last_accessed = tick_created initially
      options.learning_context,
      initialStrength,
      initialStrength, // current_strength = initial_strength initially
      options.decay_function,
      options.decay_rate,
      persistenceScore,
      0, // access_count
      0, // successful_uses
      'active' as ChunkStatus,
      options.pinned ? 1 : 0
    );

    // Store embedding in vector store if provided
    if (embedding) {
      storeVectorEmbedding(id, projectId, embedding);
    }

    dbLogger.debug("Stored chunk (V2)", {
      id,
      type,
      confidence,
      tick: options.tick_created,
      decayFunction: options.decay_function,
      hasEmbedding: !!embedding,
    });

    // Emit event for dashboard
    emitChunkCreated({ id, type, content });

    return {
      id,
      project_id: projectId,
      content,
      type,
      tags,
      confidence,
      source,
      created_at: now,
      last_accessed: now,
      last_useful: null,
      // Phase 1 fields
      tick_created: options.tick_created,
      tick_last_accessed: options.tick_created,
      tick_last_useful: null,
      learning_context: JSON.parse(options.learning_context) as LearningContext,
      initial_strength: initialStrength,
      current_strength: initialStrength,
      decay_function: options.decay_function,
      decay_rate: options.decay_rate,
      persistence_score: persistenceScore,
      access_count: 0,
      successful_uses: 0,
      status: 'active' as ChunkStatus,
      pinned: options.pinned ?? false,
      superseded_by: null,
      valid_until_tick: null,
    };
  });
}

export function getChunk(chunkId: string): Chunk | null {
  const stmt = prepareStatement(`
    SELECT * FROM chunks WHERE id = ?
  `);
  const row = stmt.get(chunkId) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  // Update last_accessed
  prepareStatement(`
    UPDATE chunks SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?
  `).run(chunkId);
  
  return rowToChunk(row);
}

export function searchChunksByTags(
  projectId: string,
  tags: string[],
  anyTags?: string[],
  confidence?: Confidence[],
  limit: number = 50
): Chunk[] {
  let sql = "SELECT * FROM chunks WHERE project_id = ?";
  const params: unknown[] = [projectId];
  
  // All tags must match
  for (const tag of tags) {
    sql += " AND tags LIKE ?";
    params.push(`%"${tag}"%`);
  }
  
  // Any of these tags
  if (anyTags && anyTags.length > 0) {
    const tagConditions = anyTags.map(() => "tags LIKE ?").join(" OR ");
    sql += ` AND (${tagConditions})`;
    for (const tag of anyTags) {
      params.push(`%"${tag}"%`);
    }
  }
  
  // Confidence filter
  if (confidence && confidence.length > 0) {
    const placeholders = confidence.map(() => "?").join(",");
    sql += ` AND confidence IN (${placeholders})`;
    params.push(...confidence);
  }
  
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);
  
  const stmt = getDatabase().prepare(sql);
  const rows = stmt.all(...params) as Record<string, unknown>[];
  
  return rows.map(rowToChunk);
}

function rowToChunk(row: Record<string, unknown>): Chunk {
  // Parse learning context if present
  let learningContext: LearningContext | undefined;
  if (row.learning_context) {
    try {
      learningContext = JSON.parse(row.learning_context as string);
    } catch {
      learningContext = undefined;
    }
  }

  return {
    id: row.id as string,
    project_id: row.project_id as string,
    content: row.content as string,
    type: row.type as ChunkType,
    tags: JSON.parse((row.tags as string) || "[]"),
    confidence: row.confidence as Confidence,
    source: row.source as Source,
    created_at: row.created_at as string,
    last_accessed: row.last_accessed as string,
    last_useful: row.last_useful as string | null,
    // Phase 1 fields (optional for backward compatibility)
    tick_created: row.tick_created as number | undefined,
    tick_last_accessed: row.tick_last_accessed as number | null | undefined,
    tick_last_useful: row.tick_last_useful as number | null | undefined,
    learning_context: learningContext,
    initial_strength: row.initial_strength as number | undefined,
    current_strength: row.current_strength as number | undefined,
    decay_function: row.decay_function as DecayFunction | undefined,
    decay_rate: row.decay_rate as number | undefined,
    persistence_score: row.persistence_score as number | undefined,
    access_count: row.access_count as number | undefined,
    successful_uses: row.successful_uses as number | undefined,
    status: row.status as ChunkStatus | undefined,
    pinned: row.pinned === 1 || row.pinned === true,
    superseded_by: row.superseded_by as string | null | undefined,
    valid_until_tick: row.valid_until_tick as number | null | undefined,
  };
}

// =============================================================================
// Embeddings (Vector Search)
// =============================================================================

export function searchSemantic(
  projectId: string,
  queryEmbedding: Float32Array,
  limit: number = 10,
  minSimilarity: number = 0.7
): { chunkId: string; similarity: number }[] {
  // Use in-memory vector store with cosine similarity
  return searchSimilar(projectId, queryEmbedding, limit, minSimilarity);
}

// =============================================================================
// Relationships
// =============================================================================

export function createRelationship(
  fromChunkId: string,
  toChunkId: string,
  type: RelationshipType,
  weight: number = 0.5,
  contextTags: string[] = [],
  origin: RelationshipOrigin = "explicit"
): Relationship {
  const id = uuidv4();
  const now = new Date().toISOString();

  // Clamp weight to valid range [0.0, 1.0] to satisfy CHECK constraint
  const clampedWeight = Math.max(0.0, Math.min(1.0, weight));

  const stmt = prepareStatement(`
    INSERT INTO relationships (id, from_chunk_id, to_chunk_id, type, weight, context_tags, origin, created_at, last_activated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (from_chunk_id, to_chunk_id, type) DO UPDATE SET
      weight = MAX(relationships.weight, excluded.weight),
      context_tags = excluded.context_tags,
      last_activated = excluded.last_activated
  `);
  
  stmt.run(id, fromChunkId, toChunkId, type, clampedWeight, JSON.stringify(contextTags), origin, now, now);

  dbLogger.debug("Created relationship", { fromChunkId, toChunkId, type, weight: clampedWeight });

  // Emit event for dashboard
  emitRelationshipCreated({ fromId: fromChunkId, toId: toChunkId, type, weight: clampedWeight });
  
  return {
    id,
    from_chunk_id: fromChunkId,
    to_chunk_id: toChunkId,
    type,
    weight: clampedWeight,
    last_activated: now,
    activation_count: 0,
    context_tags: contextTags,
    origin,
    created_at: now,
  };
}

export function getRelationships(
  chunkId: string,
  type?: RelationshipType,
  minWeight: number = 0.1,
  direction: "outgoing" | "incoming" | "both" = "both",
  limit: number = 20
): { relationship: Relationship; direction: "outgoing" | "incoming" }[] {
  const results: { relationship: Relationship; direction: "outgoing" | "incoming" }[] = [];
  
  if (direction === "outgoing" || direction === "both") {
    let sql = `
      SELECT * FROM relationships 
      WHERE from_chunk_id = ? AND weight >= ?
    `;
    const params: unknown[] = [chunkId, minWeight];
    
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }
    
    sql += " ORDER BY weight DESC LIMIT ?";
    params.push(limit);
    
    const rows = getDatabase().prepare(sql).all(...params) as Record<string, unknown>[];
    
    for (const row of rows) {
      results.push({
        relationship: rowToRelationship(row),
        direction: "outgoing",
      });
    }
  }
  
  if (direction === "incoming" || direction === "both") {
    let sql = `
      SELECT * FROM relationships 
      WHERE to_chunk_id = ? AND weight >= ?
    `;
    const params: unknown[] = [chunkId, minWeight];
    
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }
    
    sql += " ORDER BY weight DESC LIMIT ?";
    params.push(limit);
    
    const rows = getDatabase().prepare(sql).all(...params) as Record<string, unknown>[];
    
    for (const row of rows) {
      results.push({
        relationship: rowToRelationship(row),
        direction: "incoming",
      });
    }
  }
  
  // Update last_activated for traversed relationships
  const now = new Date().toISOString();
  for (const { relationship } of results) {
    prepareStatement(`
      UPDATE relationships 
      SET last_activated = ?, activation_count = activation_count + 1 
      WHERE id = ?
    `).run(now, relationship.id);
  }
  
  return results.slice(0, limit);
}

export function strengthenRelationship(
  fromChunkId: string,
  toChunkId: string,
  amount: number = 0.05
): Relationship | null {
  const stmt = prepareStatement(`
    UPDATE relationships 
    SET weight = MIN(weight + ?, 1.0),
        activation_count = activation_count + 1,
        last_activated = CURRENT_TIMESTAMP
    WHERE from_chunk_id = ? AND to_chunk_id = ?
    RETURNING *
  `);
  
  const row = stmt.get(amount, fromChunkId, toChunkId) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  dbLogger.debug("Strengthened relationship", { fromChunkId, toChunkId, amount });
  
  return rowToRelationship(row);
}

export function weakenRelationship(
  fromChunkId: string,
  toChunkId: string,
  reason: string,
  amount: number = 0.3
): Relationship | null {
  return withTransaction(() => {
    const stmt = prepareStatement(`
      UPDATE relationships 
      SET weight = MAX(weight - ?, 0.0)
      WHERE from_chunk_id = ? AND to_chunk_id = ?
      RETURNING *
    `);
    
    const row = stmt.get(amount, fromChunkId, toChunkId) as Record<string, unknown> | undefined;
    
    if (!row) return null;
    
    const relationship = rowToRelationship(row);
    
    // Archive if below threshold
    if (relationship.weight < 0.05) {
      archiveRelationship(relationship, reason);
    }
    
    dbLogger.debug("Weakened relationship", { fromChunkId, toChunkId, reason, newWeight: relationship.weight });
    
    return relationship;
  });
}

function archiveRelationship(relationship: Relationship, reason: string): void {
  const archiveStmt = prepareStatement(`
    INSERT INTO relationships_archive (id, from_chunk_id, to_chunk_id, type, final_weight, reason, original_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  archiveStmt.run(
    relationship.id,
    relationship.from_chunk_id,
    relationship.to_chunk_id,
    relationship.type,
    relationship.weight,
    reason,
    JSON.stringify(relationship)
  );
  
  prepareStatement(`DELETE FROM relationships WHERE id = ?`).run(relationship.id);
  
  dbLogger.debug("Archived relationship", { id: relationship.id, reason });
}

function rowToRelationship(row: Record<string, unknown>): Relationship {
  return {
    id: row.id as string,
    from_chunk_id: row.from_chunk_id as string,
    to_chunk_id: row.to_chunk_id as string,
    type: row.type as RelationshipType,
    weight: row.weight as number,
    last_activated: row.last_activated as string,
    activation_count: row.activation_count as number,
    context_tags: JSON.parse((row.context_tags as string) || "[]"),
    origin: row.origin as RelationshipOrigin,
    created_at: row.created_at as string,
  };
}

// =============================================================================
// Co-retrieval Tracking
// =============================================================================

export function recordCoretrieval(
  chunkIds: string[],
  sessionId: string,
  queryContext: string
): void {
  if (chunkIds.length < 2) return;
  
  const stmt = prepareStatement(`
    INSERT INTO coretrieval (id, chunk_a_id, chunk_b_id, session_id, query_context)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  // Record all pairs
  for (let i = 0; i < chunkIds.length; i++) {
    for (let j = i + 1; j < chunkIds.length; j++) {
      stmt.run(uuidv4(), chunkIds[i], chunkIds[j], sessionId, queryContext);
    }
  }
}

export function getFrequentCoretrievals(
  threshold: number = 3
): { chunkA: string; chunkB: string; count: number }[] {
  const stmt = prepareStatement(`
    SELECT chunk_a_id, chunk_b_id, COUNT(*) as count
    FROM coretrieval
    GROUP BY chunk_a_id, chunk_b_id
    HAVING count >= ?
    ORDER BY count DESC
  `);

  const rows = stmt.all(threshold) as { chunk_a_id: string; chunk_b_id: string; count: number }[];

  return rows.map(row => ({
    chunkA: row.chunk_a_id,
    chunkB: row.chunk_b_id,
    count: row.count,
  }));
}

/**
 * Processes co-retrieval patterns and creates/strengthens implicit relationships.
 * This should be called periodically (e.g., after each session or every N operations).
 *
 * Algorithm:
 * 1. Find chunk pairs retrieved together >= threshold times
 * 2. For pairs without a relationship: create implicit "related_to" relationship
 * 3. For pairs with existing relationship: strengthen the weight
 *
 * @param threshold - Minimum co-retrieval count to trigger relationship creation
 * @param initialWeight - Starting weight for new implicit relationships
 * @param strengthenAmount - Amount to increase weight for existing relationships
 * @returns Summary of processed relationships
 */
export function processImplicitRelationships(
  threshold: number = 3,
  initialWeight: number = 0.2,
  strengthenAmount: number = 0.05
): { created: number; strengthened: number } {
  const frequentPairs = getFrequentCoretrievals(threshold);
  let created = 0;
  let strengthened = 0;

  for (const pair of frequentPairs) {
    // Check if relationship already exists (in either direction)
    const existingForward = getRelationshipBetween(pair.chunkA, pair.chunkB);
    const existingReverse = getRelationshipBetween(pair.chunkB, pair.chunkA);

    if (existingForward || existingReverse) {
      // Strengthen existing relationship
      const existing = existingForward || existingReverse;
      if (existing) {
        strengthenRelationship(existing.from_chunk_id, existing.to_chunk_id, strengthenAmount);
        strengthened++;
      }
    } else {
      // Create new implicit relationship
      createRelationship(
        pair.chunkA,
        pair.chunkB,
        "related_to",
        initialWeight,
        [],
        "implicit"
      );
      created++;
    }
  }

  dbLogger.info("Processed implicit relationships", { created, strengthened, pairsChecked: frequentPairs.length });

  return { created, strengthened };
}

/**
 * Gets a specific relationship between two chunks.
 */
export function getRelationshipBetween(
  fromChunkId: string,
  toChunkId: string
): Relationship | null {
  const stmt = prepareStatement(`
    SELECT * FROM relationships
    WHERE from_chunk_id = ? AND to_chunk_id = ?
    LIMIT 1
  `);

  const row = stmt.get(fromChunkId, toChunkId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToRelationship(row);
}

/**
 * Clears old co-retrieval records to prevent unbounded growth.
 * Keeps records from the last N days.
 */
export function cleanupOldCoretrievals(daysToKeep: number = 30): number {
  const stmt = prepareStatement(`
    DELETE FROM coretrieval
    WHERE timestamp < datetime('now', ?)
  `);

  const result = stmt.run(`-${daysToKeep} days`);

  dbLogger.debug("Cleaned up old coretrieval records", { deleted: result.changes });

  return result.changes;
}

// =============================================================================
// Goals
// =============================================================================

/**
 * Creates a new goal for a project.
 * If there's an active goal, it will be marked as completed.
 */
export function createGoal(
  projectId: string,
  goalText: string,
  outcomeForPrevious?: string
): Goal {
  return withTransaction(() => {
    // Mark any currently active goal as completed
    const activeGoal = getActiveGoal(projectId);
    if (activeGoal) {
      completeGoal(activeGoal.id, outcomeForPrevious || "Replaced by new goal");
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = prepareStatement(`
      INSERT INTO goals (id, project_id, goal, active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `);

    stmt.run(id, projectId, goalText, now);

    dbLogger.debug("Created goal", { id, projectId, goal: goalText });

    return {
      id,
      project_id: projectId,
      goal: goalText,
      active: true,
      created_at: now,
      completed_at: null,
      outcome: null,
    };
  });
}

/**
 * Gets the currently active goal for a project.
 */
export function getActiveGoal(projectId: string): Goal | null {
  const stmt = prepareStatement(`
    SELECT * FROM goals WHERE project_id = ? AND active = 1 LIMIT 1
  `);
  const row = stmt.get(projectId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToGoal(row);
}

/**
 * Gets goal history for a project.
 */
export function getGoalHistory(projectId: string, limit: number = 20): Goal[] {
  const stmt = prepareStatement(`
    SELECT * FROM goals
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(projectId, limit) as Record<string, unknown>[];
  return rows.map(rowToGoal);
}

/**
 * Gets goal history across all projects.
 */
export function getAllGoalHistory(limit: number = 50): Goal[] {
  const stmt = prepareStatement(`
    SELECT * FROM goals
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as Record<string, unknown>[];
  return rows.map(rowToGoal);
}

/**
 * Marks a goal as completed with an outcome.
 */
export function completeGoal(goalId: string, outcome: string): Goal | null {
  const now = new Date().toISOString();

  const stmt = prepareStatement(`
    UPDATE goals
    SET active = 0, completed_at = ?, outcome = ?
    WHERE id = ?
  `);

  stmt.run(now, outcome, goalId);

  dbLogger.debug("Completed goal", { goalId, outcome });

  return getGoal(goalId);
}

/**
 * Gets a specific goal by ID.
 */
export function getGoal(goalId: string): Goal | null {
  const stmt = prepareStatement(`
    SELECT * FROM goals WHERE id = ?
  `);
  const row = stmt.get(goalId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToGoal(row);
}

function rowToGoal(row: Record<string, unknown>): Goal {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    goal: row.goal as string,
    active: (row.active as number) === 1,
    created_at: row.created_at as string,
    completed_at: row.completed_at as string | null,
    outcome: row.outcome as string | null,
  };
}

// =============================================================================
// Pending Goals
// =============================================================================

/**
 * Sets a pending goal to be applied after the current cycle completes.
 */
export function setPendingGoal(projectId: string, goalText: string): PendingGoal {
  const now = new Date().toISOString();

  const stmt = prepareStatement(`
    INSERT INTO pending_goals (project_id, goal, queued_at)
    VALUES (?, ?, ?)
    ON CONFLICT (project_id) DO UPDATE SET
      goal = excluded.goal,
      queued_at = excluded.queued_at
  `);

  stmt.run(projectId, goalText, now);

  dbLogger.debug("Set pending goal", { projectId, goal: goalText });

  return {
    project_id: projectId,
    goal: goalText,
    queued_at: now,
  };
}

/**
 * Gets the pending goal for a project.
 */
export function getPendingGoal(projectId: string): PendingGoal | null {
  const stmt = prepareStatement(`
    SELECT * FROM pending_goals WHERE project_id = ?
  `);
  const row = stmt.get(projectId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    project_id: row.project_id as string,
    goal: row.goal as string,
    queued_at: row.queued_at as string,
  };
}

/**
 * Clears the pending goal for a project.
 */
export function clearPendingGoal(projectId: string): void {
  const stmt = prepareStatement(`
    DELETE FROM pending_goals WHERE project_id = ?
  `);

  stmt.run(projectId);

  dbLogger.debug("Cleared pending goal", { projectId });
}

/**
 * Applies a pending goal: creates it as the active goal and clears the pending.
 */
export function applyPendingGoal(projectId: string): Goal | null {
  const pending = getPendingGoal(projectId);
  if (!pending) return null;

  const goal = createGoal(projectId, pending.goal);
  clearPendingGoal(projectId);

  dbLogger.info("Applied pending goal", { projectId, goal: pending.goal });

  return goal;
}

// =============================================================================
// Coherence Warnings
// =============================================================================

/**
 * Creates a coherence warning for a task.
 */
export function createCoherenceWarning(
  taskId: string,
  projectId: string,
  concern: string,
  suggestion?: string
): CoherenceWarning {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = prepareStatement(`
    INSERT INTO coherence_warnings (id, task_id, project_id, concern, suggestion, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, taskId, projectId, concern, suggestion || null, now);

  dbLogger.debug("Created coherence warning", { id, taskId, concern });

  return {
    id,
    task_id: taskId,
    project_id: projectId,
    concern,
    suggestion: suggestion || null,
    created_at: now,
    resolved: false,
    resolution: null,
  };
}

/**
 * Gets unresolved coherence warnings for a project.
 */
export function getUnresolvedWarnings(projectId: string): CoherenceWarning[] {
  const stmt = prepareStatement(`
    SELECT * FROM coherence_warnings
    WHERE project_id = ? AND resolved = 0
    ORDER BY created_at DESC
  `);

  const rows = stmt.all(projectId) as Record<string, unknown>[];
  return rows.map(rowToCoherenceWarning);
}

/**
 * Gets all coherence warnings for a project.
 */
export function getCoherenceWarnings(
  projectId: string,
  includeResolved: boolean = false
): CoherenceWarning[] {
  let sql = "SELECT * FROM coherence_warnings WHERE project_id = ?";
  if (!includeResolved) {
    sql += " AND resolved = 0";
  }
  sql += " ORDER BY created_at DESC";

  const stmt = getDatabase().prepare(sql);
  const rows = stmt.all(projectId) as Record<string, unknown>[];

  return rows.map(rowToCoherenceWarning);
}

/**
 * Gets a specific coherence warning by ID.
 */
export function getCoherenceWarning(warningId: string): CoherenceWarning | null {
  const stmt = prepareStatement(`
    SELECT * FROM coherence_warnings WHERE id = ?
  `);
  const row = stmt.get(warningId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToCoherenceWarning(row);
}

/**
 * Resolves a coherence warning.
 */
export function resolveCoherenceWarning(
  warningId: string,
  resolution: CoherenceResolution
): CoherenceWarning | null {
  const stmt = prepareStatement(`
    UPDATE coherence_warnings
    SET resolved = 1, resolution = ?
    WHERE id = ?
  `);

  stmt.run(resolution, warningId);

  dbLogger.debug("Resolved coherence warning", { warningId, resolution });

  return getCoherenceWarning(warningId);
}

/**
 * Checks if a task has an unresolved coherence warning.
 */
export function hasUnresolvedWarning(taskId: string): boolean {
  const stmt = prepareStatement(`
    SELECT COUNT(*) as count FROM coherence_warnings
    WHERE task_id = ? AND resolved = 0
  `);

  const row = stmt.get(taskId) as { count: number };
  return row.count > 0;
}

function rowToCoherenceWarning(row: Record<string, unknown>): CoherenceWarning {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    project_id: row.project_id as string,
    concern: row.concern as string,
    suggestion: row.suggestion as string | null,
    created_at: row.created_at as string,
    resolved: (row.resolved as number) === 1,
    resolution: row.resolution as CoherenceResolution | null,
  };
}

// =============================================================================
// Knowledge Stats (for status display)
// =============================================================================

export interface ChunkStats {
  total: number;
  verified: number;
  inferred: number;
  speculative: number;
}

export interface RecentChunk {
  content: string;
  tags: string[];
  created_at: string;
}

/**
 * Gets chunk counts grouped by confidence level.
 */
export function getChunkStats(projectId: string): ChunkStats {
  const stmt = prepareStatement(`
    SELECT confidence, COUNT(*) as count
    FROM chunks
    WHERE project_id = ?
    GROUP BY confidence
  `);

  const rows = stmt.all(projectId) as { confidence: string; count: number }[];

  const stats: ChunkStats = {
    total: 0,
    verified: 0,
    inferred: 0,
    speculative: 0,
  };

  for (const row of rows) {
    stats.total += row.count;
    if (row.confidence === "verified") stats.verified = row.count;
    else if (row.confidence === "inferred") stats.inferred = row.count;
    else if (row.confidence === "speculative") stats.speculative = row.count;
  }

  return stats;
}

/**
 * Gets total relationship count for a project.
 */
export function getRelationshipCount(projectId: string): number {
  const stmt = prepareStatement(`
    SELECT COUNT(*) as count
    FROM relationships r
    JOIN chunks c ON r.from_chunk_id = c.id
    WHERE c.project_id = ?
  `);

  const row = stmt.get(projectId) as { count: number };
  return row.count;
}

/**
 * Gets the most recent chunks for a project.
 */
export function getRecentChunks(projectId: string, limit: number = 3): RecentChunk[] {
  const stmt = prepareStatement(`
    SELECT content, tags, created_at
    FROM chunks
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(projectId, limit) as { content: string; tags: string; created_at: string }[];

  return rows.map(row => ({
    content: row.content,
    tags: JSON.parse(row.tags || "[]"),
    created_at: row.created_at,
  }));
}

// =============================================================================
// Last Cycle Stats (for status display)
// =============================================================================

export interface LastCycleInfo {
  timestamp: string;
  taskCompleted: string | null;
  chunksStored: number;
  toolsUsed: Map<string, number>;
}

/**
 * Gets information about the last agent cycle from activity logs.
 */
export function getLastCycleInfo(projectId: string): LastCycleInfo | null {
  const stmt = prepareStatement(`
    SELECT action, details, timestamp
    FROM activities
    WHERE project_id = ?
    ORDER BY timestamp DESC
    LIMIT 20
  `);

  const rows = stmt.all(projectId) as { action: string; details: string | null; timestamp: string }[];

  if (rows.length === 0) return null;

  // Find the most recent cycle-related activity
  let cycleTimestamp: string | null = null;
  let taskCompleted: string | null = null;
  let chunksStored = 0;
  const toolsUsed = new Map<string, number>();

  for (const row of rows) {
    const details = row.details ? JSON.parse(row.details) : null;

    // Use the first activity timestamp as the cycle time
    if (!cycleTimestamp) {
      cycleTimestamp = row.timestamp;
    }

    // Look for task completion - action format is "Completed: {task title}"
    if (row.action.startsWith("Completed: ") || row.action.startsWith("SDK Completed: ")) {
      if (!taskCompleted) {
        taskCompleted = row.action.replace(/^(SDK )?Completed: /, "");
      }
    } else if (row.action === "task_completed" && details?.title) {
      if (!taskCompleted) {
        taskCompleted = details.title;
      }
    }

    // Count chunk storage
    if (row.action === "chunk_stored" || row.action.includes("chunk")) {
      chunksStored++;
    }

    // Track tool usage from details
    if (details?.tool) {
      const tool = details.tool as string;
      toolsUsed.set(tool, (toolsUsed.get(tool) || 0) + 1);
    }
    // Handle toolCalls array from old executor format
    if (details?.toolCalls && Array.isArray(details.toolCalls)) {
      for (const tc of details.toolCalls) {
        if (tc.name) {
          toolsUsed.set(tc.name, (toolsUsed.get(tc.name) || 0) + (tc.count || 1));
        }
      }
    }
    // Handle toolsUsed array from SDK executor format
    if (details?.toolsUsed && Array.isArray(details.toolsUsed)) {
      for (const tool of details.toolsUsed) {
        if (typeof tool === "string") {
          toolsUsed.set(tool, (toolsUsed.get(tool) || 0) + 1);
        }
      }
    }
  }

  if (!cycleTimestamp) return null;

  return {
    timestamp: cycleTimestamp,
    taskCompleted,
    chunksStored,
    toolsUsed,
  };
}

// =============================================================================
// Relationship Expansion (for knowledge retrieval)
// =============================================================================

export interface ExpandedChunk extends Chunk {
  _relationshipType?: RelationshipType;
  _relationshipWeight?: number;
  _fromChunkId?: string;
}

/**
 * Expands a set of chunk IDs by traversing relationships.
 * Returns related chunks that are connected to the input chunks.
 *
 * @param chunkIds - The initial set of chunk IDs to expand from
 * @param projectId - Project ID to filter chunks
 * @param minWeight - Minimum relationship weight to consider (default 0.3)
 * @param depth - How many levels of relationships to traverse (default 1)
 * @returns Array of related chunks with relationship metadata
 */
export function expandWithRelationships(
  chunkIds: string[],
  projectId: string,
  minWeight: number = 0.3,
  depth: number = 1
): ExpandedChunk[] {
  const relatedChunks: ExpandedChunk[] = [];
  const seen = new Set(chunkIds);
  let currentLevel = [...chunkIds];

  for (let d = 0; d < depth; d++) {
    const nextLevel: string[] = [];

    for (const chunkId of currentLevel) {
      const relationships = getRelationships(chunkId, undefined, minWeight, "both", 10);

      for (const { relationship, direction } of relationships) {
        const relatedId = direction === "outgoing"
          ? relationship.to_chunk_id
          : relationship.from_chunk_id;

        if (!seen.has(relatedId)) {
          seen.add(relatedId);
          const chunk = getChunk(relatedId);

          if (chunk && chunk.project_id === projectId) {
            relatedChunks.push({
              ...chunk,
              _relationshipType: relationship.type,
              _relationshipWeight: relationship.weight,
              _fromChunkId: chunkId,
            });
            nextLevel.push(relatedId);
          }
        }
      }
    }

    currentLevel = nextLevel;
    if (currentLevel.length === 0) break;
  }

  // Sort by relationship weight (strongest first)
  relatedChunks.sort((a, b) => (b._relationshipWeight || 0) - (a._relationshipWeight || 0));

  return relatedChunks;
}

/**
 * Creates relationships between a new chunk and similar existing chunks.
 * Called after storing a new chunk to build the knowledge graph.
 *
 * Uses cross-encoder when available for more accurate relationship scoring.
 *
 * @param newChunkId - The ID of the newly stored chunk
 * @param projectId - Project ID
 * @param embedding - The embedding vector of the new chunk
 * @param tags - Tags of the new chunk (used to determine relationship type)
 * @param options - Options for relationship creation
 */
export async function createRelationshipsForNewChunk(
  newChunkId: string,
  projectId: string,
  embedding: Float32Array,
  tags: string[] = [],
  options: { useCrossEncoder?: boolean } = {}
): Promise<number> {
  const { useCrossEncoder = true } = options;

  // Find similar existing chunks
  const similar = searchSemantic(projectId, embedding, 5, 0.6);
  let created = 0;

  if (similar.length === 0) {
    return 0;
  }

  // Get the new chunk for cross-encoder scoring
  const newChunk = getChunk(newChunkId);
  if (!newChunk) {
    return 0;
  }

  // Load full chunk data for similar chunks
  const candidateChunks: Array<{
    id: string;
    content: string;
    type: string;
    tags: string[];
    embeddingSimilarity: number;
  }> = [];

  for (const match of similar) {
    // Don't create self-relationship
    if (match.chunkId === newChunkId) continue;

    const existingChunk = getChunk(match.chunkId);
    if (!existingChunk) continue;

    candidateChunks.push({
      id: existingChunk.id,
      content: existingChunk.content,
      type: existingChunk.type,
      tags: existingChunk.tags,
      embeddingSimilarity: match.similarity,
    });
  }

  if (candidateChunks.length === 0) {
    return 0;
  }

  // Try cross-encoder scoring
  if (useCrossEncoder && (await isRerankerAvailable())) {
    dbLogger.debug(`Scoring ${candidateChunks.length} relationships with cross-encoder`);

    const scores = await batchScoreRelationships(
      candidateChunks.map((c) => ({
        chunkA: { id: newChunk.id, content: newChunk.content, type: newChunk.type },
        chunkB: { id: c.id, content: c.content, type: c.type },
      }))
    );

    for (let i = 0; i < candidateChunks.length; i++) {
      const candidate = candidateChunks[i];
      const score = scores[i];

      if (score && score.score > 0.4) {
        // Cross-encoder threshold
        createRelationship(
          newChunkId,
          candidate.id,
          score.suggestedType,
          score.score, // Use cross-encoder score as weight
          tags.slice(0, 5),
          "auto"
        );
        created++;

        dbLogger.debug("Created relationship via cross-encoder", {
          from: newChunkId,
          to: candidate.id,
          type: score.suggestedType,
          weight: score.score,
          typeConfidence: score.typeConfidence,
        });
      }
    }
  } else {
    // Fall back to embedding similarity + heuristics (existing logic)
    dbLogger.debug(`Scoring ${candidateChunks.length} relationships with embedding similarity`);

    for (const candidate of candidateChunks) {
      const similarity = candidate.embeddingSimilarity;

      // Determine type based on similarity threshold and tag overlap
      const tagOverlap = tags.filter((t) => candidate.tags.includes(t)).length;
      const hasCommonTags = tagOverlap > 0;

      // Higher similarity + common tags = builds_on, otherwise related_to
      const relType: RelationshipType =
        similarity > 0.75 || hasCommonTags ? "builds_on" : "related_to";

      if (similarity > 0.6) {
        createRelationship(
          newChunkId,
          candidate.id,
          relType,
          similarity, // Use similarity as initial weight
          tags.slice(0, 5), // Store up to 5 context tags
          "explicit"
        );
        created++;

        dbLogger.debug("Created relationship via embedding similarity", {
          from: newChunkId,
          to: candidate.id,
          type: relType,
          weight: similarity,
        });
      }
    }
  }

  return created;
}
