/**
 * Claude API Task Executor
 *
 * Real implementation of TaskExecutor that:
 * 1. Gathers relevant context (orientation, related knowledge)
 * 2. Calls Claude API with focused execution prompt
 * 3. Parses response into structured TaskResult
 */

import Anthropic from "@anthropic-ai/sdk";
import { Task, Orientation, Chunk } from "../utils/types.js";
import { TaskResult, TaskResultStatus, Learning } from "./execution.js";
import { executeQuery } from "../retrieval/planner.js";
import { getAgentConfig } from "../utils/config.js";
import { dbLogger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

interface ExecutorConfig {
  model: string;
  maxTokens: number;
  maxContextChunks: number;
}

interface ClaudeExecutionResponse {
  status: "complete" | "blocked" | "needs_research" | "partial";
  outcome: string;
  learnings: {
    content: string;
    type: "research" | "insight" | "decision" | "attempt";
    tags: string[];
    confidence: "verified" | "inferred" | "speculative";
  }[];
  question?: string;
  questionContext?: string;
  researchTopic?: string;
  researchDescription?: string;
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
// Context Gathering
// =============================================================================

async function gatherTaskContext(
  task: Task,
  orientation: Orientation,
  maxChunks: number
): Promise<Chunk[]> {
  const projectId = orientation.project_id;

  // Search for relevant knowledge using task title + description + skill area
  const searchQuery = `${task.title} ${task.description} ${task.skill_area}`;

  try {
    const result = await executeQuery(projectId, searchQuery, {
      limit: maxChunks,
      minSimilarity: 0.5,
    });

    return result.chunks.map((sc) => sc.chunk);
  } catch (error) {
    dbLogger.warn("Failed to gather context for task", {
      taskId: task.id,
      error: String(error),
    });
    return [];
  }
}

// =============================================================================
// Prompt Construction
// =============================================================================

function buildExecutionPrompt(
  task: Task,
  orientation: Orientation,
  contextChunks: Chunk[]
): string {
  const contextSection =
    contextChunks.length > 0
      ? `
## Relevant Knowledge

${contextChunks
  .map(
    (chunk, i) => `### Context ${i + 1} (${chunk.type}, confidence: ${chunk.confidence})
${chunk.content}
Tags: ${chunk.tags.join(", ")}
`
  )
  .join("\n")}`
      : "";

  return `You are executing a task for the Visioneer autonomous learning system.

## Project Context

**Vision:** ${orientation.vision_summary}

**Current Phase:** ${orientation.current_phase}

**Active Priorities:** ${orientation.active_priorities.join(", ")}

**Success Criteria:**
${orientation.success_criteria.map((c) => `- ${c}`).join("\n")}

**Constraints:**
${orientation.constraints.map((c) => `- ${c}`).join("\n")}
${contextSection}

## Task to Execute

**Title:** ${task.title}

**Description:** ${task.description}

**Skill Area:** ${task.skill_area}

## Your Mission

Execute this task to the best of your ability. Think through what needs to be done, do the research or reasoning required, and produce concrete learnings.

You must respond with a JSON object in the following format:

\`\`\`json
{
  "status": "complete" | "blocked" | "needs_research" | "partial",
  "outcome": "Brief summary of what was accomplished or attempted",
  "learnings": [
    {
      "content": "The actual knowledge, insight, or finding",
      "type": "research" | "insight" | "decision" | "attempt",
      "tags": ["relevant", "tags"],
      "confidence": "verified" | "inferred" | "speculative"
    }
  ],
  "question": "If blocked, what question needs human input?",
  "questionContext": "Additional context for the question",
  "researchTopic": "If needs_research, what topic?",
  "researchDescription": "Description of research needed"
}
\`\`\`

### Status Guidelines

- **complete**: Task fully accomplished, learnings captured
- **blocked**: Cannot proceed without human input (provide question)
- **needs_research**: More information needed (provide research topic)
- **partial**: Made progress but not finished (will continue later)

### Learning Types

- **research**: Facts, information, or knowledge discovered
- **insight**: Conclusions, patterns, or understanding derived
- **decision**: Choices made and their rationale
- **attempt**: What was tried (success or failure)

### Confidence Levels

- **verified**: Confirmed from authoritative sources or direct experience
- **inferred**: Reasoned from available information
- **speculative**: Hypothesis or educated guess

Now execute the task and respond with the JSON object only.`;
}

// =============================================================================
// Response Parsing
// =============================================================================

function parseClaudeResponse(content: string): ClaudeExecutionResponse {
  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = content;

  // Try to extract from code block
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  // Clean up any leading/trailing whitespace
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.status || !parsed.outcome) {
      throw new Error("Missing required fields: status, outcome");
    }

    // Validate status
    const validStatuses = ["complete", "blocked", "needs_research", "partial"];
    if (!validStatuses.includes(parsed.status)) {
      throw new Error(`Invalid status: ${parsed.status}`);
    }

    // Ensure learnings is an array
    if (!parsed.learnings) {
      parsed.learnings = [];
    }

    // Validate learnings structure
    for (const learning of parsed.learnings) {
      if (!learning.content || !learning.type || !learning.confidence) {
        throw new Error("Invalid learning structure");
      }
      if (!learning.tags) {
        learning.tags = [];
      }
    }

    return parsed as ClaudeExecutionResponse;
  } catch (error) {
    dbLogger.error("Failed to parse Claude response", {
      error: String(error),
      content: content.slice(0, 500),
    });

    // Return a failed result that can be handled
    return {
      status: "partial",
      outcome: "Failed to parse execution response",
      learnings: [
        {
          content: `Raw response: ${content.slice(0, 1000)}`,
          type: "attempt",
          tags: ["parse_error"],
          confidence: "speculative",
        },
      ],
    };
  }
}

