#!/usr/bin/env tsx

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  createTask,
  getTask,
  getTasks,
  updateTask,
  createQuestion,
  getQuestion,
  getQuestions,
  answerQuestion,
  logActivity,
  getRecentActivity,
} from "../db/queries.js";
import { Task, Question, Blocker } from "../utils/types.js";
import { mcpLogger } from "../utils/logger.js";

// =============================================================================
// Input Schemas
// =============================================================================

const GetTasksSchema = z.object({
  project_id: z.string().uuid(),
  status: z.enum(["ready", "in_progress", "blocked", "done"]).optional(),
  skill_area: z.string().optional(),
});

const CreateTaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  skill_area: z.string(),
  depends_on: z.array(z.string().uuid()).optional(),
});

const UpdateTaskSchema = z.object({
  task_id: z.string().uuid(),
  updates: z.object({
    status: z.enum(["ready", "in_progress", "blocked", "done"]).optional(),
    blocked_by: z.array(z.string().uuid()).optional(),
    description: z.string().optional(),
    outcome: z.string().optional(),
  }),
});

const GetQuestionsSchema = z.object({
  project_id: z.string().uuid(),
  status: z.enum(["open", "answered"]).optional(),
});

const CreateQuestionSchema = z.object({
  project_id: z.string().uuid(),
  question: z.string(),
  context: z.string(),
  blocks_tasks: z.array(z.string().uuid()).optional(),
});

const AnswerQuestionSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.string(),
});

const GetBlockersSchema = z.object({
  project_id: z.string().uuid(),
});

const LogActivitySchema = z.object({
  project_id: z.string().uuid(),
  action: z.string(),
  details: z.record(z.unknown()).optional(),
});

const GetRecentActivitySchema = z.object({
  project_id: z.string().uuid(),
  limit: z.number().min(1).max(100).optional(),
});

// =============================================================================
// Server Setup
// =============================================================================

const server = new Server(
  {
    name: "visioneer-working",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// =============================================================================
// Tool Definitions
// =============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_tasks",
        description: "Retrieves tasks, optionally filtered by status or skill area.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string", description: "UUID of the project" },
            status: { type: "string", enum: ["ready", "in_progress", "blocked", "done"] },
            skill_area: { type: "string" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "create_task",
        description: "Creates a new task. Status defaults to 'ready' unless dependencies are incomplete.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            skill_area: { type: "string" },
            depends_on: { type: "array", items: { type: "string" }, description: "Task IDs this depends on" },
          },
          required: ["project_id", "title", "description", "skill_area"],
        },
      },
      {
        name: "update_task",
        description: "Updates task fields. Changing status to 'done' may trigger Orientation rewrite.",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            updates: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["ready", "in_progress", "blocked", "done"] },
                blocked_by: { type: "array", items: { type: "string" } },
                description: { type: "string" },
                outcome: { type: "string" },
              },
            },
          },
          required: ["task_id", "updates"],
        },
      },
      {
        name: "get_questions",
        description: "Retrieves questions, optionally filtered by status.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            status: { type: "string", enum: ["open", "answered"] },
          },
          required: ["project_id"],
        },
      },
      {
        name: "create_question",
        description: "Queues a question for the user. If blocks_tasks provided, those tasks are automatically marked as blocked.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            question: { type: "string" },
            context: { type: "string", description: "Why we're asking, what we know" },
            blocks_tasks: { type: "array", items: { type: "string" }, description: "Task IDs to mark as blocked" },
          },
          required: ["project_id", "question", "context"],
        },
      },
      {
        name: "answer_question",
        description: "Records user's answer. Automatically unblocks any tasks that were waiting only on this question.",
        inputSchema: {
          type: "object",
          properties: {
            question_id: { type: "string" },
            answer: { type: "string" },
          },
          required: ["question_id", "answer"],
        },
      },
      {
        name: "get_blockers",
        description: "Returns all blocked tasks with their blocker details.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "log_activity",
        description: "Appends to the rolling activity log.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            action: { type: "string" },
            details: { type: "object" },
          },
          required: ["project_id", "action"],
        },
      },
      {
        name: "get_recent_activity",
        description: "Returns last N activities, most recent first.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            limit: { type: "number", description: "Max activities to return (default 20)" },
          },
          required: ["project_id"],
        },
      },
    ],
  };
});

