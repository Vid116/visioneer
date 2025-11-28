#!/usr/bin/env tsx

/**
 * Show Knowledge CLI
 *
 * Displays all knowledge chunks stored for a project.
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import { listProjects, searchChunksByTags } from "../db/queries.js";

function showKnowledge() {
  initializeSchema();

  let projectId = process.argv[2];

  if (!projectId) {
    const projects = listProjects();
    if (projects.length === 0) {
      console.log("No projects found.");
      closeDatabase();
      return;
    }
    projectId = projects[0].id;
  }

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║              STORED KNOWLEDGE                              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  const chunks = searchChunksByTags(projectId, [], undefined, undefined, 50);

  for (const chunk of chunks) {
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log(`  Type: ${chunk.type} | Confidence: ${chunk.confidence}`);
    console.log(`  Tags: ${chunk.tags.join(", ")}`);
    console.log("  ─────────────────────────────────────────────────────────────");
    // Word wrap the content
    const lines = chunk.content.split("\n");
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  console.log(`Total: ${chunks.length} knowledge chunks`);

  closeDatabase();
}

showKnowledge();
