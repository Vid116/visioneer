/**
 * Task Executor
 *
 * Uses Claude Agent SDK for task execution.
 *
 * Architecture:
 * - Visioneer = Memory Brain (provides context, stores learnings)
 * - Claude Code SDK = Execution Hands (does the actual work with tools)
 *
 * Features:
 * - No manual tool loop - SDK handles it
 * - Full toolset available - WebSearch, WebFetch, Read, Write, Bash, Glob, Grep
 * - Built-in limits via maxTurns
 * - Uses subscription (no API costs)
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { Task, Orientation, Chunk, Question } from "../utils/types.js";
import { TaskResult, TaskResultStatus, Learning } from "./execution.js";
import { executeQuery } from "../retrieval/planner.js";
import { getToolsConfig } from "../utils/config.js";
import { dbLogger } from "../utils/logger.js";
import { logActivity, getAnswersForTask, getRecentAnswers } from "../db/queries.js";
import { resolve } from "path";
import { createConversationContext } from "../logging/message-logger.js";
import { ArtifactManager, findSimilarArtifacts } from "../artifacts/index.js";

// =============================================================================
// Types
// =============================================================================

export interface ExecutorConfig {
  maxTurns: number;
  maxContextChunks: number;
  artifactsDirectory: string;
}

interface ParsedExecution {
  status: TaskResultStatus;
  outcome: string;
  learnings: Learning[];
  question?: string;
  questionContext?: string;
  researchTopic?: string;
  researchDescription?: string;
}

interface SDKMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  result?: string;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  message?: {
    role: string;
    content: Array<{
      type: string;
      name?: string;
      text?: string;
    }>;
  };
}

// =============================================================================
// Context Gathering (reused from original)
// =============================================================================

async function gatherTaskContext(
  task: Task,
  orientation: Orientation,
  maxChunks: number
): Promise<Chunk[]> {
  const projectId = orientation.project_id;
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
- Be more focused - complete efficiently
- If you need user input to proceed, say so (use "blocked" status)
- If enough info was gathered last time, just synthesize and complete

`;
}

/**
 * Build a section listing potentially relevant existing artifacts
 */
function buildExistingArtifactsSection(task: Task, artifactsDir: string): string {
  try {
    const manager = new ArtifactManager(artifactsDir);
    const allArtifacts = manager.scanArtifacts();

    // Filter to active artifacts only
    const activeArtifacts = allArtifacts.filter(a => a.status === 'active');

    if (activeArtifacts.length === 0) {
      return '';
    }

    // Find artifacts that might be relevant to this task based on keywords
    const taskKeywords = `${task.title} ${task.description} ${task.skill_area}`
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4);

    const relevantArtifacts = activeArtifacts.filter(artifact => {
      const artifactText = `${artifact.filename} ${artifact.topic || ''}`.toLowerCase();
      return taskKeywords.some(keyword => artifactText.includes(keyword));
    }).slice(0, 10); // Limit to 10 most relevant

    if (relevantArtifacts.length === 0) {
      return '';
    }

    const artifactList = relevantArtifacts
      .map(a => `- \`${a.filename}\` (${a.type}${a.topic ? `, topic: ${a.topic}` : ''})`)
      .join('\n');

    return `
## Existing Artifacts (check before creating new files)

The following existing artifacts may be relevant to this task:

${artifactList}

**Before creating a new document, check if any of these should be UPDATED instead.**
`;
  } catch (err) {
    // If artifact scanning fails, just skip this section
    dbLogger.debug("Failed to scan artifacts for prompt", { error: String(err) });
    return '';
  }
}

