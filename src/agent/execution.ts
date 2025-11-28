/**
 * Work Execution Loop
 *
 * Main execution loop after wake-up:
 * 1. Pick highest priority task
 * 2. Execute task (actual work happens here)
 * 3. Handle result (complete, blocked, needs_research)
 * 4. Store learnings as knowledge
 * 5. Check for orientation rewrite triggers
 * 6. Move to next task
 *
 * This module defines the loop structure. Actual task execution
 * would be done by a Claude agent using the MCP tools.
 */

import {
  getTasks,
  getTask,
  updateTask,
  createTask,
  createQuestion,
  logActivity,
  getRecentActivity,
  getOrientation,
  storeChunk,
  getActiveGoal,
  getPendingGoal,
  applyPendingGoal,
} from "../db/queries.js";
import { embed } from "../embedding/index.js";
import { prioritizeTasksSimple, getActionableTasks } from "./prioritization.js";
import { enforceCoherence } from "./coherence.js";
import { checkAndRewriteOrientation } from "./orientation-rewrite.js";
import {
  AgentState,
  Task,
  Orientation,
  Chunk,
  Goal,
} from "../utils/types.js";
import { getAgentConfig } from "../utils/config.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export type TaskResultStatus =
  | "complete"
  | "blocked"
  | "needs_research"
  | "partial"
  | "failed";

export interface TaskResult {
  status: TaskResultStatus;
  outcome?: string;
  learnings?: Learning[];
  question?: string;
  questionContext?: string;
  researchTopic?: string;
  researchDescription?: string;
  error?: string;
}

export interface Learning {
  content: string;
  type: "research" | "insight" | "decision" | "attempt";
  tags: string[];
  confidence: "verified" | "inferred" | "speculative";
}

export interface ExecutionSession {
  projectId: string;
  state: AgentState;
  tasksCompleted: number;
  tasksBlocked: number;
  tasksSkippedCoherence: number;
  questionsCreated: number;
  learningsStored: number;
  startTime: string;
  endTime?: string;
  currentGoal?: Goal | null;
}

export interface ExecutionConfig {
  maxTasksPerSession: number;
  pauseBetweenTasks: boolean;
  stopOnBlock: boolean;
  enableCoherenceCheck: boolean;
}

// =============================================================================
// Execution Loop
// =============================================================================

/**
 * Main work execution loop.
 *
 * Note: This function provides the loop structure. In practice,
 * the `executeTask` function would be replaced with actual Claude
 * agent execution using the MCP tools.
 */
