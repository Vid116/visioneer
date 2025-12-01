/**
 * Goal-to-Tasks Planner
 *
 * Uses Claude Agent SDK for task planning.
 *
 * Architecture:
 * - Visioneer = Memory Brain (provides context)
 * - Claude Code SDK = Execution Hands (does the planning work)
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { Orientation, Goal } from "../utils/types.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types (same as original planner.ts)
// =============================================================================

export interface PlannedTask {
  title: string;
  description: string;
  skill_area: string;
  depends_on: string[]; // Titles of tasks this depends on (resolved to IDs later)
}

interface ClaudePlanningResponse {
  tasks: Array<{
    title: string;
    description: string;
    skill_area: string;
    depends_on: string[];
  }>;
}

// =============================================================================
// Planning Prompt (preserved from original)
// =============================================================================

function buildPlanningPrompt(orientation: Orientation, goal: Goal): string {
  // Build progress section if there are incomplete areas
  let progressSection = "";
  if (orientation.progress_snapshot && orientation.progress_snapshot.length > 0) {
    const incompleteAreas = orientation.progress_snapshot.filter(
      (p) => p.status !== "complete" && (p.percent === null || p.percent < 100)
    );
    const completeAreas = orientation.progress_snapshot.filter(
      (p) => p.status === "complete" || p.percent === 100
    );

    if (incompleteAreas.length > 0 || completeAreas.length > 0) {
      progressSection = `

**Progress Status:**
${completeAreas.length > 0 ? `Completed areas (DO NOT create tasks for these): ${completeAreas.map((a) => a.area).join(", ")}` : ""}
${incompleteAreas.length > 0 ? `Incomplete areas (PRIORITIZE these): ${incompleteAreas.map((a) => `${a.area} (${a.percent ?? 0}% - ${a.status})`).join(", ")}` : ""}`;
    }
  }

  return `You are a planning assistant for the Visioneer autonomous learning system.

## Project Context

**Vision:** ${orientation.vision_summary}

**Current Phase:** ${orientation.current_phase}

**Active Priorities:**
${orientation.active_priorities.map((p) => `- ${p}`).join("\n")}

**Success Criteria:**
${orientation.success_criteria.map((c) => `- ${c}`).join("\n")}${progressSection}

## Current Goal

"${goal.goal}"

## Your Task

Break down this goal into 3-7 concrete, actionable tasks that the agent can execute. Each task should:

1. Be specific and achievable in a single work session
2. Have a clear outcome
3. Build toward the overall goal
4. Include any necessary research or learning steps

Consider what skills, knowledge, or research are needed to achieve the goal. Start with foundational tasks (research, learning basics) before moving to application tasks.

## Response Format

Respond with ONLY a JSON object (no markdown code blocks, no extra text). The JSON must have this exact structure:

{
  "tasks": [
    {
      "title": "Short, action-oriented title",
      "description": "Detailed description of what to do and what outcome is expected",
      "skill_area": "Category like 'research', 'fundamentals', 'practice', 'application', etc.",
      "depends_on": ["Title of any task this depends on", "or empty array if none"]
    }
  ]
}

### Guidelines

- Start with research/learning tasks before practice/application tasks
- Use depends_on to create a logical sequence (task titles, not IDs)
- First 1-2 tasks usually have no dependencies
- skill_area helps categorize: "research", "fundamentals", "technique", "practice", "project", "review"
- Keep descriptions focused but informative (2-3 sentences)

Create the task breakdown now. Output ONLY the JSON object.`;
}

// =============================================================================
// Response Parsing (same logic as original)
// =============================================================================

function parsePlanningResponse(content: string): PlannedTask[] {
  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = content;

  // Try to extract from code block if present
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  // Also try to find raw JSON object
  const jsonObjectMatch = content.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
  if (jsonObjectMatch && !codeBlockMatch) {
    jsonStr = jsonObjectMatch[0];
  }

  // Clean up
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr) as ClaudePlanningResponse;

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error("Response missing tasks array");
    }

    // Validate and clean tasks
    const tasks: PlannedTask[] = [];

    for (const task of parsed.tasks) {
      if (!task.title || !task.description) {
        dbLogger.warn("Skipping invalid task", { task });
        continue;
      }

      tasks.push({
        title: task.title,
        description: task.description,
        skill_area: task.skill_area || "general",
        depends_on: Array.isArray(task.depends_on) ? task.depends_on : [],
      });
    }

    if (tasks.length === 0) {
      throw new Error("No valid tasks in response");
    }

    return tasks;
  } catch (error) {
    dbLogger.error("Failed to parse planning response", {
      error: String(error),
      content: content.slice(0, 500),
    });
    throw new Error(`Failed to parse planning response: ${error}`);
  }
}

// =============================================================================
// Main SDK Planning Function
// =============================================================================

/**
 * Plans tasks from a goal using Claude Agent SDK.
 *
 * @param orientation Current project orientation (context)
 * @param goal The goal to plan for
 * @returns Array of planned tasks
 */
export async function planTasksFromGoal(
  orientation: Orientation,
  goal: Goal
): Promise<PlannedTask[]> {
  dbLogger.info("Planning tasks from goal via SDK", {
    goal: goal.goal,
  });

  const prompt = buildPlanningPrompt(orientation, goal);

  try {
    // Use SDK query - need enough turns for Claude to respond
    // Note: SDK may use internal turns even for "pure reasoning" tasks
    const result = query({
      prompt,
      options: {
        maxTurns: 10, // SDK needs room for internal processing
        allowedTools: [], // No external tools - just reasoning
      },
    });

    let responseText = "";
    let sessionId = "";
    let durationMs = 0;
    let messageCount = 0;

    // Stream through messages to get the result
    for await (const message of result) {
      messageCount++;
      const msg = message as Record<string, unknown>;

      dbLogger.info("SDK planning message", {
        count: messageCount,
        type: msg.type,
        subtype: msg.subtype,
        hasResult: !!msg.result,
        isError: msg.is_error,
      });

      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id as string;
      }

      if (msg.type === "result") {
        responseText = msg.result as string || "";
        durationMs = (msg.duration_ms as number) || 0;

        // Check for error result
        if (msg.is_error) {
          throw new Error(`SDK planning error: ${responseText}`);
        }
      }
    }

    if (!responseText) {
      throw new Error(`No response received from SDK (${messageCount} messages processed)`);
    }

    dbLogger.debug("SDK planning response received", {
      sessionId,
      durationMs,
      responseLength: responseText.length,
    });

    // Parse the response into tasks
    const tasks = parsePlanningResponse(responseText);

    dbLogger.info("SDK planning complete", {
      taskCount: tasks.length,
      tasks: tasks.map((t) => t.title),
      durationMs,
    });

    return tasks;
  } catch (error) {
    dbLogger.error("SDK planning failed", { error: String(error) });
    throw error;
  }
}

// =============================================================================
// Export aliases for compatibility
// =============================================================================

export { planTasksFromGoal as planTasksSDK };
export { planTasksFromGoal as planTasksFromGoalSDK };