// =============================================================================
// Tool Handlers
// =============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  mcpLogger.debug(`Tool called: ${name}`, args);
  
  try {
    switch (name) {
      case "get_tasks": {
        const { project_id, status, skill_area } = GetTasksSchema.parse(args);
        const tasks = getTasks(project_id, status, skill_area);
        return {
          content: [{ type: "text", text: JSON.stringify(tasks) }],
        };
      }
      
      case "create_task": {
        const { project_id, title, description, skill_area, depends_on } = CreateTaskSchema.parse(args);
        const task = createTask(project_id, title, description, skill_area, depends_on || []);
        return {
          content: [{ type: "text", text: JSON.stringify(task) }],
        };
      }
      
      case "update_task": {
        const { task_id, updates } = UpdateTaskSchema.parse(args);
        const task = updateTask(task_id, updates);
        
        if (!task) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Task not found" }) }],
            isError: true,
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(task) }],
        };
      }
      
      case "get_questions": {
        const { project_id, status } = GetQuestionsSchema.parse(args);
        const questions = getQuestions(project_id, status);
        return {
          content: [{ type: "text", text: JSON.stringify(questions) }],
        };
      }
      
      case "create_question": {
        const { project_id, question, context, blocks_tasks } = CreateQuestionSchema.parse(args);
        const q = createQuestion(project_id, question, context, blocks_tasks || []);
        return {
          content: [{ type: "text", text: JSON.stringify(q) }],
        };
      }
      
      case "answer_question": {
        const { question_id, answer } = AnswerQuestionSchema.parse(args);
        const result = answerQuestion(question_id, answer);

        // Include pivot handling info in response
        const response = {
          ...result,
          pivotNote: result.pivotDetected
            ? "PIVOT DETECTED: Use handlePivot() to process direction change, cancel tasks, and rewrite orientation."
            : null,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(response) }],
        };
      }
      
      case "get_blockers": {
        const { project_id } = GetBlockersSchema.parse(args);
        const blockedTasks = getTasks(project_id, "blocked");
        
        const blockers: Blocker[] = [];
        
        for (const task of blockedTasks) {
          // Check if blocked by questions
          if (task.blocked_by.length > 0) {
            const blockingQuestions: Question[] = [];
            for (const qId of task.blocked_by) {
              const q = getQuestion(qId);
              if (q) blockingQuestions.push(q);
            }
            blockers.push({
              task,
              blocked_by: blockingQuestions,
              blocker_type: "question",
            });
          }
          
          // Check if blocked by dependencies
          if (task.depends_on.length > 0) {
            const blockingTasks: Task[] = [];
            for (const tId of task.depends_on) {
              const t = getTask(tId);
              if (t && t.status !== "done") {
                blockingTasks.push(t);
              }
            }
            if (blockingTasks.length > 0) {
              blockers.push({
                task,
                blocked_by: blockingTasks,
                blocker_type: "dependency",
              });
            }
          }
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(blockers) }],
        };
      }
      
      case "log_activity": {
        const { project_id, action, details } = LogActivitySchema.parse(args);
        const activity = logActivity(project_id, action, details);
        return {
          content: [{ type: "text", text: JSON.stringify({ activity_id: activity.id }) }],
        };
      }
      
      case "get_recent_activity": {
        const { project_id, limit } = GetRecentActivitySchema.parse(args);
        const activities = getRecentActivity(project_id, limit || 20);
        return {
          content: [{ type: "text", text: JSON.stringify(activities) }],
        };
      }
      
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    mcpLogger.error(`Tool error: ${name}`, { error });
    return {
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
});

// =============================================================================
// Main
// =============================================================================

async function main() {
  mcpLogger.info("Starting visioneer-working MCP server");
  
  // Initialize database
  initializeSchema();
  
  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  mcpLogger.info("Server connected and ready");
  
  // Cleanup on exit
  process.on("SIGINT", () => {
    closeDatabase();
    process.exit(0);
  });
}

main().catch((error) => {
  mcpLogger.error("Server failed to start", { error });
  process.exit(1);
});
