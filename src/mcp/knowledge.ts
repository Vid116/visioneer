#!/usr/bin/env tsx

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  storeChunk,
  getChunk,
  searchChunksByTags,
  searchSemantic,
  createRelationship,
  getRelationships,
  strengthenRelationship,
  weakenRelationship,
  recordCoretrieval,
} from "../db/queries.js";
import { embed } from "../embedding/index.js";
import { Chunk, Relationship, SearchResult, ChunkWithRelationship } from "../utils/types.js";
import { mcpLogger } from "../utils/logger.js";
import { getKnowledgeConfig } from "../utils/config.js";

// =============================================================================
// Input Schemas
// =============================================================================

const StoreChunkSchema = z.object({
  project_id: z.string().uuid(),
  content: z.string(),
  type: z.enum(["research", "insight", "decision", "resource", "attempt", "user_input"]),
  tags: z.array(z.string()),
  confidence: z.enum(["verified", "inferred", "speculative"]),
  source: z.enum(["research", "user", "deduction", "experiment"]),
  related_to: z.array(z.object({
    chunk_id: z.string().uuid(),
    relationship_type: z.enum(["supports", "contradicts", "builds_on", "replaces", "requires", "related_to"]),
  })).optional(),
});

const SearchSemanticSchema = z.object({
  project_id: z.string().uuid(),
  query: z.string(),
  limit: z.number().min(1).max(100).optional(),
  min_similarity: z.number().min(0).max(1).optional(),
  filters: z.object({
    types: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    confidence: z.array(z.string()).optional(),
    since: z.string().optional(),
  }).optional(),
});

const SearchTagsSchema = z.object({
  project_id: z.string().uuid(),
  tags: z.array(z.string()),
  any_tags: z.array(z.string()).optional(),
  confidence: z.array(z.enum(["verified", "inferred", "speculative"])).optional(),
  limit: z.number().min(1).max(100).optional(),
});

const GetRelatedSchema = z.object({
  chunk_id: z.string().uuid(),
  relationship_type: z.enum(["supports", "contradicts", "builds_on", "replaces", "requires", "related_to"]).optional(),
  min_weight: z.number().min(0).max(1).optional(),
  limit: z.number().min(1).max(100).optional(),
  direction: z.enum(["outgoing", "incoming", "both"]).optional(),
});

const CreateRelationshipSchema = z.object({
  from_chunk_id: z.string().uuid(),
  to_chunk_id: z.string().uuid(),
  type: z.enum(["supports", "contradicts", "builds_on", "replaces", "requires", "related_to"]),
  weight: z.number().min(0).max(1).optional(),
  context_tags: z.array(z.string()).optional(),
});

const StrengthenRelationshipSchema = z.object({
  from_chunk_id: z.string().uuid(),
  to_chunk_id: z.string().uuid(),
  amount: z.number().min(0).max(1).optional(),
});

const WeakenRelationshipSchema = z.object({
  from_chunk_id: z.string().uuid(),
  to_chunk_id: z.string().uuid(),
  reason: z.enum(["contradicted", "replaced", "manual"]),
  amount: z.number().min(0).max(1).optional(),
});

const GetChunkSchema = z.object({
  chunk_id: z.string().uuid(),
});

const GetContradictionsSchema = z.object({
  project_id: z.string().uuid(),
  unresolved_only: z.boolean().optional(),
});

// =============================================================================
// Server Setup
// =============================================================================

