/**
 * Coherence Check Module
 *
 * Checks if a task aligns with the current goal before execution.
 * If misaligned, creates a warning and skips to the next task.
 */

import { Task, Goal, CoherenceWarning } from "../utils/types.js";
import { createCoherenceWarning, hasUnresolvedWarning } from "../db/queries.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export interface CoherenceCheckResult {
  pass: boolean;
  concern?: string;
  suggestion?: string;
  score: number; // 0-1, higher is more aligned
}

export interface CoherenceConfig {
  minAlignmentScore: number; // Below this, task is flagged
  strictMode: boolean;       // If true, flag even moderate misalignments
}

const DEFAULT_CONFIG: CoherenceConfig = {
  minAlignmentScore: 0.3,
  strictMode: false,
};

// =============================================================================
// Main Coherence Check
// =============================================================================

/**
 * Checks if a task is coherent with the current goal.
 * Returns a result indicating whether to proceed with the task.
 */
export function checkCoherence(
  task: Task,
  currentGoal: Goal | null,
  config: Partial<CoherenceConfig> = {}
): CoherenceCheckResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // No goal set - always pass
  if (!currentGoal) {
    return {
      pass: true,
      score: 1.0,
    };
  }

  // Check if task already has an unresolved warning
  if (hasUnresolvedWarning(task.id)) {
    return {
      pass: false,
      concern: "Task has an unresolved coherence warning",
      score: 0,
    };
  }

  // Calculate alignment score
  const alignmentResult = calculateAlignment(task, currentGoal);

  // Check against threshold
  const threshold = cfg.strictMode ? 0.5 : cfg.minAlignmentScore;

  if (alignmentResult.score < threshold) {
    return {
      pass: false,
      concern: alignmentResult.concern,
      suggestion: alignmentResult.suggestion,
      score: alignmentResult.score,
    };
  }

  return {
    pass: true,
    score: alignmentResult.score,
  };
}

/**
 * Runs coherence check and creates a warning if needed.
 * Returns true if task should proceed, false if skipped.
 */
export function enforceCoherence(
  task: Task,
  currentGoal: Goal | null,
  config: Partial<CoherenceConfig> = {}
): { proceed: boolean; warning?: CoherenceWarning } {
  const result = checkCoherence(task, currentGoal, config);

  if (result.pass) {
    dbLogger.debug("Coherence check passed", {
      taskId: task.id,
      taskTitle: task.title,
      score: result.score,
    });
    return { proceed: true };
  }

  // Create warning
  const warning = createCoherenceWarning(
    task.id,
    task.project_id,
    result.concern || "Task may not align with current goal",
    result.suggestion
  );

  dbLogger.info("Coherence check failed, warning created", {
    taskId: task.id,
    taskTitle: task.title,
    score: result.score,
    warningId: warning.id,
    concern: result.concern,
  });

  return { proceed: false, warning };
}

// =============================================================================
// Alignment Calculation
// =============================================================================

interface AlignmentResult {
  score: number;
  concern?: string;
  suggestion?: string;
}

function calculateAlignment(task: Task, goal: Goal): AlignmentResult {
  const goalLower = goal.goal.toLowerCase();
  const taskTitle = task.title.toLowerCase();
  const taskDesc = task.description.toLowerCase();
  const taskArea = task.skill_area.toLowerCase();

  // Extract meaningful words from goal
  const goalWords = extractKeywords(goalLower);
  const taskWords = extractKeywords(taskTitle + " " + taskDesc);

  // Calculate word overlap
  const overlap = goalWords.filter((word) =>
    taskWords.some((tw) => tw.includes(word) || word.includes(tw))
  );

  // Check skill area alignment
  const areaAligned = goalWords.some((word) =>
    taskArea.includes(word) || word.includes(taskArea)
  ) || goalLower.includes(taskArea);

  // Calculate base score
  let score = 0;

  if (areaAligned) {
    score += 0.4;
  }

  if (overlap.length > 0) {
    score += Math.min(0.4, overlap.length * 0.1);
  }

  // Check for specific alignment patterns
  if (isDirectlyRelated(task, goal)) {
    score += 0.3;
  }

  // Cap at 1.0
  score = Math.min(1.0, score);

  // Generate concern and suggestion for low scores
  if (score < 0.3) {
    return {
      score,
      concern: generateConcern(task, goal, areaAligned, overlap.length),
      suggestion: generateSuggestion(task, goal),
    };
  }

  return { score };
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can", "this",
    "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    "what", "which", "who", "whom", "how", "when", "where", "why",
  ]);

  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function isDirectlyRelated(task: Task, goal: Goal): boolean {
  const goalLower = goal.goal.toLowerCase();
  const taskTitle = task.title.toLowerCase();

  // Check for action-goal patterns
  const goalActions = ["learn", "build", "create", "develop", "improve", "master", "practice"];

  for (const action of goalActions) {
    if (goalLower.includes(action)) {
      // Extract the subject after the action
      const goalSubjectMatch = goalLower.match(new RegExp(`${action}\\s+(.+)`, "i"));
      if (goalSubjectMatch) {
        const goalSubject = goalSubjectMatch[1].split(/\s+/).slice(0, 3).join(" ");
        if (taskTitle.includes(goalSubject.split(" ")[0])) {
          return true;
        }
      }
    }
  }

  return false;
}

function generateConcern(
  task: Task,
  goal: Goal,
  areaAligned: boolean,
  overlapCount: number
): string {
  if (!areaAligned && overlapCount === 0) {
    return `Task "${task.title}" appears unrelated to goal "${goal.goal}"`;
  }

  if (!areaAligned) {
    return `Task skill area "${task.skill_area}" doesn't match the goal focus`;
  }

  if (overlapCount === 0) {
    return `Task content doesn't clearly connect to the goal`;
  }

  return `Task may be tangential to the main goal`;
}

function generateSuggestion(task: Task, goal: Goal): string {
  const goalLower = goal.goal.toLowerCase();

  // Check if this might be research vs practice mismatch
  if (goalLower.includes("practice") || goalLower.includes("learn")) {
    if (task.title.toLowerCase().includes("research") ||
        task.title.toLowerCase().includes("compare") ||
        task.title.toLowerCase().includes("analyze")) {
      return "Consider focusing on hands-on practice rather than research";
    }
  }

  // Check if this might be too broad
  if (task.title.toLowerCase().includes("all") ||
      task.title.toLowerCase().includes("comprehensive") ||
      task.title.toLowerCase().includes("complete")) {
    return "Consider breaking this into smaller, goal-focused tasks";
  }

  // Generic suggestion
  return "Skip this task or modify it to align with the current goal";
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Checks coherence for multiple tasks.
 * Returns tasks grouped by whether they pass coherence checks.
 */
export function batchCoherenceCheck(
  tasks: Task[],
  currentGoal: Goal | null,
  config: Partial<CoherenceConfig> = {}
): { coherent: Task[]; flagged: Task[] } {
  const coherent: Task[] = [];
  const flagged: Task[] = [];

  for (const task of tasks) {
    const result = checkCoherence(task, currentGoal, config);
    if (result.pass) {
      coherent.push(task);
    } else {
      flagged.push(task);
    }
  }

  return { coherent, flagged };
}

/**
 * Gets the coherence score for a task (for display/sorting).
 */
export function getCoherenceScore(task: Task, currentGoal: Goal | null): number {
  if (!currentGoal) return 1.0;

  const result = calculateAlignment(task, currentGoal);
  return result.score;
}
