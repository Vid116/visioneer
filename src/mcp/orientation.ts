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
  createProject,
  getProject,
  listProjects,
  getOrientation,
  saveOrientation,
  storeChunk,
} from "../db/queries.js";
import { Orientation, Phase, ProjectSummary } from "../utils/types.js";
import { mcpLogger } from "../utils/logger.js";

// =============================================================================
// Input Schemas
// =============================================================================

const GetOrientationSchema = z.object({
  project_id: z.string().uuid(),
});

const UpdateOrientationSchema = z.object({
  project_id: z.string().uuid(),
  orientation: z.object({
    vision_summary: z.string(),
    success_criteria: z.array(z.string()),
    constraints: z.array(z.string()),
    skill_map: z.array(z.object({
      skill: z.string(),
      parent: z.string().nullable(),
      dependencies: z.array(z.string()),
      status: z.enum(["not_started", "in_progress", "achieved"]),
      notes: z.string(),
    })),
    current_phase: z.enum(["intake", "research", "planning", "execution", "refinement", "complete"]),
    key_decisions: z.array(z.object({
      decision: z.string(),
      reasoning: z.string(),
      date: z.string(),
    })),
    active_priorities: z.array(z.string()),
    progress_snapshot: z.array(z.object({
      area: z.string(),
      status: z.enum(["not_started", "early", "progressing", "nearly_done", "complete"]),
      percent: z.number().nullable(),
      blockers: z.array(z.string()),
    })),
  }),
});

const CreateProjectSchema = z.object({
  vision_summary: z.string(),
  success_criteria: z.array(z.string()),
  constraints: z.array(z.string()).optional(),
});

// =============================================================================
// Server Setup
// =============================================================================

const server = new Server(
  {
    name: "visioneer-orientation",
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
        name: "get_orientation",
        description: "Retrieves the current orientation document for a project. This should be the FIRST call when waking up on a project.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string", description: "UUID of the project" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "update_orientation",
        description: "Replaces the orientation document. Used during rewrite triggers. Archives previous version to Knowledge Layer before overwriting.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string", description: "UUID of the project" },
            orientation: {
              type: "object",
              description: "The complete orientation object",
              properties: {
                vision_summary: { type: "string" },
                success_criteria: { type: "array", items: { type: "string" } },
                constraints: { type: "array", items: { type: "string" } },
                skill_map: { type: "array" },
                current_phase: { type: "string" },
                key_decisions: { type: "array" },
                active_priorities: { type: "array", items: { type: "string" } },
                progress_snapshot: { type: "array" },
              },
            },
          },
          required: ["project_id", "orientation"],
        },
      },
      {
        name: "list_projects",
        description: "Lists all projects with minimal info for selection.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_project",
        description: "Initializes a new project with starting orientation.",
        inputSchema: {
          type: "object",
          properties: {
            vision_summary: { type: "string", description: "What we're trying to achieve" },
            success_criteria: { type: "array", items: { type: "string" }, description: "Concrete, testable outcomes" },
            constraints: { type: "array", items: { type: "string" }, description: "Time, resources, priorities" },
          },
          required: ["vision_summary", "success_criteria"],
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
      case "get_orientation": {
        const { project_id } = GetOrientationSchema.parse(args);
        const orientation = getOrientation(project_id);
        
        if (!orientation) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Project not found" }) }],
            isError: true,
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(orientation) }],
        };
      }
      
      case "update_orientation": {
        const { project_id, orientation: orientationData } = UpdateOrientationSchema.parse(args);
        
        // Get current orientation to archive
        const current = getOrientation(project_id);
        const newVersion = current ? current.version + 1 : 1;
        
        // Archive current if exists
        if (current) {
          storeChunk(
            project_id,
            JSON.stringify(current),
            "decision",
            ["orientation_archive", `v${current.version}`],
            "verified",
            "deduction"
          );
        }
        
        // Create new orientation
        const newOrientation: Orientation = {
          project_id,
          ...orientationData,
          last_rewritten: new Date().toISOString(),
          version: newVersion,
        };
        
        saveOrientation(newOrientation);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              updated_at: newOrientation.last_rewritten,
              version: newVersion,
            }),
          }],
        };
      }
      
      case "list_projects": {
        const projects = listProjects();
        const summaries: ProjectSummary[] = [];
        
        for (const project of projects) {
          const orientation = getOrientation(project.id);
          summaries.push({
            project_id: project.id,
            vision_summary: orientation?.vision_summary || "(no orientation)",
            current_phase: orientation?.current_phase || "intake",
            last_updated: orientation?.last_rewritten || project.created_at,
          });
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(summaries) }],
        };
      }
      
      case "create_project": {
        const { vision_summary, success_criteria, constraints } = CreateProjectSchema.parse(args);
        
        const project = createProject();
        
        const orientation: Orientation = {
          project_id: project.id,
          vision_summary,
          success_criteria,
          constraints: constraints || [],
          skill_map: [],
          current_phase: "intake" as Phase,
          key_decisions: [],
          active_priorities: [],
          progress_snapshot: [],
          last_rewritten: new Date().toISOString(),
          version: 1,
        };
        
        saveOrientation(orientation);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              project_id: project.id,
              orientation,
            }),
          }],
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
  mcpLogger.info("Starting visioneer-orientation MCP server");
  
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