function buildUserFeedbackSection(taskAnswers: Question[], recentAnswers: Question[]): string {
  const sections: string[] = [];

  // Direct answers that unblocked THIS task - highest priority
  if (taskAnswers.length > 0) {
    sections.push(`### Direct Feedback for This Task

The following user feedback was provided specifically for this task:

${taskAnswers.map(q => `**Question:** ${q.question}
**User's Answer:** ${q.answer}
${q.context ? `**Context:** ${q.context}` : ""}
`).join("\n")}`);
  }

  // Recent project-wide answers for general context
  // Filter out any that were already included as task-specific
  const taskAnswerIds = new Set(taskAnswers.map(q => q.id));
  const otherRecent = recentAnswers.filter(q => !taskAnswerIds.has(q.id));

  if (otherRecent.length > 0) {
    sections.push(`### Recent Project Decisions

Other recent user feedback that may be relevant:

${otherRecent.map(q => `- **Q:** ${q.question} → **A:** ${q.answer}`).join("\n")}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `
## User Feedback

**IMPORTANT:** The user has provided the following guidance. You MUST respect and follow this feedback.

${sections.join("\n\n")}
`;
}

function buildExecutionPrompt(
  task: Task,
  orientation: Orientation,
  contextChunks: Chunk[],
  artifactsDir: string,
  taskAnswers: Question[],
  recentAnswers: Question[]
): string {
  const failureSection = buildFailureContextSection(task);
  const userFeedbackSection = buildUserFeedbackSection(taskAnswers, recentAnswers);
  const existingArtifactsSection = buildExistingArtifactsSection(task, artifactsDir);

  const contextSection =
    contextChunks.length > 0
      ? `
## Relevant Knowledge (from previous research)

${contextChunks
  .map(
    (chunk, i) => `### Context ${i + 1} (${chunk.type}, confidence: ${chunk.confidence})
${chunk.content}
Tags: ${chunk.tags.join(", ")}
`
  )
  .join("\n")}`
      : "";

  // Convert artifacts dir to absolute path for SDK
  const absoluteArtifactsDir = resolve(artifactsDir);

  return `You are executing a task for the Visioneer autonomous learning system.

## Project Context

**Vision:** ${orientation.vision_summary}

**Current Phase:** ${orientation.current_phase}

**Active Priorities:** ${orientation.active_priorities.join(", ")}

**Success Criteria:**
${orientation.success_criteria.map((c) => `- ${c}`).join("\n")}

**Constraints:**
${orientation.constraints.map((c) => `- ${c}`).join("\n")}
${userFeedbackSection}${existingArtifactsSection}${contextSection}
## Available Tools

You have access to these tools:

- **WebSearch**: Search the web for information
- **WebFetch**: Fetch and read content from URLs
- **Read**: Read files (including artifacts from previous tasks)
- **Write**: Save files to the artifacts directory: ${absoluteArtifactsDir}
- **Bash**: Run shell commands if needed
- **Glob**: Find files by pattern
- **Grep**: Search file contents

Use these tools as needed to research, gather information, and create artifacts.

## CRITICAL: Artifact Management

**Before creating any new document:**
1. Use Glob to check for existing similar artifacts: \`Glob("artifacts/**/*keyword*")\`
2. If a similar file exists, READ it first to understand what's already documented
3. **UPDATE the existing file** instead of creating a new one when possible
4. Only create a new file if the topic is genuinely different or a major version change is needed

**When updating an existing artifact:**
- Add new information to the appropriate section
- Update any outdated information
- Add an "Updated: YYYY-MM-DD" note if significant changes are made

**When creating a new artifact that supersedes an old one:**
- Name it clearly (e.g., "topic-guide-v2.md" or "topic-guide-updated.md")
- Reference the old file it replaces
- The old file will be automatically marked as superseded

**Artifact naming conventions:**
- Use kebab-case: \`hardware-ordering-guide.md\`
- Include topic prefix: \`e-ink-prototype-bom.md\`
- Use subdirectories for related content: \`memory-research/implementation-plan.md\`
${failureSection}## Task to Execute

**Title:** ${task.title}

**Description:** ${task.description}

**Skill Area:** ${task.skill_area}

## Your Mission

Execute this task thoroughly. Use the available tools to:
1. Research the topic (WebSearch, WebFetch)
2. Gather specific information from sources
3. Save important findings as artifacts if appropriate

## IMPORTANT: Response Format

When you have completed your work, you MUST end with a structured response in this EXACT format:

\`\`\`json
{
  "status": "complete",
  "outcome": "Brief summary of what was accomplished",
  "learnings": [
    {
      "content": "The actual knowledge, insight, or finding",
      "type": "research",
      "tags": ["relevant", "tags"],
      "confidence": "verified"
    }
  ]
}
\`\`\`

### Status Options
- **complete**: Task fully accomplished
- **blocked**: Cannot proceed without human input (include "question" field)
- **needs_research**: More research needed (include "researchTopic" field)
- **partial**: Made progress but not finished

### Learning Types
- **research**: Facts, information discovered
- **insight**: Conclusions, patterns derived
- **decision**: Choices made and rationale
- **attempt**: What was tried (success or failure)

### Confidence Levels
- **verified**: Confirmed from authoritative sources
- **inferred**: Reasoned from available information
- **speculative**: Hypothesis or educated guess

### If Blocked (need human input)
\`\`\`json
{
  "status": "blocked",
  "outcome": "What was attempted",
  "question": "What specific question needs answering?",
  "questionContext": "Additional context for the question",
  "learnings": []
}
\`\`\`

### If Needs More Research
\`\`\`json
{
  "status": "needs_research",
  "outcome": "What was found so far",
  "researchTopic": "What topic needs more research",
  "researchDescription": "Description of research needed",
  "learnings": []
}
\`\`\`

Now execute the task. Use tools as needed, then provide your final JSON response.`;
}

// =============================================================================
// Response Parsing
// =============================================================================

function parseExecutionResponse(content: string): ParsedExecution {
  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = content;

  // Try to extract from code block
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    // Find the last JSON block (the final response)
    const allMatches = content.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g);
    let lastMatch = "";
    for (const match of allMatches) {
      if (match[1].includes('"status"') && match[1].includes('"outcome"')) {
        lastMatch = match[1];
      }
    }
    if (lastMatch) {
      jsonStr = lastMatch;
    } else {
      jsonStr = codeBlockMatch[1];
    }
  }

  // Also try to find raw JSON object with status field
  if (!jsonStr.includes('"status"')) {
    const jsonObjectMatch = content.match(/\{[\s\S]*"status"[\s\S]*"outcome"[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonStr = jsonObjectMatch[0];
    }
  }

  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.status || !parsed.outcome) {
      throw new Error("Missing required fields: status, outcome");
    }

    // Validate status
    const validStatuses: TaskResultStatus[] = [
      "complete",
      "blocked",
      "needs_research",
      "partial",
    ];
    if (!validStatuses.includes(parsed.status)) {
      dbLogger.warn("Invalid status, defaulting to partial", {
        received: parsed.status,
      });
      parsed.status = "partial";
    }

    // Ensure learnings is an array
    if (!parsed.learnings) {
      parsed.learnings = [];
    }

    // Validate and clean learnings
    const validLearnings: Learning[] = [];
    for (const learning of parsed.learnings) {
      if (!learning.content) continue;

      validLearnings.push({
        content: learning.content,
        type: learning.type || "research",
        tags: Array.isArray(learning.tags) ? learning.tags : [],
        confidence: learning.confidence || "inferred",
      });
    }

    return {
      status: parsed.status as TaskResultStatus,
      outcome: parsed.outcome,
      learnings: validLearnings,
      question: parsed.question,
      questionContext: parsed.questionContext,
      researchTopic: parsed.researchTopic,
      researchDescription: parsed.researchDescription,
    };
  } catch (error) {
    dbLogger.error("Failed to parse SDK execution response", {
      error: String(error),
      content: content.slice(0, 500),
    });

    // Try to extract meaningful content from unstructured response
    return extractFromUnstructuredResponse(content);
  }
}

