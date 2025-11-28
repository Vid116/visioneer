/**
 * Orientation Rewrite Module
 *
 * Handles the automatic rewriting of the orientation document when triggers occur.
 * This module summarizes progress, updates the skill map, and refreshes priorities.
 */

import Anthropic from "@anthropic-ai/sdk";
import { Orientation, Task, Goal, Phase } from "../utils/types.js";
import {
  getOrientation,
  saveOrientation,
  getTasks,
  getActiveGoal,
  getRecentActivity,
  storeChunk,
  logActivity,
} from "../db/queries.js";
import { getAgentConfig } from "../utils/config.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export type RewriteTrigger =
  | "major_milestone"
  | "activity_threshold"
  | "goal_change"
  | "manual";

export interface RewriteResult {
  success: boolean;
  newOrientation?: Orientation;
  previousVersion?: number;
  error?: string;
}

// =============================================================================
// Main Rewrite Function
// =============================================================================

/**
 * Performs an orientation rewrite.
 * This calls Claude to generate an updated orientation based on progress.
 */
export async function rewriteOrientation(
  projectId: string,
  trigger: RewriteTrigger,
  additionalContext?: string
): Promise<RewriteResult> {
  dbLogger.info("Starting orientation rewrite", { projectId, trigger });

  // Get current state
  const currentOrientation = getOrientation(projectId);
  if (!currentOrientation) {
    return {
      success: false,
      error: "No orientation found for project",
    };
  }

  const allTasks = getTasks(projectId);
  const recentActivity = getRecentActivity(projectId, 20);
  const currentGoal = getActiveGoal(projectId);

  // Archive current orientation
  storeChunk(
    projectId,
    JSON.stringify(currentOrientation),
    "decision",
    ["orientation_archive", `v${currentOrientation.version}`],
    "verified",
    "deduction"
  );

  try {
    // Build context for Claude
    const context = buildRewriteContext(
      currentOrientation,
      allTasks,
      currentGoal,
      recentActivity,
      trigger,
      additionalContext
    );

    // Call Claude for rewrite
    const newOrientationData = await callClaudeForRewrite(context);

    if (!newOrientationData) {
      return {
        success: false,
        error: "Failed to generate new orientation",
      };
    }

    // Create and save new orientation
    const newOrientation: Orientation = {
      project_id: projectId,
      ...newOrientationData,
      last_rewritten: new Date().toISOString(),
      version: currentOrientation.version + 1,
    };

    saveOrientation(newOrientation);

    logActivity(projectId, "Orientation rewritten", {
      trigger,
      previousVersion: currentOrientation.version,
      newVersion: newOrientation.version,
    });

    dbLogger.info("Orientation rewrite complete", {
      projectId,
      newVersion: newOrientation.version,
    });

    return {
      success: true,
      newOrientation,
      previousVersion: currentOrientation.version,
    };
  } catch (error) {
    dbLogger.error("Orientation rewrite failed", { projectId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Context Building
// =============================================================================

interface RewriteContext {
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

function buildRewriteContext(
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
// Claude API Call
// =============================================================================

async function callClaudeForRewrite(
  context: RewriteContext
): Promise<Omit<Orientation, "project_id" | "last_rewritten" | "version"> | null> {
  const config = getAgentConfig();
  const client = new Anthropic();

  const systemPrompt = `You are an AI assistant that helps manage long-running learning and execution projects.
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

Return ONLY valid JSON matching the orientation structure.`;

  const userPrompt = `Please update the orientation document based on the following context:

TRIGGER: ${context.trigger}
${context.additionalContext ? `\nADDITIONAL CONTEXT: ${context.additionalContext}` : ""}

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
${context.recentActivitySummary.map((a) => `- ${a}`).join("\n")}

Please provide an updated orientation document. The response should be a valid JSON object with these fields:
- vision_summary (string)
- success_criteria (array of strings)
- constraints (array of strings)
- skill_map (array of skill objects)
- current_phase (one of: intake, research, planning, execution, refinement, complete)
- key_decisions (array of decision objects with decision, reasoning, date fields)
- active_priorities (array of strings, top 3-5)
- progress_snapshot (array of progress objects)`;

  try {
    const response = await client.messages.create({
      model: config.model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    // Extract text from response
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      dbLogger.error("No text content in Claude response");
      return null;
    }

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      dbLogger.error("No JSON found in Claude response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (
      !parsed.vision_summary ||
      !parsed.success_criteria ||
      !parsed.current_phase
    ) {
      dbLogger.error("Missing required fields in orientation response");
      return null;
    }

    return {
      vision_summary: parsed.vision_summary,
      success_criteria: parsed.success_criteria,
      constraints: parsed.constraints || [],
      skill_map: parsed.skill_map || [],
      current_phase: parsed.current_phase as Phase,
      key_decisions: parsed.key_decisions || [],
      active_priorities: parsed.active_priorities || [],
      progress_snapshot: parsed.progress_snapshot || [],
    };
  } catch (error) {
    dbLogger.error("Claude API call failed for orientation rewrite", { error });
    return null;
  }
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

/**
 * Checks for rewrite trigger and performs rewrite if needed.
 * Returns the result if a rewrite occurred, null otherwise.
 */
export async function checkAndRewriteOrientation(
  projectId: string,
  completedTask?: Task | null
): Promise<RewriteResult | null> {
  const trigger = shouldRewriteOrientation(projectId, completedTask);

  if (!trigger) {
    return null;
  }

  return rewriteOrientation(projectId, trigger);
}
