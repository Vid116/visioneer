/**
 * Claude API Task Executor
 *
 * Real implementation of TaskExecutor that:
 * 1. Gathers relevant context (orientation, related knowledge)
 * 2. Calls Claude API with focused execution prompt and tools
 * 3. Handles tool use in a loop until final response
 * 4. Parses response into structured TaskResult
 */

import Anthropic from "@anthropic-ai/sdk";
import { Task, Orientation, Chunk } from "../utils/types.js";
import { TaskResult, TaskResultStatus, Learning } from "./execution.js";
import { executeQuery } from "../retrieval/planner.js";
import { getAgentConfig, getToolsConfig } from "../utils/config.js";
import { dbLogger } from "../utils/logger.js";
import { logActivity } from "../db/queries.js";
import { getEnabledTools } from "./tools/index.js";
import { executeTool } from "./tools/executor.js";

// =============================================================================
// Types
// =============================================================================

interface ExecutorConfig {
  model: string;
  maxTokens: number;
  maxContextChunks: number;
  maxToolIterations: number;
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

function buildFailureContextSection(task: Task): string {
  if (!task.failure_reason || !task.failure_context) {
    return "";
  }

  const ctx = task.failure_context;
  let toolCallSummary = "";
  if (ctx.toolCalls && ctx.toolCalls.length > 0) {
    toolCallSummary = ctx.toolCalls
      .map((tc) => `${tc.name} (${tc.count}x)`)
      .join(", ");
  }

  return `
## Previous Attempt

This task was attempted before and failed.

**Failure reason:** ${task.failure_reason}
${toolCallSummary ? `**Tool calls made:** ${toolCallSummary}` : ""}
${ctx.partialResults ? `**What was gathered:** ${ctx.partialResults}` : ""}
${ctx.iterations ? `**Iterations used:** ${ctx.iterations}` : ""}

**Your mission this time:**
- Learn from the previous attempt
- Be more focused — aim to complete in under 8 tool calls
- If you need user input to proceed, say so (use "blocked" status)
- If enough info was gathered last time, just synthesize and complete

`;
}

function buildExecutionPrompt(
  task: Task,
  orientation: Orientation,
  contextChunks: Chunk[],
  hasTools: boolean
): string {
  const failureSection = buildFailureContextSection(task);
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

  const toolsSection = hasTools
    ? `
## Available Tools

You have access to the following tools to help execute this task:

- **web_search**: Search the web for information. Use this to research topics, find current information, or discover resources.
- **web_fetch**: Fetch and extract content from a URL. Use this to read articles, documentation, or web pages.
- **write_artifact**: Save content to a file (notes, code, summaries). Use this to persist important findings.
- **read_artifact**: Read a previously saved artifact file.

Use these tools as needed to research, gather information, and create artifacts. After using tools, synthesize your findings into learnings.

## Important Guidelines

- Use tools strategically — typically 2-4 searches and 2-3 fetches are sufficient
- After gathering enough information, STOP using tools and provide your final JSON response
- Don't try to be exhaustive — focus on the most relevant, high-quality sources
- If you've done 5+ tool calls, it's time to synthesize and respond
`
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
${toolsSection}
${failureSection}## Task to Execute

**Title:** ${task.title}

**Description:** ${task.description}

**Skill Area:** ${task.skill_area}

## Your Mission

Execute this task to the best of your ability. ${hasTools ? "Use the available tools to research and gather information as needed. " : ""}Think through what needs to be done, do the research or reasoning required, and produce concrete learnings.

When you have completed your work, respond with a JSON object in the following format:

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

${hasTools ? "Start by using tools to gather information, then provide your final JSON response." : "Now execute the task and respond with the JSON object only."}`;
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
// Tool Use Loop
// =============================================================================

type MessageParam = Anthropic.MessageParam;
type ContentBlock = Anthropic.ContentBlock;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;

/**
 * Formats a brief description of a tool call for activity logging.
 */
function formatToolDescription(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "web_search":
      return `"${String(input.query || "").slice(0, 40)}"`;
    case "web_fetch":
      const url = String(input.url || "");
      // Extract domain for brevity
      try {
        const domain = new URL(url).hostname;
        return domain;
      } catch {
        return url.slice(0, 40);
      }
    case "write_artifact":
      return String(input.filename || "file");
    case "read_artifact":
      return String(input.filename || "file");
    default:
      return "";
  }
}

interface ToolLoopResult {
  text: string;
  iterations: number;
  toolCalls: Array<{ name: string; count: number }>;
}

class ToolLoopExceededError extends Error {
  iterations: number;
  toolCalls: Array<{ name: string; count: number }>;

  constructor(maxIterations: number, iterations: number, toolCalls: Map<string, number>) {
    super(`Tool loop exceeded maximum iterations (${maxIterations})`);
    this.name = "ToolLoopExceededError";
    this.iterations = iterations;
    this.toolCalls = Array.from(toolCalls.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  }
}

async function executeWithTools(
  client: Anthropic,
  model: string,
  maxTokens: number,
  tools: Anthropic.Tool[],
  messages: MessageParam[],
  projectId: string,
  maxIterations: number
): Promise<ToolLoopResult> {
  let currentMessages = [...messages];
  let iterations = 0;
  const toolCallCounts = new Map<string, number>();

  while (iterations < maxIterations) {
    iterations++;

    dbLogger.debug("Tool loop iteration", { iteration: iterations, maxIterations });

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      tools: tools.length > 0 ? tools : undefined,
      messages: currentMessages,
    });

    // Check if we have tool use blocks
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      // No tool calls or end turn - extract final text
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );

      if (textBlocks.length > 0) {
        return {
          text: textBlocks.map((b) => b.text).join("\n"),
          iterations,
          toolCalls: Array.from(toolCallCounts.entries()).map(([name, count]) => ({
            name,
            count,
          })),
        };
      }

      // If no text but had tool use, continue loop
      if (toolUseBlocks.length > 0) {
        dbLogger.warn("Tool use without text response, continuing loop");
      } else {
        throw new Error("No text content in Claude response");
      }
    }

    // Execute all tool calls
    const toolResults: ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const toolInput = toolUse.input as Record<string, unknown>;
      const toolDesc = formatToolDescription(toolUse.name, toolInput);

      // Track tool call counts
      toolCallCounts.set(
        toolUse.name,
        (toolCallCounts.get(toolUse.name) || 0) + 1
      );

      dbLogger.info("Executing tool", {
        tool: toolUse.name,
        toolUseId: toolUse.id,
      });

      // Log tool call to activity log for dashboard visibility
      const activityAction = toolDesc
        ? `Tool: ${toolUse.name} \u2192 ${toolDesc}`
        : `Tool: ${toolUse.name}`;
      logActivity(projectId, activityAction, {
        tool: toolUse.name,
        input: toolInput,
      });

      try {
        const result = await executeTool(
          toolUse.name,
          toolInput,
          projectId
        );

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });

        dbLogger.debug("Tool executed successfully", {
          tool: toolUse.name,
          resultSize: JSON.stringify(result).length,
        });
      } catch (error) {
        dbLogger.error("Tool execution failed", {
          tool: toolUse.name,
          error: String(error),
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: String(error) }),
          is_error: true,
        });
      }
    }

    // Add assistant response and tool results to conversation
    currentMessages = [
      ...currentMessages,
      {
        role: "assistant" as const,
        content: response.content as ContentBlock[],
      },
      {
        role: "user" as const,
        content: toolResults,
      },
    ];

    // If we've done many tool calls, nudge Claude to wrap up
    if (iterations >= 7) {
      currentMessages.push({
        role: "user" as const,
        content: "You've gathered substantial information. Please synthesize your findings and provide your final JSON response now. No more tool calls needed.",
      });
    }
  }

  throw new ToolLoopExceededError(maxIterations, iterations, toolCallCounts);
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
  const toolsConfig = getToolsConfig();

  const cfg: ExecutorConfig = {
    model: agentConfig.model,
    maxTokens: 4096,
    maxContextChunks: 5,
    maxToolIterations: 20,
    ...config,
  };

  // Get enabled tools based on config
  const tools = getEnabledTools(toolsConfig);
  const hasTools = tools.length > 0;

  dbLogger.info("Executor initialized", {
    model: cfg.model,
    enabledTools: tools.map((t) => t.name),
  });

  return async function claudeExecutor(
    task: Task,
    orientation: Orientation
  ): Promise<TaskResult> {
    dbLogger.info("Executing task via Claude API", {
      taskId: task.id,
      title: task.title,
      model: cfg.model,
      toolsEnabled: hasTools,
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
      const prompt = buildExecutionPrompt(task, orientation, contextChunks, hasTools);

      // 3. Call Claude API with tool loop
      const client = getAnthropicClient();
      const projectId = orientation.project_id;

      const loopResult = await executeWithTools(
        client,
        cfg.model,
        cfg.maxTokens,
        tools,
        [{ role: "user", content: prompt }],
        projectId,
        cfg.maxToolIterations
      );

      dbLogger.debug("Received final Claude response", {
        taskId: task.id,
        contentLength: loopResult.text.length,
        iterations: loopResult.iterations,
        toolCalls: loopResult.toolCalls,
      });

      // 4. Parse response
      const parsed = parseClaudeResponse(loopResult.text);

      // 5. Convert to TaskResult
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

      // Special handling for ToolLoopExceededError - include failure context
      if (error instanceof ToolLoopExceededError) {
        return {
          status: "failed",
          error: error.message,
          failureContext: {
            toolCalls: error.toolCalls,
            iterations: error.iterations,
          },
        };
      }

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