export async function executeWorkLoop(
  initialState: AgentState,
  executeTask: TaskExecutor,
  config?: Partial<ExecutionConfig>
): Promise<ExecutionSession> {
  const agentConfig = getAgentConfig();
  const cfg: ExecutionConfig = {
    maxTasksPerSession: agentConfig.max_tasks_per_session,
    pauseBetweenTasks: false,
    stopOnBlock: false,
    enableCoherenceCheck: true,
    ...config,
  };

  // Get current goal for prioritization and coherence checking
  const currentGoal = getActiveGoal(initialState.orientation!.project_id);

  const session: ExecutionSession = {
    projectId: initialState.orientation!.project_id,
    state: { ...initialState },
    tasksCompleted: 0,
    tasksBlocked: 0,
    tasksSkippedCoherence: 0,
    questionsCreated: 0,
    learningsStored: 0,
    startTime: new Date().toISOString(),
    currentGoal,
  };

  dbLogger.info("Starting execution loop", {
    projectId: session.projectId,
    maxTasks: cfg.maxTasksPerSession,
    hasGoal: !!currentGoal,
    goalText: currentGoal?.goal,
  });

  // Main loop
  let coherenceSkipCount = 0;
  const maxCoherenceSkips = 5; // Prevent infinite loop if all tasks fail coherence

  while (
    session.state.status === "ready" &&
    session.state.current_task &&
    session.tasksCompleted < cfg.maxTasksPerSession &&
    coherenceSkipCount < maxCoherenceSkips
  ) {
    const task = session.state.current_task;

    dbLogger.debug("Processing task", { taskId: task.id, title: task.title });

    // Coherence check before execution
    if (cfg.enableCoherenceCheck && currentGoal) {
      const coherenceResult = enforceCoherence(task, currentGoal);

      if (!coherenceResult.proceed) {
        // Task failed coherence - skip to next task
        session.tasksSkippedCoherence++;
        coherenceSkipCount++;

        logActivity(session.projectId, `Skipped (coherence): ${task.title}`, {
          taskId: task.id,
          warningId: coherenceResult.warning?.id,
          concern: coherenceResult.warning?.concern,
        });

        dbLogger.info("Task skipped due to coherence check", {
          taskId: task.id,
          title: task.title,
          warningId: coherenceResult.warning?.id,
        });

        // Move to next task without executing
        const allTasks = getTasks(session.projectId);
        const recentActivity = getRecentActivity(session.projectId, 10);
        const prioritized = prioritizeTasksSimple(
          allTasks.filter((t) => t.status === "ready" && t.id !== task.id),
          session.state.orientation!,
          recentActivity,
          currentGoal
        );

        session.state.current_task = prioritized[0] || null;
        session.state.task_queue = prioritized.slice(1);
        continue;
      }
    }

    // Reset coherence skip count on successful coherence check
    coherenceSkipCount = 0;

    // Mark task in progress
    updateTask(task.id, { status: "in_progress" });
    logActivity(session.projectId, `Starting: ${task.title}`, {
      taskId: task.id,
      skill_area: task.skill_area,
    });

    // Execute the task (this is where actual work happens)
    const result = await executeTask(task, session.state.orientation!);

    // Handle result
    await handleTaskResult(session, task, result);

    // Check for orientation rewrite trigger
    if (result.status === "complete") {
      const rewriteResult = await checkAndRewriteOrientation(session.projectId, task);
      if (rewriteResult?.success && rewriteResult.newOrientation) {
        // Update session state with new orientation
        session.state.orientation = rewriteResult.newOrientation;
        dbLogger.info("Orientation rewritten during execution", {
          previousVersion: rewriteResult.previousVersion,
          newVersion: rewriteResult.newOrientation.version,
        });
      }
    }

    // Refresh task queue with goal-aware prioritization
    const allTasks = getTasks(session.projectId);
    const recentActivity = getRecentActivity(session.projectId, 10);
    const prioritized = prioritizeTasksSimple(
      allTasks.filter((t) => t.status === "ready"),
      session.state.orientation!,
      recentActivity,
      currentGoal
    );

    session.state.current_task = prioritized[0] || null;
    session.state.task_queue = prioritized.slice(1);

    // Check if we should stop
    if (cfg.stopOnBlock && result.status === "blocked") {
      break;
    }
  }

  // Apply pending goal at end of cycle
  const pendingGoal = getPendingGoal(session.projectId);
  if (pendingGoal) {
    const appliedGoal = applyPendingGoal(session.projectId);
    if (appliedGoal) {
      logActivity(session.projectId, "Applied pending goal", {
        goal: appliedGoal.goal,
      });
      dbLogger.info("Applied pending goal", {
        projectId: session.projectId,
        goal: appliedGoal.goal,
      });
    }
  }

  // End of loop
  session.endTime = new Date().toISOString();

  logActivity(session.projectId, "Session complete", {
    tasksCompleted: session.tasksCompleted,
    tasksBlocked: session.tasksBlocked,
    tasksSkippedCoherence: session.tasksSkippedCoherence,
    questionsCreated: session.questionsCreated,
    learningsStored: session.learningsStored,
    duration: calculateDuration(session.startTime, session.endTime),
  });

  dbLogger.info("Execution loop complete", {
    tasksCompleted: session.tasksCompleted,
    tasksBlocked: session.tasksBlocked,
    tasksSkippedCoherence: session.tasksSkippedCoherence,
  });

  return session;
}

