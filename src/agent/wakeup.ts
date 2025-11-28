/**
 * Agent Wake-Up Flow
 *
 * Reconstructs agent state from persistent memory when starting a session.
 * This is the foundation for the agent loop - everything starts here.
 *
 * Wake-up sequence:
 * 1. Load orientation (strategic context)
 * 2. Load working state (tasks, questions, blockers)
 * 3. Check for newly answered questions
 * 4. Process answers → store as knowledge, unblock tasks
 * 5. Evaluate work queue
 * 6. Return ready state with prioritized tasks
 */

import {
  getOrientation,
  getTasks,
  getQuestions,
  getRecentActivity,
  getTask,
  storeChunk,
  logActivity,
} from "../db/queries.js";
import { embed } from "../embedding/index.js";
import {
  AgentState,
  Orientation,
  Task,
  Question,
  Activity,
  Blocker,
} from "../utils/types.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export type WakeTrigger =
  | "scheduled"      // Regular scheduled wake-up
  | "user_input"     // User provided input/answers
  | "manual"         // Explicit user request
  | "continuation";  // Continuing previous session

export interface WakeUpContext {
  projectId: string;
  trigger: WakeTrigger;
  lastWakeTime?: string;  // ISO timestamp of last wake-up
}

export interface WakeUpResult {
  state: AgentState;
  summary: WakeUpSummary;
}

export interface WakeUpSummary {
  projectId: string;
  visionSummary: string;
  currentPhase: string;
  totalTasks: number;
  readyTasks: number;
  blockedTasks: number;
  inProgressTasks: number;
  doneTasks: number;
  openQuestions: number;
  newlyAnsweredQuestions: number;
  recentActivities: number;
}

// =============================================================================
// Wake-Up Flow
// =============================================================================

/**
 * Main wake-up function. Reconstructs agent state from memory.
 */
export async function wakeUp(context: WakeUpContext): Promise<WakeUpResult> {
  const { projectId, trigger, lastWakeTime } = context;

  dbLogger.info("Agent waking up", { projectId, trigger });

  // Step 1: Load Orientation (ALWAYS FIRST)
  const orientation = getOrientation(projectId);

  if (!orientation) {
    dbLogger.warn("No orientation found for project", { projectId });
    return {
      state: {
        status: "error",
        message: `No orientation found for project ${projectId}. Run intake first.`,
        context_loaded: false,
      },
      summary: createEmptySummary(projectId),
    };
  }

  dbLogger.debug("Loaded orientation", {
    vision: orientation.vision_summary.slice(0, 50),
    phase: orientation.current_phase,
    priorities: orientation.active_priorities,
  });

  // Step 2: Load Working State
  const allTasks = getTasks(projectId);
  const openQuestions = getQuestions(projectId, "open");
  const recentActivity = getRecentActivity(projectId, 10);

  // Categorize tasks
  const readyTasks = allTasks.filter((t) => t.status === "ready");
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress");
  const blockedTasks = allTasks.filter((t) => t.status === "blocked");
  const doneTasks = allTasks.filter((t) => t.status === "done");

  dbLogger.debug("Loaded working state", {
    totalTasks: allTasks.length,
    ready: readyTasks.length,
    inProgress: inProgressTasks.length,
    blocked: blockedTasks.length,
    openQuestions: openQuestions.length,
  });

  // Step 3: Check for Newly Answered Questions
  const answeredQuestions = getQuestions(projectId, "answered");
  const newlyAnswered = lastWakeTime
    ? answeredQuestions.filter((q) => q.answered_at && q.answered_at > lastWakeTime)
    : [];

  // Step 4: Process Answers → Store as Knowledge
  for (const question of newlyAnswered) {
    await processAnsweredQuestion(projectId, question);
  }

  // Step 5: Evaluate Work Queue
  const state = evaluateWorkQueue({
    projectId,
    orientation,
    readyTasks,
    inProgressTasks,
    blockedTasks,
    openQuestions,
    recentActivity,
  });

  // Log wake-up activity
  logActivity(projectId, "Agent wake-up", {
    trigger,
    status: state.status,
    readyTasks: readyTasks.length,
    openQuestions: openQuestions.length,
  });

  // Create summary
  const summary: WakeUpSummary = {
    projectId,
    visionSummary: orientation.vision_summary,
    currentPhase: orientation.current_phase,
    totalTasks: allTasks.length,
    readyTasks: readyTasks.length,
    blockedTasks: blockedTasks.length,
    inProgressTasks: inProgressTasks.length,
    doneTasks: doneTasks.length,
    openQuestions: openQuestions.length,
    newlyAnsweredQuestions: newlyAnswered.length,
    recentActivities: recentActivity.length,
  };

  dbLogger.info("Wake-up complete", { status: state.status, summary });

  return { state, summary };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Processes a newly answered question:
 * - Stores the Q&A as a knowledge chunk
 * - Tasks are auto-unblocked by answerQuestion(), but we log it
 */
async function processAnsweredQuestion(
  projectId: string,
  question: Question
): Promise<void> {
  dbLogger.debug("Processing answered question", { questionId: question.id });

  // Store answer as knowledge chunk
  const content = `Question: ${question.question}\n\nAnswer: ${question.answer}\n\nContext: ${question.context}`;

  // Generate tags from question context
  const tags = ["user_answer", "question_response"];

  // Extract any obvious topic tags from the question
  const topicWords = question.question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 3);
  tags.push(...topicWords);

  try {
    const embedding = await embed(content);
    storeChunk(
      projectId,
      content,
      "user_input",
      tags,
      "verified", // User answers are verified
      "user",
      embedding
    );

    dbLogger.debug("Stored answered question as knowledge", {
      questionId: question.id,
    });
  } catch (error) {
    dbLogger.warn("Failed to embed answered question", { error });
    // Still store without embedding
    storeChunk(
      projectId,
      content,
      "user_input",
      tags,
      "verified",
      "user"
    );
  }
}