const server = new Server(
  {
    name: "visioneer-knowledge",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Session ID for co-retrieval tracking
const sessionId = uuidv4();

// =============================================================================
// Tool Definitions
// =============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "store_chunk",
        description: "Stores new knowledge. Automatically generates embedding for semantic search. If related_to provided, creates explicit relationships.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            content: { type: "string", description: "The actual knowledge content" },
            type: { type: "string", enum: ["research", "insight", "decision", "resource", "attempt", "user_input"] },
            tags: { type: "array", items: { type: "string" } },
            confidence: { type: "string", enum: ["verified", "inferred", "speculative"] },
            source: { type: "string", enum: ["research", "user", "deduction", "experiment"] },
            related_to: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chunk_id: { type: "string" },
                  relationship_type: { type: "string" },
                },
              },
            },
          },
          required: ["project_id", "content", "type", "tags", "confidence", "source"],
        },
      },
      {
        name: "search_semantic",
        description: "Vector similarity search with optional filters. Records co-retrieval for implicit relationship strengthening.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            query: { type: "string" },
            limit: { type: "number" },
            min_similarity: { type: "number" },
            filters: {
              type: "object",
              properties: {
                types: { type: "array", items: { type: "string" } },
                tags: { type: "array", items: { type: "string" } },
                confidence: { type: "array", items: { type: "string" } },
                since: { type: "string" },
              },
            },
          },
          required: ["project_id", "query"],
        },
      },
      {
        name: "search_tags",
        description: "Structured tag-based retrieval.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            tags: { type: "array", items: { type: "string" }, description: "Chunks must have ALL these tags" },
            any_tags: { type: "array", items: { type: "string" }, description: "Chunks must have AT LEAST ONE of these" },
            confidence: { type: "array", items: { type: "string" } },
            limit: { type: "number" },
          },
          required: ["project_id", "tags"],
        },
      },
      {
        name: "get_related",
        description: "Traverses relationships from a chunk. Sorted by relationship score. Updates last_activated on traversed relationships.",
        inputSchema: {
          type: "object",
          properties: {
            chunk_id: { type: "string" },
            relationship_type: { type: "string" },
            min_weight: { type: "number" },
            limit: { type: "number" },
            direction: { type: "string", enum: ["outgoing", "incoming", "both"] },
          },
          required: ["chunk_id"],
        },
      },
      {
        name: "create_relationship",
        description: "Creates an explicit relationship between chunks. If relationship already exists, updates it.",
        inputSchema: {
          type: "object",
          properties: {
            from_chunk_id: { type: "string" },
            to_chunk_id: { type: "string" },
            type: { type: "string", enum: ["supports", "contradicts", "builds_on", "replaces", "requires", "related_to"] },
            weight: { type: "number" },
            context_tags: { type: "array", items: { type: "string" } },
          },
          required: ["from_chunk_id", "to_chunk_id", "type"],
        },
      },
      {
        name: "strengthen_relationship",
        description: "Increases relationship weight (capped at 1.0). Called automatically on co-retrieval, but can also be called explicitly.",
        inputSchema: {
          type: "object",
          properties: {
            from_chunk_id: { type: "string" },
            to_chunk_id: { type: "string" },
            amount: { type: "number", description: "Default 0.05" },
          },
          required: ["from_chunk_id", "to_chunk_id"],
        },
      },
      {
        name: "weaken_relationship",
        description: "Decreases relationship weight. Used when new knowledge contradicts old. If weight drops below 0.05, relationship is archived.",
        inputSchema: {
          type: "object",
          properties: {
            from_chunk_id: { type: "string" },
            to_chunk_id: { type: "string" },
            reason: { type: "string", enum: ["contradicted", "replaced", "manual"] },
            amount: { type: "number", description: "Default 0.3" },
          },
          required: ["from_chunk_id", "to_chunk_id", "reason"],
        },
      },
      {
        name: "get_chunk",
        description: "Retrieves a specific chunk by ID with full metadata.",
        inputSchema: {
          type: "object",
          properties: {
            chunk_id: { type: "string" },
          },
          required: ["chunk_id"],
        },
      },
      {
        name: "get_contradictions",
        description: "Returns chunks with 'contradicts' relationships for review.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            unresolved_only: { type: "boolean" },
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
      case "store_chunk": {
        const { project_id, content, type, tags, confidence, source, related_to } = StoreChunkSchema.parse(args);
        
        // Generate embedding
        const embedding = await embed(content);
        
        // Store chunk
        const chunk = storeChunk(project_id, content, type, tags, confidence, source, embedding);
        
        // Create relationships if specified
        if (related_to && related_to.length > 0) {
          for (const rel of related_to) {
            createRelationship(
              chunk.id,
              rel.chunk_id,
              rel.relationship_type,
              confidence === "verified" ? 0.8 : confidence === "inferred" ? 0.5 : 0.3
            );
          }
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(chunk) }],
        };
      }
      
      case "search_semantic": {
        const { project_id, query, limit, min_similarity, filters } = SearchSemanticSchema.parse(args);
        const config = getKnowledgeConfig();
        
        // Generate query embedding
        const queryEmbedding = await embed(query);
        
        // Search
        const searchResults = searchSemantic(
          project_id,
          queryEmbedding,
          limit || config.default_search_limit,
          min_similarity || config.min_similarity_threshold
        );
        
        // Get full chunks
        const results: SearchResult[] = [];
        const chunkIds: string[] = [];
        
        for (const result of searchResults) {
          const chunk = getChunk(result.chunkId);
          if (chunk) {
            // Apply filters if provided
            if (filters) {
              if (filters.types && !filters.types.includes(chunk.type)) continue;
              if (filters.tags && !filters.tags.every(t => chunk.tags.includes(t))) continue;
              if (filters.confidence && !filters.confidence.includes(chunk.confidence)) continue;
              if (filters.since && chunk.created_at < filters.since) continue;
            }
            
            results.push({ chunk, similarity: result.similarity });
            chunkIds.push(chunk.id);
          }
        }
        
        // Record co-retrieval for implicit relationship strengthening
        if (chunkIds.length >= 2) {
          recordCoretrieval(chunkIds, sessionId, query);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(results) }],
        };
      }
      
      case "search_tags": {
        const { project_id, tags, any_tags, confidence, limit } = SearchTagsSchema.parse(args);
        const chunks = searchChunksByTags(project_id, tags, any_tags, confidence, limit || 50);
        return {
          content: [{ type: "text", text: JSON.stringify(chunks) }],
        };
      }
      
      case "get_related": {
        const { chunk_id, relationship_type, min_weight, limit, direction } = GetRelatedSchema.parse(args);
        
        const relationships = getRelationships(
          chunk_id,
          relationship_type,
          min_weight || 0.1,
          direction || "both",
          limit || 20
        );
        
        // Get full chunks for each relationship
        const results: ChunkWithRelationship[] = [];
        
        for (const { relationship, direction: dir } of relationships) {
          const targetId = dir === "outgoing" ? relationship.to_chunk_id : relationship.from_chunk_id;
          const chunk = getChunk(targetId);
          
          if (chunk) {
            results.push({ chunk, relationship, direction: dir });
          }
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(results) }],
        };
      }
      
      case "create_relationship": {
        const { from_chunk_id, to_chunk_id, type, weight, context_tags } = CreateRelationshipSchema.parse(args);
        const relationship = createRelationship(from_chunk_id, to_chunk_id, type, weight || 0.5, context_tags || []);
        return {
          content: [{ type: "text", text: JSON.stringify(relationship) }],
        };
      }
      
      case "strengthen_relationship": {
        const { from_chunk_id, to_chunk_id, amount } = StrengthenRelationshipSchema.parse(args);
        const config = getKnowledgeConfig();
        const relationship = strengthenRelationship(from_chunk_id, to_chunk_id, amount || config.strengthen_amount);
        
        if (!relationship) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Relationship not found" }) }],
            isError: true,
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(relationship) }],
        };
      }
      
      case "weaken_relationship": {
        const { from_chunk_id, to_chunk_id, reason, amount } = WeakenRelationshipSchema.parse(args);
        const config = getKnowledgeConfig();
        const relationship = weakenRelationship(from_chunk_id, to_chunk_id, reason, amount || config.weaken_amount);
        
        if (!relationship) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Relationship not found" }) }],
            isError: true,
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(relationship) }],
        };
      }
      
      case "get_chunk": {
        const { chunk_id } = GetChunkSchema.parse(args);
        const chunk = getChunk(chunk_id);
        
        if (!chunk) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Chunk not found" }) }],
            isError: true,
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(chunk) }],
        };
      }
      
      case "get_contradictions": {
        const { project_id, unresolved_only } = GetContradictionsSchema.parse(args);
        
        // Get all chunks in the project
        const allChunks = searchChunksByTags(project_id, [], undefined, undefined, 1000);
        const contradictions: { chunk_a: Chunk; chunk_b: Chunk; relationship: Relationship }[] = [];
        
        for (const chunk of allChunks) {
          const relations = getRelationships(chunk.id, "contradicts", 0, "both", 100);
          
          for (const { relationship, direction } of relations) {
            const otherChunkId = direction === "outgoing" ? relationship.to_chunk_id : relationship.from_chunk_id;
            const otherChunk = getChunk(otherChunkId);
            
            if (otherChunk) {
              // Avoid duplicates (only add if chunk.id < otherChunkId)
              if (chunk.id < otherChunkId) {
                contradictions.push({
                  chunk_a: chunk,
                  chunk_b: otherChunk,
                  relationship,
                });
              }
            }
          }
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(contradictions) }],
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
  mcpLogger.info("Starting visioneer-knowledge MCP server");
  
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
