/**
 * Task Prioritization System
 *
 * Scores and orders tasks based on multiple factors:
 * 1. Active priorities (from orientation)
 * 2. Dependencies satisfied
 * 3. Skill area balance (avoid consecutive same-area work)
 * 4. Phase alignment (research tasks in research phase, etc.)
 * 5. Age (older tasks get slight priority boost)
 * 6. Goal alignment (how well task matches current goal)
 */

import { Task, Orientation, Activity, Goal } from "../utils/types.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export interface ScoredTask {
  task: Task;
  score: number;
  factors: ScoreFactors;
}

export interface ScoreFactors {
  priorityScore: number;
  dependencyScore: number;
  balanceScore: number;
  phaseScore: number;
  ageScore: number;
  goalScore: number;
}

export interface PrioritizationConfig {
  priorityWeight: number;      // Weight for priority matching
  dependencyWeight: number;    // Weight for dependency satisfaction
  balanceWeight: number;       // Weight for skill area balance
  phaseWeight: number;         // Weight for phase alignment
  ageWeight: number;           // Weight for task age
  goalWeight: number;          // Weight for goal alignment
  recentAreaPenalty: number;   // Penalty for same area in recent tasks
  recentAreaWindow: number;    // How many recent activities to check
}

const DEFAULT_CONFIG: PrioritizationConfig = {
  priorityWeight: 10,
  dependencyWeight: 5,
  balanceWeight: 2,
  phaseWeight: 3,
  ageWeight: 1,
  goalWeight: 8,               // Goal alignment is important
  recentAreaPenalty: 2,
  recentAreaWindow: 3,
};

// =============================================================================
// Main Prioritization Function
// =============================================================================

/**
 * Prioritizes tasks based on orientation, recent activity, and current goal.
 * Returns tasks sorted by score (highest first).
 */
export function prioritizeTasks(
  tasks: Task[],
  orientation: Orientation,
  recentActivity: Activity[],
  currentGoal?: Goal | null,
  config: Partial<PrioritizationConfig> = {}
): ScoredTask[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (tasks.length === 0) {
    return [];
  }

  // Extract recent skill areas from activity
  const recentAreas = extractRecentAreas(recentActivity, cfg.recentAreaWindow);

  // Score each task
  const scoredTasks: ScoredTask[] = tasks.map((task) => {
    const factors = calculateScoreFactors(task, orientation, recentAreas, currentGoal, cfg);
    const score = calculateTotalScore(factors, cfg);

    return { task, score, factors };
  });

  // Sort by score (descending)
  scoredTasks.sort((a, b) => b.score - a.score);

  dbLogger.debug("Prioritized tasks", {
    count: scoredTasks.length,
    top: scoredTasks[0]?.task.title,
    topScore: scoredTasks[0]?.score,
    hasGoal: !!currentGoal,
  });

  return scoredTasks;
}

/**
 * Simple version that just returns sorted tasks.
 */
export function prioritizeTasksSimple(
  tasks: Task[],
  orientation: Orientation,
  recentActivity: Activity[],
  currentGoal?: Goal | null
): Task[] {
  return prioritizeTasks(tasks, orientation, recentActivity, currentGoal).map((st) => st.task);
}

// =============================================================================
// Score Calculation
// =============================================================================

function calculateScoreFactors(
  task: Task,
  orientation: Orientation,
  recentAreas: string[],
  currentGoal: Goal | null | undefined,
  config: PrioritizationConfig
): ScoreFactors {
  return {
    priorityScore: calculatePriorityScore(task, orientation),
    dependencyScore: calculateDependencyScore(task),
    balanceScore: calculateBalanceScore(task, recentAreas, config),
    phaseScore: calculatePhaseScore(task, orientation),
    ageScore: calculateAgeScore(task),
    goalScore: calculateGoalScore(task, currentGoal),
  };
}

function calculateTotalScore(
  factors: ScoreFactors,
  config: PrioritizationConfig
): number {
  return (
    factors.priorityScore * config.priorityWeight +
    factors.dependencyScore * config.dependencyWeight +
    factors.balanceScore * config.balanceWeight +
    factors.phaseScore * config.phaseWeight +
    factors.ageScore * config.ageWeight +
    factors.goalScore * config.goalWeight
  );
}

