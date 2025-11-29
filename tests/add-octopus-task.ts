#!/usr/bin/env tsx

/**
 * Add a task for the octopus learning goal
 */

import "dotenv/config";
import { initializeSchema, closeDatabase } from "../src/db/connection.js";
import { listProjects, createTask } from "../src/db/queries.js";

function main() {
  initializeSchema();

  const projects = listProjects();
  if (projects.length === 0) {
    console.log("No projects found.");
    closeDatabase();
    process.exit(1);
  }

  const projectId = projects[0].id;
  console.log(`Using project: ${projectId.slice(0, 8)}...`);

  const task = createTask(
    projectId,
    "Research 3 fascinating facts about octopuses",
    "Search the web for interesting and surprising facts about octopuses. Look for facts about their intelligence, biology, behavior, or unique abilities. Compile the most fascinating findings.",
    "Research"
  );

  console.log(`Created task: ${task.title}`);
  console.log(`  ID: ${task.id}`);
  console.log(`  Status: ${task.status}`);

  closeDatabase();
}

main();