function extractFromUnstructuredResponse(content: string): ParsedExecution {
  // Fallback: try to extract useful information from unstructured text
  const lines = content.split("\n");
  const learnings: Learning[] = [];

  // Look for bullet points or numbered items that might be learnings
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      (trimmed.startsWith("-") || trimmed.startsWith("*") || /^\d+\./.test(trimmed)) &&
      trimmed.length > 20
    ) {
      const content = trimmed.replace(/^[-*\d.]+\s*/, "").trim();
      if (content.length > 10) {
        learnings.push({
          content,
          type: "research",
          tags: [],
          confidence: "inferred",
        });
      }
    }
  }

  return {
    status: "partial",
    outcome: "Task execution completed but response format was unclear. See learnings for extracted information.",
    learnings: learnings.slice(0, 10), // Limit to 10 learnings
  };
}

// =============================================================================
// Tool Usage Tracking
// =============================================================================

function extractToolUsesFromMessage(message: SDKMessage): string[] {
  const tools: string[] = [];

  if (message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === "tool_use" && block.name) {
        tools.push(block.name);
      }
    }
  }

  return tools;
}

// =============================================================================
// Main SDK Executor
// =============================================================================

const DEFAULT_CONFIG: ExecutorConfig = {
  maxTurns: 25, // Increased from 15 - complex research tasks need more turns
  maxContextChunks: 5,
  artifactsDirectory: "./artifacts",
};