// =============================================================================
// Main Executor
// =============================================================================

/**
 * Creates a Claude API task executor.
 *
 * @param config Optional configuration overrides
 * @returns TaskExecutor function
 */
export function createClaudeExecutor(config?: Partial<ExecutorConfig>) {
  const agentConfig = getAgentConfig();

  const cfg: ExecutorConfig = {
    model: agentConfig.model,
    maxTokens: 4096,
    maxContextChunks: 5,
    ...config,
  };

  return async function claudeExecutor(
    task: Task,
    orientation: Orientation
  ): Promise<TaskResult> {
    dbLogger.info("Executing task via Claude API", {
      taskId: task.id,
      title: task.title,
      model: cfg.model,
    });

    try {
      // 1. Gather relevant context
      const contextChunks = await gatherTaskContext(
        task,
        orientation,
        cfg.maxContextChunks
      );

      dbLogger.debug("Gathered context", {
        taskId: task.id,
        chunkCount: contextChunks.length,
      });

      // 2. Build prompt
      const prompt = buildExecutionPrompt(task, orientation, contextChunks);

      // 3. Call Claude API
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // 4. Extract text content
      const textContent = response.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        throw new Error("No text content in Claude response");
      }

      dbLogger.debug("Received Claude response", {
        taskId: task.id,
        contentLength: textContent.text.length,
        stopReason: response.stop_reason,
      });

      // 5. Parse response
      const parsed = parseClaudeResponse(textContent.text);

      // 6. Convert to TaskResult
      const result: TaskResult = {
        status: parsed.status as TaskResultStatus,
        outcome: parsed.outcome,
        learnings: parsed.learnings as Learning[],
      };

      if (parsed.question) {
        result.question = parsed.question;
        result.questionContext = parsed.questionContext;
      }

      if (parsed.researchTopic) {
        result.researchTopic = parsed.researchTopic;
        result.researchDescription = parsed.researchDescription;
      }

      dbLogger.info("Task execution complete", {
        taskId: task.id,
        status: result.status,
        learningsCount: result.learnings?.length || 0,
      });

      return result;
    } catch (error) {
      dbLogger.error("Task execution failed", {
        taskId: task.id,
        error: String(error),
      });

      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Default Claude executor using config settings.
 */
export const claudeExecutor = createClaudeExecutor();