// =============================================================================
// Result Handling
// =============================================================================

async function handleTaskResult(
  session: ExecutionSession,
  task: Task,
  result: TaskResult
): Promise<void> {
  switch (result.status) {
    case "complete":
      await handleComplete(session, task, result);
      break;

    case "blocked":
      await handleBlocked(session, task, result);
      break;

    case "needs_research":
      await handleNeedsResearch(session, task, result);
      break;

    case "partial":
      await handlePartial(session, task, result);
      break;

    case "failed":
      await handleFailed(session, task, result);
      break;
  }
}

async function handleComplete(
  session: ExecutionSession,
  task: Task,
  result: TaskResult
): Promise<void> {
  // Update task to done
  updateTask(task.id, {
    status: "done",
    outcome: result.outcome || "Completed",
  });

  session.tasksCompleted++;

  logActivity(session.projectId, `Completed: ${task.title}`, {
    taskId: task.id,
    outcome: result.outcome?.slice(0, 100),
  });

  // Store learnings
  if (result.learnings) {
    for (const learning of result.learnings) {
      await storeLearning(session, learning);
    }
  }

  dbLogger.debug("Task completed", { taskId: task.id, outcome: result.outcome });
}

async function handleBlocked(
  session: ExecutionSession,
  task: Task,
  result: TaskResult
): Promise<void> {
  // Create question that blocks this task
  if (result.question) {
    createQuestion(
      session.projectId,
      result.question,
      result.questionContext || task.description,
      [task.id]
    );

    session.questionsCreated++;

    logActivity(session.projectId, `Blocked on: ${result.question}`, {
      taskId: task.id,
    });
  } else {
    // Just mark as blocked without specific question
    updateTask(task.id, { status: "blocked" });
  }

  session.tasksBlocked++;

  dbLogger.debug("Task blocked", { taskId: task.id, question: result.question });
}

async function handleNeedsResearch(
  session: ExecutionSession,
  task: Task,
  result: TaskResult
): Promise<void> {
  // Create a research sub-task
  if (result.researchTopic) {
    createTask(
      session.projectId,
      `Research: ${result.researchTopic}`,
      result.researchDescription || `Research needed to complete: ${task.title}`,
      task.skill_area
    );

    logActivity(session.projectId, `Created research task: ${result.researchTopic}`, {
      parentTaskId: task.id,
    });
  }

  // Keep original task ready (will pick up after research)
  updateTask(task.id, { status: "ready" });

  dbLogger.debug("Task needs research", { taskId: task.id, topic: result.researchTopic });
}

async function handlePartial(
  session: ExecutionSession,
  task: Task,
  result: TaskResult
): Promise<void> {
  // Update task with partial progress but keep in progress
  updateTask(task.id, {
    description: `${task.description}\n\n[Progress: ${result.outcome}]`,
  });

  // Store any learnings from partial progress
  if (result.learnings) {
    for (const learning of result.learnings) {
      await storeLearning(session, learning);
    }
  }

  logActivity(session.projectId, `Partial progress: ${task.title}`, {
    taskId: task.id,
    progress: result.outcome,
  });

  dbLogger.debug("Task partial completion", { taskId: task.id });
}

async function handleFailed(
  session: ExecutionSession,
  task: Task,
  result: TaskResult
): Promise<void> {
  // Create a failure record as knowledge
  const failureContent = `Task failed: ${task.title}\n\nError: ${result.error}\n\nDescription: ${task.description}`;

  try {
    const embedding = await embed(failureContent);
    storeChunk(
      session.projectId,
      failureContent,
      "attempt",
      ["failure", "error", task.skill_area],
      "verified",
      "experiment",
      embedding
    );
  } catch {
    storeChunk(
      session.projectId,
      failureContent,
      "attempt",
      ["failure", "error", task.skill_area],
      "verified",
      "experiment"
    );
  }

  // Mark task as blocked (needs intervention)
  updateTask(task.id, { status: "blocked" });

  logActivity(session.projectId, `Failed: ${task.title}`, {
    taskId: task.id,
    error: result.error,
  });

  session.tasksBlocked++;

  dbLogger.warn("Task failed", { taskId: task.id, error: result.error });
}

