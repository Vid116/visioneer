/**
 * Coherence Check Module
 *
 * Checks if a task aligns with the current goal before execution.
 *
 * DESIGN PRINCIPLES:
 * - Trust the planner: Tasks created from goal breakdown are presumed coherent
 * - Be permissive: Only flag obvious misalignments, not subtle ones
 * - Warnings are advisory: Don't permanently block tasks
 * - Common skill areas (research, practice, fundamentals) are always valid
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
  minAlignmentScore: 0.2,  // Very permissive - only catch obvious misalignments
  strictMode: false,
};

// Skill areas that are universally valid for any learning/building goal
const UNIVERSAL_SKILL_AREAS = new Set([
  "research",
  "fundamentals",
  "basics",
  "foundation",
  "practice",
  "technique",
  "theory",
  "application",
  "project",
  "review",
  "general",
  "learning",
  "study",
  "exploration",
]);

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

  // NOTE: We no longer block tasks just because they have an unresolved warning.
  // Warnings are advisory, not blocking. The user can resolve them if needed.
  // Previous behavior permanently blocked tasks, which was wrong.

  // Calculate alignment score
  const alignmentResult = calculateAlignment(task, currentGoal);

  // Check against threshold
  const threshold = cfg.strictMode ? 0.4 : cfg.minAlignmentScore;

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

  // Only create warning if one doesn't already exist for this task
  if (hasUnresolvedWarning(task.id)) {
    dbLogger.debug("Task already has warning, skipping", { taskId: task.id });
    return { proceed: false };
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

  let score = 0.3; // Start with a baseline - assume some alignment

  // RULE 1: Universal skill areas are always valid
  // Research, practice, fundamentals, etc. are valid for ANY learning goal
  if (UNIVERSAL_SKILL_AREAS.has(taskArea)) {
    score += 0.4; // Strong boost for universal areas
  }

  // RULE 2: Extract meaningful keywords and check overlap
  const goalKeywords = extractKeywords(goalLower);
  const taskKeywords = extractKeywords(taskTitle + " " + taskDesc);

  // Check for keyword overlap (flexible matching)
  const overlap = findOverlap(goalKeywords, taskKeywords);
  if (overlap.length > 0) {
    score += Math.min(0.4, overlap.length * 0.15);
  }

  // RULE 3: Check if skill area relates to goal subject
  const goalSubject = extractSubject(goalLower);
  if (goalSubject && (
    taskArea.includes(goalSubject) ||
    goalSubject.includes(taskArea) ||
    taskTitle.includes(goalSubject) ||
    taskDesc.includes(goalSubject)
  )) {
    score += 0.3;
  }

  // RULE 4: Direct action-object matching
  if (isDirectlyRelated(task, goal)) {
    score += 0.2;
  }

  // Cap at 1.0
  score = Math.min(1.0, score);

  // Only generate concern for very low scores
  if (score < 0.2) {
    return {
      score,
      concern: `Task "${task.title}" may be unrelated to goal "${goal.goal}"`,
      suggestion: "Consider whether this task helps achieve the goal, or skip it",
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
    "learn", "understand", "study", "practice", "master", "improve",
    "basics", "basic", "fundamental", "fundamentals", "introduction",
  ]);

  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function extractSubject(goalText: string): string | null {
  // Extract the main subject from goals like "learn chess", "build a product"
  const patterns = [
    /learn\s+(?:the\s+)?(?:basics\s+of\s+)?(.+)/i,
    /understand\s+(.+)/i,
    /master\s+(.+)/i,
    /build\s+(?:a\s+)?(.+)/i,
    /create\s+(?:a\s+)?(.+)/i,
    /develop\s+(.+)/i,
    /practice\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = goalText.match(pattern);
    if (match) {
      // Return first significant word of the subject
      const subject = match[1].trim().split(/\s+/)[0];
      if (subject.length > 2) {
        return subject.toLowerCase();
      }
    }
  }

  // Fallback: return longest word that's not a common word
  const words = extractKeywords(goalText);
  if (words.length > 0) {
    return words.sort((a, b) => b.length - a.length)[0];
  }

  return null;
}

function findOverlap(keywords1: string[], keywords2: string[]): string[] {
  const overlap: string[] = [];

  for (const word1 of keywords1) {
    for (const word2 of keywords2) {
      // Exact match
      if (word1 === word2) {
        overlap.push(word1);
        continue;
      }
      // Partial match (one contains the other, min 4 chars)
      if (word1.length >= 4 && word2.length >= 4) {
        if (word1.includes(word2) || word2.includes(word1)) {
          overlap.push(word1);
        }
      }
      // Stem matching (rudimentary)
      if (word1.length >= 5 && word2.length >= 5) {
        const stem1 = word1.slice(0, -2);
        const stem2 = word2.slice(0, -2);
        if (stem1 === stem2) {
          overlap.push(word1);
        }
      }
    }
  }

  return [...new Set(overlap)]; // Deduplicate
}

function isDirectlyRelated(task: Task, goal: Goal): boolean {
  const goalLower = goal.goal.toLowerCase();
  const taskTitle = task.title.toLowerCase();
  const taskDesc = task.description.toLowerCase();

  // Check for common goal patterns
  const goalActions = ["learn", "build", "create", "develop", "improve", "master", "practice"];

  for (const action of goalActions) {
    if (goalLower.includes(action)) {
      // Extract the subject after the action
      const goalSubjectMatch = goalLower.match(new RegExp(`${action}\\s+(?:the\\s+)?(?:basics\\s+of\\s+)?(.+)`, "i"));
      if (goalSubjectMatch) {
        const goalWords = goalSubjectMatch[1].split(/\s+/).slice(0, 3);
        for (const word of goalWords) {
          if (word.length > 3 && (taskTitle.includes(word) || taskDesc.includes(word))) {
            return true;
          }
        }
      }
    }
  }

  return false;
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