/**
 * Evaluates the work queue and determines agent state.
 */
function evaluateWorkQueue(params: {
  projectId: string;
  orientation: Orientation;
  readyTasks: Task[];
  inProgressTasks: Task[];
  blockedTasks: Task[];
  openQuestions: Question[];
  recentActivity: Activity[];
}): AgentState {
  const {
    projectId,
    orientation,
    readyTasks,
    inProgressTasks,
    blockedTasks,
    openQuestions,
  } = params;

  // Case 1: Has actionable work
  if (readyTasks.length > 0 || inProgressTasks.length > 0) {
    // Resume in-progress task first, or pick from ready queue
    const currentTask = inProgressTasks[0] || readyTasks[0];

    return {
      status: "ready",
      orientation,
      current_task: currentTask,
      task_queue: readyTasks.filter((t) => t.id !== currentTask?.id),
      open_questions: openQuestions,
      context_loaded: true,
    };
  }

  // Case 2: All tasks blocked
  if (blockedTasks.length > 0) {
    // Check if all blockers are questions
    const allBlockedOnQuestions = blockedTasks.every((task) => {
      // Task is blocked if it has blocked_by entries (question IDs)
      return task.blocked_by.length > 0;
    });

    if (allBlockedOnQuestions && openQuestions.length > 0) {
      return {
        status: "waiting_for_user",
        orientation,
        pending_questions: openQuestions,
        message: `All work blocked on ${openQuestions.length} unanswered question(s)`,
        context_loaded: true,
      };
    }

    // Blocked on dependencies (other tasks)
    return {
      status: "waiting_for_user",
      orientation,
      message: "All tasks blocked on dependencies. Review task structure.",
      context_loaded: true,
    };
  }

  // Case 3: No tasks at all
  const allTasks = getTasks(projectId);
  if (allTasks.length === 0) {
    return {
      status: "ready",
      orientation,
      current_task: null,
      task_queue: [],
      message: "No tasks defined. Ready for planning.",
      context_loaded: true,
    };
  }

  // Case 4: All tasks done
  const doneTasks = allTasks.filter((t) => t.status === "done");
  if (doneTasks.length === allTasks.length) {
    return {
      status: "complete",
      orientation,
      message: "All tasks completed!",
      context_loaded: true,
    };
  }

  // Fallback
  return {
    status: "ready",
    orientation,
    current_task: null,
    task_queue: [],
    context_loaded: true,
  };
}

/**
 * Creates an empty summary for error cases.
 */
function createEmptySummary(projectId: string): WakeUpSummary {
  return {
    projectId,
    visionSummary: "",
    currentPhase: "",
    totalTasks: 0,
    readyTasks: 0,
    blockedTasks: 0,
    inProgressTasks: 0,
    doneTasks: 0,
    openQuestions: 0,
    newlyAnsweredQuestions: 0,
    recentActivities: 0,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Quick check if agent can proceed with work.
 */
export function canProceed(state: AgentState): boolean {
  return state.status === "ready" && state.context_loaded;
}

/**
 * Gets a human-readable status message.
 */
export function getStatusMessage(state: AgentState): string {
  switch (state.status) {
    case "ready":
      if (state.current_task) {
        return `Ready to work on: ${state.current_task.title}`;
      }
      return state.message || "Ready, but no tasks in queue";

    case "waiting_for_user":
      if (state.pending_questions?.length) {
        return `Waiting for answers to ${state.pending_questions.length} question(s)`;
      }
      return state.message || "Waiting for user input";

    case "complete":
      return state.message || "All work complete!";

    case "error":
      return state.message || "Error occurred";

    default:
      return "Unknown state";
  }
}

/**
 * Formats wake-up summary for display.
 */
export function formatWakeUpSummary(summary: WakeUpSummary): string {
  const lines = [
    `Project: ${summary.projectId.slice(0, 8)}...`,
    `Vision: ${summary.visionSummary}`,
    `Phase: ${summary.currentPhase}`,
    ``,
    `Tasks:`,
    `  Ready: ${summary.readyTasks}`,
    `  In Progress: ${summary.inProgressTasks}`,
    `  Blocked: ${summary.blockedTasks}`,
    `  Done: ${summary.doneTasks}`,
    ``,
    `Questions: ${summary.openQuestions} open`,
  ];

  if (summary.newlyAnsweredQuestions > 0) {
    lines.push(`  (${summary.newlyAnsweredQuestions} newly answered)`);
  }

  return lines.join("\n");
}
