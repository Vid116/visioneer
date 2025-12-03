#!/usr/bin/env tsx

/**
 * Brief CLI
 *
 * Queries the knowledge base using semantic search and returns relevant learnings.
 * Now with relationship tracking and expansion!
 *
 * Usage: npm run brief "your query here"
 *
 * Examples:
 *   npm run brief "French Defense"
 *   npm run brief "checkmate patterns"
 *   npm run brief "opening principles"
 */

import { randomUUID } from "crypto";
import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  listProjects,
  getChunk,
  recordCoretrieval,
  expandWithRelationships,
  ExpandedChunk,
} from "../db/queries.js";
import { searchSimilar, loadVectorIndex } from "../db/vector-store.js";
import { embed } from "../embedding/index.js";

async function runBrief() {
  // Get query from args
  const query = process.argv.slice(2).join(" ");

  if (!query) {
    console.log("Usage: npm run brief \"your query here\"");
    console.log();
    console.log("Examples:");
    console.log("  npm run brief \"French Defense\"");
    console.log("  npm run brief \"checkmate patterns\"");
    console.log("  npm run brief \"opening principles\"");
    process.exit(1);
  }

  // Initialize database
  initializeSchema();
  loadVectorIndex();

  // Get project
  const projects = listProjects();
  if (projects.length === 0) {
    console.log("No projects found.");
    closeDatabase();
    process.exit(1);
  }

  const projectId = projects[0].id;

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                  VISIONEER KNOWLEDGE BRIEF                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`Query: "${query}"`);
  console.log();

  try {
    // Create embedding for query
    console.log("Searching knowledge base...");
    const queryEmbedding = await embed(query);

    // Search for similar chunks
    const results = searchSimilar(projectId, queryEmbedding, 10, 0.5);

    if (results.length === 0) {
      console.log();
      console.log("No relevant knowledge found for this query.");
      console.log("Try running more agent cycles to build the knowledge base.");
      closeDatabase();
      return;
    }

    // Track co-retrieval for relationship learning
    const chunkIds = results.map(r => r.chunkId);
    const sessionId = randomUUID();
    recordCoretrieval(chunkIds, sessionId, query);

    console.log(`Found ${results.length} relevant knowledge chunk(s).`);

    // Expand with relationships
    const relatedChunks = expandWithRelationships(chunkIds, projectId, 0.3, 1);
    if (relatedChunks.length > 0) {
      console.log(`+ ${relatedChunks.length} related via knowledge graph`);
    }

    console.log();
    console.log("─".repeat(60));

    // Display direct search results
    for (let i = 0; i < results.length; i++) {
      const { chunkId, similarity } = results[i];
      const chunk = getChunk(chunkId);

      if (!chunk) continue;

      const similarityPercent = (similarity * 100).toFixed(1);
      const typeIcon = getTypeIcon(chunk.type);
      const confidenceIcon = getConfidenceIcon(chunk.confidence);

      console.log();
      console.log(`${i + 1}. ${typeIcon} ${chunk.type.toUpperCase()} | ${confidenceIcon} ${chunk.confidence} | ${similarityPercent}% match`);
      console.log();

      // Format content - indent and wrap
      const lines = chunk.content.split("\n");
      for (const line of lines) {
        if (line.trim()) {
          console.log(`   ${line}`);
        }
      }

      if (chunk.tags && chunk.tags.length > 0) {
        console.log();
        console.log(`   Tags: ${chunk.tags.join(", ")}`);
      }

      console.log();
      console.log("─".repeat(60));
    }

    // Display related chunks from knowledge graph
    if (relatedChunks.length > 0) {
      console.log();
      console.log("╔════════════════════════════════════════════════════════════╗");
      console.log("║              RELATED VIA KNOWLEDGE GRAPH                   ║");
      console.log("╚════════════════════════════════════════════════════════════╝");
      console.log();

      for (let i = 0; i < Math.min(relatedChunks.length, 5); i++) {
        const chunk = relatedChunks[i] as ExpandedChunk;
        const typeIcon = getTypeIcon(chunk.type);
        const confidenceIcon = getConfidenceIcon(chunk.confidence);
        const relType = chunk._relationshipType || "related";
        const relWeight = chunk._relationshipWeight ? (chunk._relationshipWeight * 100).toFixed(0) : "?";

        console.log();
        console.log(`${i + 1}. ${typeIcon} ${chunk.type.toUpperCase()} | ${confidenceIcon} ${chunk.confidence} | via: ${relType} (${relWeight}%)`);
        console.log();

        // Format content - indent and wrap (truncate for related)
        const contentPreview = chunk.content.length > 300
          ? chunk.content.slice(0, 300) + "..."
          : chunk.content;
        const lines = contentPreview.split("\n");
        for (const line of lines) {
          if (line.trim()) {
            console.log(`   ${line}`);
          }
        }

        if (chunk.tags && chunk.tags.length > 0) {
          console.log();
          console.log(`   Tags: ${chunk.tags.join(", ")}`);
        }

        console.log();
        console.log("─".repeat(60));
      }

      if (relatedChunks.length > 5) {
        console.log(`   ... and ${relatedChunks.length - 5} more related chunks`);
      }
    }

    console.log();
    console.log(`Showing ${results.length} direct matches + ${relatedChunks.length} related via graph.`);
    console.log(`(Co-retrieval tracked for relationship learning)`);

  } catch (error) {
    console.error("Error searching knowledge:", error);
  }

  closeDatabase();
}

function getTypeIcon(type: string): string {
  switch (type) {
    case "research": return "🔬";
    case "insight": return "💡";
    case "decision": return "✅";
    case "question": return "❓";
    case "procedure": return "📋";
    default: return "📝";
  }
}

function getConfidenceIcon(confidence: string): string {
  switch (confidence) {
    case "verified": return "✓";
    case "inferred": return "~";
    case "speculative": return "?";
    default: return "-";
  }
}

runBrief().catch(console.error);
