/**
 * Orientation Rewrite Module
 *
 * Uses Claude Agent SDK for orientation updates.
 *
 * Architecture:
 * - Visioneer = Memory Brain (provides current state, triggers rewrite)
 * - Claude Code SDK = Execution Hands (analyzes progress, generates updated orientation)
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { Orientation, Task, Goal, Phase } from "../utils/types.js";
import { dbLogger } from "../utils/logger.js";
import { getOrientation, getRecentActivity } from "../db/queries.js";

// =============================================================================
// Types (same as original)
// =============================================================================

export type RewriteTrigger =
  | "major_milestone"
  | "activity_threshold"
  | "goal_change"
  | "user_pivot"
  | "manual";

export interface RewriteResult {
  success: boolean;
  newOrientation?: Orientation;
  previousVersion?: number;
  error?: string;
}

export interface RewriteContext {
  currentOrientation: Orientation;
  taskSummary: {
    total: number;
    ready: number;
    inProgress: number;
    blocked: number;
    done: number;
    recentlyCompleted: string[];
  };
  currentGoal: string | null;
  recentActivitySummary: string[];
  trigger: RewriteTrigger;
  additionalContext?: string;
}

// =============================================================================
// Pivot Signal Detection
// =============================================================================

/**
 * Signal words/phrases that indicate the user wants to change direction.
 * These are checked case-insensitively in user answers.
 */
const PIVOT_SIGNALS = [
  // Direct stop signals
  "stop",
  "halt",
  "abort",
  // Direction change
  "wrong direction",
  "wrong approach",
  "not what i want",
  "not what i meant",
  "misunderstood",
  // Pivot language
  "pivot",
  "change direction",
  "change approach",
  "different approach",
  "new direction",
  "new approach",
  // Start over
  "start over",
  "start fresh",
  "begin again",
  "from scratch",
  // Cancel/reject
  "scrap",
  "forget",
  "ignore",
  "cancel",
  "abandon",
  "drop this",
  // Explicit correction
  "actually",
  "instead",
  "rather than",
  "let's not",
  "don't do",
  // Priority shift
  "focus on something else",
  "more important",
  "priority change",
];

/**
 * Detects if user input contains pivot signals indicating a major direction change.
 *
 * @param content The user's answer or input text
 * @returns true if pivot signals detected, false otherwise
 */
export function detectPivotSignals(content: string): boolean {
  const lower = content.toLowerCase();

  // Check each signal word/phrase
  for (const signal of PIVOT_SIGNALS) {
    if (lower.includes(signal)) {
      dbLogger.info("Pivot signal detected", { signal, contentPreview: content.slice(0, 100) });
      return true;
    }
  }

  return false;
}

/**
 * Extracts the specific pivot signals found in content for logging.
 */
export function extractPivotSignals(content: string): string[] {
  const lower = content.toLowerCase();
  return PIVOT_SIGNALS.filter(signal => lower.includes(signal));
}

// =============================================================================
// Context Building (preserved from original)
// =============================================================================

export function buildRewriteContext(
  orientation: Orientation,
  tasks: Task[],
  goal: Goal | null,
  recentActivity: { action: string; timestamp: string }[],
  trigger: RewriteTrigger,
  additionalContext?: string
): RewriteContext {
  const tasksByStatus = {
    ready: tasks.filter((t) => t.status === "ready"),
    inProgress: tasks.filter((t) => t.status === "in_progress"),
    blocked: tasks.filter((t) => t.status === "blocked"),
    done: tasks.filter((t) => t.status === "done"),
  };

  // Get recently completed tasks (within last orientation period)
  const recentlyCompleted = tasksByStatus.done
    .filter((t) => t.completed_at && t.completed_at > orientation.last_rewritten)
    .map((t) => t.title);

  return {
    currentOrientation: orientation,
    taskSummary: {
      total: tasks.length,
      ready: tasksByStatus.ready.length,
      inProgress: tasksByStatus.inProgress.length,
      blocked: tasksByStatus.blocked.length,
      done: tasksByStatus.done.length,
      recentlyCompleted,
    },
    currentGoal: goal?.goal || null,
    recentActivitySummary: recentActivity.slice(0, 10).map((a) => a.action),
    trigger,
    additionalContext,
  };
}

// =============================================================================
// Prompt Building
// =============================================================================