// =============================================================================
// Individual Factor Calculations
// =============================================================================

/**
 * Factor 1: Active Priorities
 * Higher score if task matches earlier priorities in the list.
 */
function calculatePriorityScore(task: Task, orientation: Orientation): number {
  let score = 0;

  const taskTitle = task.title.toLowerCase();
  const taskArea = task.skill_area.toLowerCase();
  const taskDesc = task.description.toLowerCase();

  for (let i = 0; i < orientation.active_priorities.length; i++) {
    const priority = orientation.active_priorities[i].toLowerCase();

    // Check if priority matches task
    if (
      taskTitle.includes(priority) ||
      taskArea.includes(priority) ||
      taskDesc.includes(priority) ||
      priority.includes(taskArea)
    ) {
      // Earlier priorities score higher (10, 9, 8, ...)
      score = Math.max(score, 10 - i);
    }
  }

  // Also check skill_map for matching skills
  for (const skill of orientation.skill_map) {
    if (
      skill.skill.toLowerCase().includes(taskArea) ||
      taskArea.includes(skill.skill.toLowerCase())
    ) {
      // Skills marked as in_progress get a boost
      if (skill.status === "in_progress") {
        score += 2;
      }
      break;
    }
  }

  return score;
}

/**
 * Factor 2: Dependencies Satisfied
 * Tasks with no dependencies or all dependencies done score higher.
 */
function calculateDependencyScore(task: Task): number {
  // No dependencies = full score
  if (task.depends_on.length === 0) {
    return 1.0;
  }

  // Has dependencies but is ready = dependencies must be satisfied
  if (task.status === "ready") {
    return 0.8;
  }

  // Blocked = lower score
  if (task.status === "blocked") {
    return 0.0;
  }

  return 0.5;
}

/**
 * Factor 3: Skill Area Balance
 * Penalize tasks in the same area as recent work to encourage variety.
 */
function calculateBalanceScore(
  task: Task,
  recentAreas: string[],
  config: PrioritizationConfig
): number {
  const taskArea = task.skill_area.toLowerCase();

  // Count how many recent activities were in the same area
  const sameAreaCount = recentAreas.filter(
    (area) => area.toLowerCase() === taskArea
  ).length;

  // Start at 1.0, subtract penalty for each same-area task
  const score = 1.0 - sameAreaCount * (config.recentAreaPenalty / 10);

  return Math.max(0, score);
}

/**
 * Factor 4: Phase Alignment
 * Tasks that match the current phase get a boost.
 */
function calculatePhaseScore(task: Task, orientation: Orientation): number {
  const phase = orientation.current_phase;
  const titleLower = task.title.toLowerCase();
  const descLower = task.description.toLowerCase();

  switch (phase) {
    case "intake":
      // Clarification and setup tasks
      if (titleLower.includes("clarify") || titleLower.includes("setup")) {
        return 1.0;
      }
      break;

    case "research":
      // Research and learning tasks
      if (
        titleLower.includes("research") ||
        titleLower.includes("learn") ||
        titleLower.includes("study") ||
        titleLower.includes("understand")
      ) {
        return 1.0;
      }
      break;

    case "planning":
      // Planning and design tasks
      if (
        titleLower.includes("plan") ||
        titleLower.includes("design") ||
        titleLower.includes("outline")
      ) {
        return 1.0;
      }
      break;

    case "execution":
      // Practice, build, implement tasks
      if (
        titleLower.includes("practice") ||
        titleLower.includes("build") ||
        titleLower.includes("implement") ||
        titleLower.includes("create") ||
        descLower.includes("practice")
      ) {
        return 1.0;
      }
      break;

    case "refinement":
      // Polish, optimize, improve tasks
      if (
        titleLower.includes("refine") ||
        titleLower.includes("polish") ||
        titleLower.includes("optimize") ||
        titleLower.includes("improve")
      ) {
        return 1.0;
      }
      break;

    case "complete":
      // Wrap-up tasks
      if (
        titleLower.includes("review") ||
        titleLower.includes("document") ||
        titleLower.includes("finalize")
      ) {
        return 1.0;
      }
      break;
  }

  return 0.5; // Neutral score for non-matching tasks
}

