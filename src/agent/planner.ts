/**
 * Goal-to-Tasks Planner
 *
 * When a new goal is set and there are no tasks, this module calls Claude
 * to break down the goal into concrete, actionable tasks.
 */

import Anthropic from "@anthropic-ai/sdk";
import { Orientation, Goal } from "../utils/types.js";
import { getAgentConfig } from "../utils/config.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types
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
// Claude Client
// =============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

// =============================================================================
// Planning Prompt
// =============================================================================

function buildPlanningPrompt(orientation: Orientation, goal: Goal): string {
  return `You are a planning assistant for the Visioneer autonomous learning system.

## Project Context

**Vision:** ${orientation.vision_summary}

**Current Phase:** ${orientation.current_phase}

**Active Priorities:**
${orientation.active_priorities.map((p) => `- ${p}`).join("\n")}

**Success Criteria:**
${orientation.success_criteria.map((c) => `- ${c}`).join("\n")}

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

Respond with a JSON object containing an array of tasks:

\`\`\`json
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
\`\`\`

### Guidelines

- Start with research/learning tasks before practice/application tasks
- Use depends_on to create a logical sequence (task titles, not IDs)
- First 1-2 tasks usually have no dependencies
- skill_area helps categorize: "research", "fundamentals", "technique", "practice", "project", "review"
- Keep descriptions focused but informative (2-3 sentences)

Create the task breakdown now.`;
}

// =============================================================================
// Response Parsing
// =============================================================================

function parsePlanningResponse(content: string): PlannedTask[] {
  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = content;

  // Try to extract from code block
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
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
// Main Planning Function
// =============================================================================

/**
 * Calls Claude to break down a goal into tasks.
 *
 * @param orientation Current project orientation
 * @param goal The goal to plan for
 * @returns Array of planned tasks
 */
export async function planTasksFromGoal(
  orientation: Orientation,
  goal: Goal
): Promise<PlannedTask[]> {
  const config = getAgentConfig();

  dbLogger.info("Planning tasks from goal", {
    goal: goal.goal,
    model: config.model,
  });

  const client = getAnthropicClient();
  const prompt = buildPlanningPrompt(orientation, goal);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text content
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );

    if (textBlocks.length === 0) {
      throw new Error("No text content in Claude response");
    }

    const content = textBlocks.map((b) => b.text).join("\n");
    const tasks = parsePlanningResponse(content);

    dbLogger.info("Planning complete", {
      taskCount: tasks.length,
      tasks: tasks.map((t) => t.title),
    });

    return tasks;
  } catch (error) {
    dbLogger.error("Planning failed", { error: String(error) });
    throw error;
  }
}