function buildRewritePrompt(context: RewriteContext): string {
  // Build the critical user feedback section for pivot triggers
  let pivotSection = "";
  if (context.trigger === "user_pivot" && context.additionalContext) {
    pivotSection = `

## CRITICAL USER FEEDBACK - DIRECTION CHANGE REQUIRED

The user has indicated a significant change in direction:

"${context.additionalContext}"

You MUST incorporate this feedback into the updated orientation:
1. UPDATE vision_summary to reflect the new direction
2. REVISE success_criteria to align with user's corrected expectations
3. ADJUST constraints based on any new priorities mentioned
4. MARK affected skills as needing re-evaluation
5. ADD a key_decision documenting this pivot with the user's reasoning
6. RE-PRIORITIZE active_priorities to focus on the new direction
7. UPDATE progress_snapshot to reflect that previous work may no longer apply

This is a PIVOT - the user is explicitly correcting course. Previous assumptions may be invalid.
`;
  }

  // Combine system prompt and user prompt into a single prompt for SDK
  return `You are an AI assistant that helps manage long-running learning and execution projects.
Your task is to update an orientation document based on recent progress.

The orientation document serves as the "strategic brain" of the project, containing:
- Vision summary: What we're trying to achieve
- Success criteria: Concrete, testable outcomes
- Constraints: Time, resources, priorities
- Skill map: Skills being developed with their dependencies
- Current phase: intake, research, planning, execution, refinement, or complete
- Key decisions: Important choices made with reasoning
- Active priorities: Current focus areas (top 3-5)
- Progress snapshot: Status of each major area

When updating the orientation:
1. Preserve the core vision unless it has fundamentally changed
2. Update progress percentages based on completed tasks
3. Refresh priorities based on current goal and what's left to do
4. Update skill statuses (not_started → in_progress → achieved)
5. Add new decisions if warranted
6. Advance the phase if appropriate
7. Update blockers based on current state
${pivotSection}
---

Please update the orientation document based on the following context:

TRIGGER: ${context.trigger}
${context.additionalContext && context.trigger !== "user_pivot" ? `\nADDITIONAL CONTEXT: ${context.additionalContext}` : ""}

CURRENT GOAL: ${context.currentGoal || "No specific goal set"}

CURRENT ORIENTATION:
${JSON.stringify(context.currentOrientation, null, 2)}

TASK SUMMARY:
- Total tasks: ${context.taskSummary.total}
- Ready: ${context.taskSummary.ready}
- In Progress: ${context.taskSummary.inProgress}
- Blocked: ${context.taskSummary.blocked}
- Completed: ${context.taskSummary.done}
- Recently completed (since last rewrite): ${context.taskSummary.recentlyCompleted.join(", ") || "None"}

RECENT ACTIVITY:
${context.recentActivitySummary.length > 0 ? context.recentActivitySummary.map((a) => `- ${a}`).join("\n") : "- No recent activity"}

---

Respond with ONLY a valid JSON object (no markdown code blocks, no extra text). The JSON must have exactly these fields:

{
  "vision_summary": "string - the project vision",
  "success_criteria": ["array of success criteria strings"],
  "constraints": ["array of constraint strings"],
  "skill_map": [
    {
      "skill": "skill name",
      "parent": "parent skill name or null",
      "dependencies": ["array of dependency skill names"],
      "status": "not_started | in_progress | achieved",
      "notes": "brief notes"
    }
  ],
  "current_phase": "intake | research | planning | execution | refinement | complete",
  "key_decisions": [
    {
      "decision": "what was decided",
      "reasoning": "why it was decided",
      "date": "ISO date string"
    }
  ],
  "active_priorities": ["array of 3-5 current priority strings"],
  "progress_snapshot": [
    {
      "area": "area name",
      "status": "not_started | early | progressing | nearly_done | complete",
      "percent": 0-100 or null,
      "blockers": ["array of blocker strings"]
    }
  ]
}

Output ONLY the JSON object now.`;
}

// =============================================================================
// Response Parsing
// =============================================================================

type OrientationData = Omit<Orientation, "project_id" | "last_rewritten" | "version">;