/**
 * Creates a task executor.
 *
 * @param config Optional configuration overrides
 * @returns TaskExecutor function compatible with execution.ts
 */
export function createExecutor(config?: Partial<ExecutorConfig>) {
  const toolsConfig = getToolsConfig();

  const cfg: ExecutorConfig = {
    ...DEFAULT_CONFIG,
    artifactsDirectory: toolsConfig.artifacts.directory,
    ...config,
  };

  dbLogger.info("SDK Executor initialized", {
    maxTurns: cfg.maxTurns,
    artifactsDirectory: cfg.artifactsDirectory,
  });

  return async function sdkExecutor(
    task: Task,
    orientation: Orientation
  ): Promise<TaskResult> {
    dbLogger.info("Executing task via SDK", {
      taskId: task.id,
      title: task.title,
      maxTurns: cfg.maxTurns,
    });

    const projectId = orientation.project_id;
    const startTime = Date.now();

    // Create conversation context for message logging
    const msgCtx = createConversationContext(task.id);

    try {
      // 1. Gather relevant context
      const contextChunks = await gatherTaskContext(
        task,
        orientation,
        cfg.maxContextChunks
      );

      // 2. Get user answers that are relevant to this task
      const taskAnswers = getAnswersForTask(task.id);
      const recentAnswers = getRecentAnswers(projectId, 5);

      dbLogger.debug("Gathered context for SDK execution", {
        taskId: task.id,
        chunkCount: contextChunks.length,
        taskAnswerCount: taskAnswers.length,
        recentAnswerCount: recentAnswers.length,
      });

      // 3. Build prompt with user feedback included
      const prompt = buildExecutionPrompt(
        task,
        orientation,
        contextChunks,
        cfg.artifactsDirectory,
        taskAnswers,
        recentAnswers
      );

      // Log the system/user prompt
      msgCtx.logSystem(prompt);

      // 3. Execute via SDK
      const toolsUsed: string[] = [];
      let turnsUsed = 0;
      let responseText = "";
      let sessionId = "";

      const sdkResult = query({
        prompt,
        options: {
          maxTurns: cfg.maxTurns,
          allowedTools: [
            "WebSearch",
            "WebFetch",
            "Read",
            "Write",
            "Bash",
            "Glob",
            "Grep",
          ],
        },
      });

      // Stream through messages
      // Track logged content to avoid duplicates (SDK may send cumulative history)
      const loggedTextHashes = new Set<string>();
      const loggedToolCalls = new Set<string>();
      const loggedToolResults = new Set<string>();

      let messageCount = 0;
      for await (const message of sdkResult) {
        messageCount++;
        const msg = message as SDKMessage;

        // Log all message types for debugging
        dbLogger.info("SDK message", {
          count: messageCount,
          type: msg.type,
          subtype: msg.subtype,
          hasResult: !!msg.result,
          isError: msg.is_error,
        });

        // Track session start
        if (msg.type === "system" && msg.subtype === "init") {
          sessionId = msg.session_id || "";
          dbLogger.debug("SDK session started", { sessionId });
        }

        // Track tool usage from assistant messages
        if (msg.type === "assistant" && msg.message) {
          const tools = extractToolUsesFromMessage(msg);
          if (tools.length > 0) {
            toolsUsed.push(...tools);
            // Log tool calls for dashboard visibility
            for (const tool of tools) {
              logActivity(projectId, `SDK Tool: ${tool}`, {
                taskId: task.id,
                tool,
              });
            }
          }

          // Log assistant message content and tool calls (with deduplication)
          for (const block of msg.message.content) {
            if (block.type === "text" && block.text) {
              // Use first 200 chars as hash key to dedupe
              const textHash = block.text.slice(0, 200);
              if (!loggedTextHashes.has(textHash)) {
                loggedTextHashes.add(textHash);
                msgCtx.logAssistant(block.text);
              }
            } else if (block.type === "tool_use" && block.name) {
              // Extract tool input from the block if available
              const toolBlock = block as { name: string; input?: unknown; id?: string };
              const toolCallKey = toolBlock.id || `${block.name}-${JSON.stringify(toolBlock.input || {}).slice(0, 100)}`;
              if (!loggedToolCalls.has(toolCallKey)) {
                loggedToolCalls.add(toolCallKey);
                msgCtx.logToolCall(block.name, toolBlock.input || {});
              }
            }
          }
        }

        // Log tool results (with deduplication)
        if (msg.type === "user" && msg.message) {
          for (const block of msg.message.content) {
            const toolResultBlock = block as { type: string; tool_use_id?: string; content?: string };
            if (toolResultBlock.type === "tool_result" && toolResultBlock.content) {
              // Use tool_use_id or content hash for deduplication
              const resultKey = toolResultBlock.tool_use_id || toolResultBlock.content.slice(0, 200);
              if (!loggedToolResults.has(resultKey)) {
                loggedToolResults.add(resultKey);
                msgCtx.logToolResult("tool", toolResultBlock.content);
              }
            }
          }
        }

        // Collect final result
        if (msg.type === "result") {
          responseText = msg.result || "";
          turnsUsed = msg.num_turns || 0;

          dbLogger.info("SDK execution completed", {
            taskId: task.id,
            subtype: msg.subtype,
            turnsUsed,
            toolsUsed: [...new Set(toolsUsed)],
            responseLength: responseText.length,
            isError: msg.is_error,
          });

          // Handle max turns error - return partial completion
          if (msg.subtype === "error_max_turns") {
            dbLogger.warn("SDK task hit max turns limit", {
              taskId: task.id,
              turnsUsed,
              maxTurns: cfg.maxTurns,
            });
            return {
              status: "partial",
              outcome: `Task did not complete within ${cfg.maxTurns} turns. The SDK used ${turnsUsed} turns trying to complete this task. Consider breaking this task into smaller pieces.`,
              learnings: [],
              failureContext: {
                toolCalls: countToolCalls(toolsUsed),
                iterations: turnsUsed,
              },
            };
          }

          if (msg.is_error) {
            return {
              status: "failed",
              error: `SDK execution error: ${responseText}`,
              failureContext: {
                toolCalls: countToolCalls(toolsUsed),
                iterations: turnsUsed,
              },
            };
          }
        }
      }

      dbLogger.info("SDK stream complete", { messageCount, hasResponse: !!responseText });

      if (!responseText) {
        throw new Error(`No response received from SDK (${messageCount} messages processed)`);
      }

      // 4. Parse response
      const parsed = parseExecutionResponse(responseText);

      // 5. Build TaskResult
      const result: TaskResult = {
        status: parsed.status,
        outcome: parsed.outcome,
        learnings: parsed.learnings,
      };

      if (parsed.question) {
        result.question = parsed.question;
        result.questionContext = parsed.questionContext;
      }

      if (parsed.researchTopic) {
        result.researchTopic = parsed.researchTopic;
        result.researchDescription = parsed.researchDescription;
      }

      const durationMs = Date.now() - startTime;

      dbLogger.info("SDK task execution complete", {
        taskId: task.id,
        status: result.status,
        learningsCount: result.learnings?.length || 0,
        toolsUsed: [...new Set(toolsUsed)],
        turnsUsed,
        durationMs,
      });

      // Log completion to activity
      logActivity(projectId, `SDK Completed: ${task.title}`, {
        taskId: task.id,
        status: result.status,
        turnsUsed,
        toolsUsed: [...new Set(toolsUsed)],
        durationMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      dbLogger.error("SDK task execution failed", {
        taskId: task.id,
        error: String(error),
        durationMs,
      });

      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

function countToolCalls(tools: string[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    counts.set(tool, (counts.get(tool) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
}

/**
 * Default executor using config settings.
 */
export const executor = createExecutor();

/**
 * Execute a task with custom options.
 * Standalone function for direct use.
 */
export async function executeTask(
  task: Task,
  orientation: Orientation,
  options?: Partial<ExecutorConfig>
): Promise<TaskResult> {
  const exec = createExecutor(options);
  return exec(task, orientation);
}