// =============================================================================
// Learning Storage
// =============================================================================

async function storeLearning(
  session: ExecutionSession,
  learning: Learning
): Promise<void> {
  try {
    const embedding = await embed(learning.content);
    storeChunk(
      session.projectId,
      learning.content,
      learning.type,
      learning.tags,
      learning.confidence,
      "experiment",
      embedding
    );
  } catch {
    // Store without embedding if embedding fails
    storeChunk(
      session.projectId,
      learning.content,
      learning.type,
      learning.tags,
      learning.confidence,
      "experiment"
    );
  }

  session.learningsStored++;

  dbLogger.debug("Stored learning", { type: learning.type, tags: learning.tags });
}

// =============================================================================
// Task Executor Type
// =============================================================================

/**
 * Function type for executing a task.
 * In practice, this would be implemented by a Claude agent.
 */
export type TaskExecutor = (
  task: Task,
  orientation: Orientation
) => Promise<TaskResult>;

/**
 * Mock executor for testing - always completes successfully.
 */
export const mockSuccessExecutor: TaskExecutor = async (task) => {
  return {
    status: "complete",
    outcome: `Successfully completed: ${task.title}`,
    learnings: [
      {
        content: `Learned from task: ${task.title} - ${task.description}`,
        type: "insight",
        tags: [task.skill_area, "task_completion"],
        confidence: "inferred",
      },
    ],
  };
};

/**
 * Mock executor for testing - blocks on everything.
 */
export const mockBlockingExecutor: TaskExecutor = async (task) => {
  return {
    status: "blocked",
    question: `Need clarification on: ${task.title}`,
    questionContext: task.description,
  };
};

// =============================================================================
// Utility Functions
// =============================================================================

function calculateDuration(start: string, end: string): string {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const durationMs = endMs - startMs;

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Single task execution helper - for executing one task outside the loop.
 */
export async function executeSingleTask(
  projectId: string,
  taskId: string,
  executor: TaskExecutor
): Promise<TaskResult> {
  const task = getTask(taskId);
  if (!task) {
    return { status: "failed", error: "Task not found" };
  }

  const orientation = getOrientation(projectId);
  if (!orientation) {
    return { status: "failed", error: "Orientation not found" };
  }

  // Mark in progress
  updateTask(taskId, { status: "in_progress" });

  // Execute
  const result = await executor(task, orientation);

  // Handle based on result
  if (result.status === "complete") {
    updateTask(taskId, { status: "done", outcome: result.outcome });
  } else if (result.status === "blocked") {
    if (result.question) {
      createQuestion(projectId, result.question, result.questionContext || "", [taskId]);
    }
  } else if (result.status === "failed") {
    updateTask(taskId, { status: "blocked" });
  }

  return result;
}

/**
 * Gets execution session summary.
 */
export function getSessionSummary(session: ExecutionSession): string {
  const lines = [
    `Execution Session Summary`,
    `=========================`,
    `Project: ${session.projectId.slice(0, 8)}...`,
    `Duration: ${session.endTime ? calculateDuration(session.startTime, session.endTime) : "ongoing"}`,
  ];

  if (session.currentGoal) {
    lines.push(`Goal: ${session.currentGoal.goal}`);
  }

  lines.push(
    ``,
    `Tasks:`,
    `  Completed: ${session.tasksCompleted}`,
    `  Blocked: ${session.tasksBlocked}`
  );

  if (session.tasksSkippedCoherence > 0) {
    lines.push(`  Skipped (coherence): ${session.tasksSkippedCoherence}`);
  }

  lines.push(
    ``,
    `Knowledge:`,
    `  Learnings stored: ${session.learningsStored}`,
    `  Questions created: ${session.questionsCreated}`
  );

  return lines.join("\n");
}