function parseOrientationResponse(
  content: string,
  fallbackOrientation: Orientation
): OrientationData {
  // Try to extract JSON from response
  let jsonStr = content;

  // Try to extract from code block if present
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  // Also try to find raw JSON object
  const jsonObjectMatch = content.match(/\{[\s\S]*"vision_summary"[\s\S]*\}/);
  if (jsonObjectMatch && !codeBlockMatch) {
    jsonStr = jsonObjectMatch[0];
  }

  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.vision_summary || !parsed.current_phase) {
      throw new Error("Missing required fields: vision_summary or current_phase");
    }

    // Validate phase is valid
    const validPhases: Phase[] = ["intake", "research", "planning", "execution", "refinement", "complete"];
    if (!validPhases.includes(parsed.current_phase)) {
      dbLogger.warn("Invalid phase, using current", { received: parsed.current_phase });
      parsed.current_phase = fallbackOrientation.current_phase;
    }

    return {
      vision_summary: parsed.vision_summary,
      success_criteria: Array.isArray(parsed.success_criteria) ? parsed.success_criteria : fallbackOrientation.success_criteria,
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints : fallbackOrientation.constraints,
      skill_map: Array.isArray(parsed.skill_map) ? parsed.skill_map : fallbackOrientation.skill_map,
      current_phase: parsed.current_phase as Phase,
      key_decisions: Array.isArray(parsed.key_decisions) ? parsed.key_decisions : fallbackOrientation.key_decisions,
      active_priorities: Array.isArray(parsed.active_priorities) ? parsed.active_priorities : fallbackOrientation.active_priorities,
      progress_snapshot: Array.isArray(parsed.progress_snapshot) ? parsed.progress_snapshot : fallbackOrientation.progress_snapshot,
    };
  } catch (error) {
    dbLogger.error("Failed to parse orientation response", {
      error: String(error),
      content: content.slice(0, 500),
    });
    throw new Error(`Failed to parse orientation response: ${error}`);
  }
}

// =============================================================================
// Main SDK Rewrite Function
// =============================================================================

/**
 * Rewrites orientation using Claude Agent SDK.
 * This is a pure function that takes context and returns updated orientation data.
 *
 * @param context The rewrite context containing current state
 * @returns Updated orientation data (without project_id, version, last_rewritten)
 */
export async function rewriteOrientation(
  context: RewriteContext
): Promise<OrientationData> {
  dbLogger.info("Starting SDK orientation rewrite", {
    trigger: context.trigger,
    currentPhase: context.currentOrientation.current_phase,
    tasksDone: context.taskSummary.done,
  });

  const prompt = buildRewritePrompt(context);

  try {
    const result = query({
      prompt,
      options: {
        maxTurns: 1, // Single response, no back-and-forth
        allowedTools: [], // No tools needed - pure analysis/summarization
      },
    });

    let responseText = "";
    let sessionId = "";
    let durationMs = 0;

    // Stream through messages to get the result
    for await (const message of result) {
      if (message.type === "system") {
        const msg = message as Record<string, unknown>;
        if (msg.subtype === "init") {
          sessionId = msg.session_id as string;
        }
      }

      if (message.type === "result") {
        const msg = message as Record<string, unknown>;
        responseText = msg.result as string;
        durationMs = msg.duration_ms as number;
      }
    }

    if (!responseText) {
      throw new Error("No response received from SDK");
    }

    dbLogger.debug("SDK orientation rewrite response received", {
      sessionId,
      durationMs,
      responseLength: responseText.length,
    });

    // Parse the response into orientation data
    const orientationData = parseOrientationResponse(responseText, context.currentOrientation);

    dbLogger.info("SDK orientation rewrite complete", {
      newPhase: orientationData.current_phase,
      prioritiesCount: orientationData.active_priorities.length,
      durationMs,
    });

    return orientationData;
  } catch (error) {
    dbLogger.error("SDK orientation rewrite failed", { error: String(error) });
    throw error;
  }
}

/**
 * Convenience function that builds context and rewrites in one call.
 * Mirrors the signature pattern of the original rewriteOrientation.
 */
export async function rewriteOrientationFromState(
  orientation: Orientation,
  tasks: Task[],
  goal: Goal | null,
  recentActivity: { action: string; timestamp: string }[],
  trigger: RewriteTrigger,
  additionalContext?: string
): Promise<Orientation> {
  const context = buildRewriteContext(
    orientation,
    tasks,
    goal,
    recentActivity,
    trigger,
    additionalContext
  );

  const orientationData = await rewriteOrientation(context);

  // Assemble full Orientation object
  return {
    project_id: orientation.project_id,
    ...orientationData,
    last_rewritten: new Date().toISOString(),
    version: orientation.version + 1,
  };
}

// =============================================================================
// Trigger Detection
// =============================================================================