/**
 * Factor 5: Task Age
 * Older tasks get a slight priority boost to prevent starvation.
 */
function calculateAgeScore(task: Task): number {
  const created = new Date(task.created_at).getTime();
  const now = Date.now();
  const ageHours = (now - created) / (1000 * 60 * 60);

  // Gradual increase up to 1.0 over 72 hours
  return Math.min(1.0, ageHours / 72);
}

/**
 * Factor 6: Goal Alignment
 * Higher score if task aligns with the current goal.
 */
function calculateGoalScore(task: Task, currentGoal: Goal | null | undefined): number {
  if (!currentGoal) {
    // No goal set, neutral score
    return 0.5;
  }

  const goalLower = currentGoal.goal.toLowerCase();
  const taskTitle = task.title.toLowerCase();
  const taskDesc = task.description.toLowerCase();
  const taskArea = task.skill_area.toLowerCase();

  // Extract keywords from goal (simple word tokenization)
  const goalWords = goalLower
    .split(/\s+/)
    .filter((word) => word.length > 3) // Ignore short words
    .filter((word) => !["the", "and", "for", "with", "that", "this", "from", "about"].includes(word));

  let matchCount = 0;
  let strongMatch = false;

  for (const word of goalWords) {
    if (taskTitle.includes(word)) {
      matchCount += 2; // Title matches are stronger
      strongMatch = true;
    }
    if (taskDesc.includes(word)) {
      matchCount += 1;
    }
    if (taskArea.includes(word)) {
      matchCount += 1.5;
      strongMatch = true;
    }
  }

  // Also check if skill area is mentioned in goal
  if (goalLower.includes(taskArea)) {
    matchCount += 3;
    strongMatch = true;
  }

  // Normalize score between 0 and 1
  // Strong match = at least 0.7, weak match scales from 0.3 to 0.7
  if (strongMatch) {
    return Math.min(1.0, 0.7 + matchCount * 0.05);
  } else if (matchCount > 0) {
    return Math.min(0.7, 0.3 + matchCount * 0.1);
  }

  // No match - might be off-track
  return 0.2;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extracts skill areas from recent activity.
 */
function extractRecentAreas(activities: Activity[], limit: number): string[] {
  const areas: string[] = [];

  for (const activity of activities.slice(0, limit)) {
    if (activity.details?.skill_area) {
      areas.push(activity.details.skill_area as string);
    }
  }

  return areas;
}

/**
 * Gets a readable explanation of why a task was prioritized.
 */
export function explainPrioritization(scored: ScoredTask): string {
  const { task, score, factors } = scored;

  const reasons: string[] = [];

  if (factors.priorityScore > 5) {
    reasons.push("matches active priority");
  }

  if (factors.dependencyScore === 1.0) {
    reasons.push("no dependencies");
  }

  if (factors.balanceScore === 1.0) {
    reasons.push("different skill area (variety)");
  } else if (factors.balanceScore < 0.5) {
    reasons.push("same area as recent work (lower priority)");
  }

  if (factors.phaseScore === 1.0) {
    reasons.push("aligns with current phase");
  }

  if (factors.ageScore > 0.5) {
    reasons.push("older task (prevent starvation)");
  }

  if (factors.goalScore >= 0.7) {
    reasons.push("aligns with current goal");
  } else if (factors.goalScore < 0.3) {
    reasons.push("may be off-track from goal");
  }

  return `${task.title} (score: ${score.toFixed(1)}) - ${reasons.join(", ") || "baseline priority"}`;
}

/**
 * Gets the next task to work on from a prioritized list.
 */
export function getNextTask(scoredTasks: ScoredTask[]): Task | null {
  if (scoredTasks.length === 0) {
    return null;
  }

  return scoredTasks[0].task;
}

/**
 * Filters to only actionable (ready) tasks, then prioritizes.
 */
export function getActionableTasks(
  allTasks: Task[],
  orientation: Orientation,
  recentActivity: Activity[],
  currentGoal?: Goal | null
): ScoredTask[] {
  const readyTasks = allTasks.filter((t) => t.status === "ready");
  return prioritizeTasks(readyTasks, orientation, recentActivity, currentGoal);
}
