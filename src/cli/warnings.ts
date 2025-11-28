#!/usr/bin/env tsx

/**
 * Warnings CLI
 *
 * Manage coherence warnings for off-track tasks:
 * - List unresolved warnings
 * - Resolve warnings (exec, skip, edit)
 *
 * Usage:
 *   npm run warnings                        # List unresolved warnings
 *   npm run warnings resolve <id> exec      # Execute the task anyway
 *   npm run warnings resolve <id> skip      # Dismiss, don't execute
 *   npm run warnings resolve <id> edit      # Modify the task description
 *   npm run warnings --all                  # Include resolved warnings
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  listProjects,
  getProject,
  getCoherenceWarnings,
  getCoherenceWarning,
  resolveCoherenceWarning,
  getTask,
  updateTask,
} from "../db/queries.js";
import { CoherenceResolution } from "../utils/types.js";
import * as readline from "readline";

function parseArgs(): {
  projectId?: string;
  command?: string;
  warningId?: string;
  resolution?: string;
  showAll: boolean;
} {
  const args = process.argv.slice(2);
  let projectId: string | undefined;
  let command: string | undefined;
  let warningId: string | undefined;
  let resolution: string | undefined;
  let showAll = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--all") {
      showAll = true;
    } else if (arg === "--project" && i + 1 < args.length) {
      projectId = args[++i];
    } else if (arg === "resolve" && i + 2 < args.length) {
      command = "resolve";
      warningId = args[++i];
      resolution = args[++i];
    } else if (!command && !arg.startsWith("--")) {
      // Could be a warning ID for quick access
      warningId = arg;
    }
  }

  return { projectId, command, warningId, resolution, showAll };
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMins > 0) {
    return `${diffMins}m ago`;
  } else {
    return "just now";
  }
}

async function promptForEdit(currentDescription: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log();
  console.log("Current task description:");
  console.log(`  ${currentDescription}`);
  console.log();

  return new Promise((resolve) => {
    rl.question("Enter new description (or press Enter to keep current): ", (answer) => {
      rl.close();
      resolve(answer.trim() || currentDescription);
    });
  });
}

async function run() {
  initializeSchema();

  const { projectId: argProjectId, command, warningId, resolution, showAll } = parseArgs();

  // Get project ID
  let projectId = argProjectId;
  if (!projectId) {
    const projects = listProjects();
    if (projects.length === 0) {
      console.log("No projects found. Create a project first.");
      closeDatabase();
      process.exit(1);
    }
    projectId = projects[0].id;
  }

  const project = getProject(projectId);
  if (!project) {
    console.log(`Project not found: ${projectId}`);
    closeDatabase();
    process.exit(1);
  }

  // =========================================================================
  // Resolve Warning
  // =========================================================================
  if (command === "resolve" && warningId && resolution) {
    const warning = getCoherenceWarning(warningId);

    if (!warning) {
      console.log(`Warning not found: ${warningId}`);
      closeDatabase();
      process.exit(1);
    }

    if (warning.resolved) {
      console.log("Warning already resolved.");
      closeDatabase();
      return;
    }

    const task = getTask(warning.task_id);
    if (!task) {
      console.log(`Task not found: ${warning.task_id}`);
      closeDatabase();
      process.exit(1);
    }

    let resolvedAs: CoherenceResolution;

    switch (resolution) {
      case "exec":
      case "execute":
        resolvedAs = "executed";
        // Mark the warning as resolved, task can now be executed
        resolveCoherenceWarning(warningId, resolvedAs);
        console.log();
        console.log("Warning resolved: Task will be executed in next cycle.");
        console.log(`  Task: ${task.title}`);
        break;

      case "skip":
      case "dismiss":
        resolvedAs = "dismissed";
        // Mark warning as dismissed and skip the task
        resolveCoherenceWarning(warningId, resolvedAs);
        updateTask(task.id, { status: "done", outcome: "Skipped due to coherence concerns" });
        console.log();
        console.log("Warning dismissed: Task marked as skipped.");
        console.log(`  Task: ${task.title}`);
        break;

      case "edit":
      case "modify":
        resolvedAs = "modified";
        const newDescription = await promptForEdit(task.description);
        updateTask(task.id, { description: newDescription });
        resolveCoherenceWarning(warningId, resolvedAs);
        console.log();
        console.log("Task modified and warning resolved.");
        console.log(`  Task: ${task.title}`);
        console.log(`  New description: ${newDescription}`);
        break;

      default:
        console.log(`Unknown resolution: ${resolution}`);
        console.log("Valid options: exec, skip, edit");
        closeDatabase();
        process.exit(1);
    }

    closeDatabase();
    return;
  }

  // =========================================================================
  // List Warnings (default)
  // =========================================================================
  console.log();

  const warnings = getCoherenceWarnings(projectId, showAll);

  if (warnings.length === 0) {
    console.log("COHERENCE WARNINGS");
    console.log("═".repeat(60));
    console.log();
    console.log("  No warnings found.");
    console.log();
    console.log("  All tasks are aligned with the current goal.");
    closeDatabase();
    return;
  }

  const unresolvedCount = warnings.filter((w) => !w.resolved).length;
  const headerText = showAll
    ? `COHERENCE WARNINGS (${unresolvedCount} unresolved, ${warnings.length} total)`
    : `COHERENCE WARNINGS (${unresolvedCount} unresolved)`;

  console.log("┌" + "─".repeat(59) + "┐");
  console.log("│ " + headerText.padEnd(58) + "│");
  console.log("├" + "─".repeat(59) + "┤");

  for (let i = 0; i < warnings.length; i++) {
    const warning = warnings[i];
    const task = getTask(warning.task_id);
    const taskTitle = task?.title || "Unknown task";

    const statusIndicator = warning.resolved ? "[RESOLVED]" : "";
    const idShort = warning.id.slice(0, 8);

    console.log("│" + " ".repeat(59) + "│");
    console.log(`│ [${i + 1}] Task: "${taskTitle.slice(0, 42)}"`.padEnd(60) + "│");
    console.log(`│     ${statusIndicator}`.padEnd(60) + "│");
    console.log(`│     Concern: ${warning.concern.slice(0, 42)}`.padEnd(60) + "│");

    if (warning.suggestion) {
      console.log(`│     Suggestion: ${warning.suggestion.slice(0, 39)}`.padEnd(60) + "│");
    }

    console.log(`│     Created: ${formatTime(warning.created_at)}`.padEnd(60) + "│");

    if (!warning.resolved) {
      console.log(`│     ID: ${idShort}...`.padEnd(60) + "│");
      console.log("│" + " ".repeat(59) + "│");
      console.log(`│     npm run warnings resolve ${idShort} exec|skip|edit`.padEnd(60) + "│");
    } else {
      console.log(`│     Resolution: ${warning.resolution}`.padEnd(60) + "│");
    }

    if (i < warnings.length - 1) {
      console.log("│" + "─".repeat(59) + "│");
    }
  }

  console.log("└" + "─".repeat(59) + "┘");
  console.log();

  if (unresolvedCount > 0) {
    console.log("RESOLUTION OPTIONS:");
    console.log("  exec  - Execute the task anyway (I know what I'm doing)");
    console.log("  skip  - Dismiss the task, mark as skipped");
    console.log("  edit  - Modify the task description to align with goal");
    console.log();
  }

  closeDatabase();
}

run().catch((error) => {
  console.error("Error:", error);
  closeDatabase();
  process.exit(1);
});