/**
 * Checks if an orientation rewrite should be triggered.
 * Returns the trigger type or null if no rewrite needed.
 */
export function shouldRewriteOrientation(
  projectId: string,
  completedTask?: Task | null
): RewriteTrigger | null {
  const orientation = getOrientation(projectId);
  if (!orientation) return null;

  // Trigger 1: Major milestone (task matches top-level skill)
  if (completedTask) {
    const topLevelSkills = orientation.skill_map
      .filter((s) => s.parent === null)
      .map((s) => s.skill.toLowerCase());

    const taskMatchesTopSkill = topLevelSkills.some(
      (skill) =>
        completedTask.skill_area.toLowerCase().includes(skill) ||
        skill.includes(completedTask.skill_area.toLowerCase())
    );

    if (taskMatchesTopSkill) {
      return "major_milestone";
    }
  }

  // Trigger 2: Activity count threshold
  const recentActivity = getRecentActivity(projectId, 100);
  const activitiesSinceRewrite = recentActivity.filter(
    (a) => a.timestamp > orientation.last_rewritten
  ).length;

  const activityThreshold = 50;
  if (activitiesSinceRewrite >= activityThreshold) {
    return "activity_threshold";
  }

  return null;
}

// =============================================================================
// Pivot Handling
// =============================================================================

import {
  getTasks,
  getActiveGoal,
  cancelTasksForPivot,
  saveOrientation,
  logActivity,
} from "../db/queries.js";

/**
 * Result of handling a user pivot.
 */
export interface PivotResult {
  success: boolean;
  tasksCancelled: number;
  orientationUpdated: boolean;
  newOrientation?: Orientation;
  error?: string;
}

/**
 * Handles a user pivot: cancels tasks, rewrites orientation, triggers fresh planning.
 *
 * This is the main entry point for pivot handling after answerQuestion()
 * detects pivot signals.
 *
 * @param projectId The project ID
 * @param userFeedback The user's feedback containing the pivot direction
 * @param pivotSignals The specific signals detected
 * @returns PivotResult with details of what changed
 */
export async function handlePivot(
  projectId: string,
  userFeedback: string,
  pivotSignals: string[]
): Promise<PivotResult> {
  dbLogger.info("Handling user pivot", {
    projectId,
    pivotSignals,
    feedbackPreview: userFeedback.slice(0, 100),
  });

  try {
    // Step 1: Cancel all non-done tasks
    const cancelReason = `User pivot: ${pivotSignals.join(", ")}`;
    const tasksCancelled = cancelTasksForPivot(projectId, cancelReason);

    dbLogger.info("Tasks cancelled for pivot", { projectId, tasksCancelled });

    // Step 2: Get current state for orientation rewrite
    const orientation = getOrientation(projectId);
    if (!orientation) {
      return {
        success: false,
        tasksCancelled,
        orientationUpdated: false,
        error: "No orientation found for project",
      };
    }

    // Get tasks (will be mostly cancelled now, but include for context)
    const tasks = getTasks(projectId);
    const goal = getActiveGoal(projectId);
    const recentActivity = getRecentActivity(projectId, 20);

    // Step 3: Rewrite orientation with pivot context
    const newOrientation = await rewriteOrientationFromState(
      orientation,
      tasks,
      goal,
      recentActivity.map(a => ({ action: a.action, timestamp: a.timestamp })),
      "user_pivot",
      userFeedback
    );

    // Step 4: Save the new orientation
    saveOrientation(newOrientation);

    // Step 5: Log the pivot activity
    logActivity(projectId, "User pivot processed", {
      tasksCancelled,
      pivotSignals,
      oldPhase: orientation.current_phase,
      newPhase: newOrientation.current_phase,
      orientationVersion: newOrientation.version,
    });

    dbLogger.info("Pivot handling complete", {
      projectId,
      tasksCancelled,
      newOrientationVersion: newOrientation.version,
    });

    return {
      success: true,
      tasksCancelled,
      orientationUpdated: true,
      newOrientation,
    };
  } catch (error) {
    dbLogger.error("Pivot handling failed", { projectId, error: String(error) });
    return {
      success: false,
      tasksCancelled: 0,
      orientationUpdated: false,
      error: String(error),
    };
  }
}

// =============================================================================
// Export aliases for compatibility
// =============================================================================

export { rewriteOrientation as rewriteOrientationSDK };
export { rewriteOrientationFromState as rewriteOrientationFromStateSDK };
