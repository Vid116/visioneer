#!/usr/bin/env tsx

/**
 * Goal CLI
 *
 * Manage project goals:
 * - Set a new goal
 * - View current goal
 * - View goal history
 * - Clear current goal
 *
 * Usage:
 *   npm run goal                    # Show current goal
 *   npm run goal "learn jazz piano" # Set new goal
 *   npm run goal --history          # Show goal history for current project
 *   npm run goal --history --all    # Show goal history across all projects
 *   npm run goal --clear            # Clear current goal (mark as completed)
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  listProjects,
  getProject,
  getActiveGoal,
  createGoal,
  getGoalHistory,
  getAllGoalHistory,
  completeGoal,
  getPendingGoal,
  setPendingGoal,
  getTasks,
  createProject,
  saveOrientation,
} from "../db/queries.js";
import { Orientation, Phase } from "../utils/types.js";

function parseArgs(): {
  projectId?: string;
  goalText?: string;
  showHistory: boolean;
  showAll: boolean;
  clear: boolean;
} {
  const args = process.argv.slice(2);
  let projectId: string | undefined;
  let goalText: string | undefined;
  let showHistory = false;
  let showAll = false;
  let clear = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--history") {
      showHistory = true;
    } else if (arg === "--all") {
      showAll = true;
    } else if (arg === "--clear") {
      clear = true;
    } else if (arg === "--project" && i + 1 < args.length) {
      projectId = args[++i];
    } else if (!arg.startsWith("--") && !goalText) {
      goalText = arg;
    }
  }

  return { projectId, goalText, showHistory, showAll, clear };
}

function isCurrentlyExecuting(projectId: string): boolean {
  // Check if there's a task in_progress
  const tasks = getTasks(projectId, "in_progress");
  return tasks.length > 0;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

function formatRelativeTime(timestamp: string): string {
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

function run() {
  initializeSchema();

  const { projectId: argProjectId, goalText, showHistory, showAll, clear } = parseArgs();

  // Get project ID
  let projectId = argProjectId;
  if (!projectId) {
    const projects = listProjects();
    if (projects.length === 0) {
      // Auto-create a project if setting a goal
      if (goalText) {
        console.log("No projects found. Creating a new project...");
        const newProject = createProject();
        projectId = newProject.id;

        // Create initial orientation based on the goal
        const orientation: Orientation = {
          project_id: projectId,
          vision_summary: goalText,
          success_criteria: ["Accomplish the stated goal"],
          constraints: [],
          skill_map: [],
          current_phase: "intake" as Phase,
          key_decisions: [],
          active_priorities: [],
          progress_snapshot: [],
          last_rewritten: new Date().toISOString(),
          version: 1,
        };
        saveOrientation(orientation);
        console.log(`Created project: ${projectId.slice(0, 8)}...`);
      } else {
        console.log("No projects found. Create a project first by setting a goal:");
        console.log('  npm run goal "Your learning goal here"');
        closeDatabase();
        process.exit(1);
      }
    } else {
      projectId = projects[0].id;
    }
  }

  const project = getProject(projectId);
  if (!project) {
    console.log(`Project not found: ${projectId}`);
    closeDatabase();
    process.exit(1);
  }

  // =========================================================================
  // Show History
  // =========================================================================
  if (showHistory) {
    console.log();

    if (showAll) {
      console.log("GOAL HISTORY (All Projects)");
      console.log("═".repeat(60));
      console.log();

      const goals = getAllGoalHistory();

      if (goals.length === 0) {
        console.log("  No goals found.");
      } else {
        for (const goal of goals) {
          const status = goal.active ? "[ACTIVE]" : "[COMPLETED]";
          console.log(`  ${status} ${goal.goal}`);
          console.log(`    Project: ${goal.project_id.slice(0, 8)}...`);
          console.log(`    Created: ${formatTime(goal.created_at)}`);
          if (goal.completed_at) {
            console.log(`    Completed: ${formatTime(goal.completed_at)}`);
          }
          if (goal.outcome) {
            console.log(`    Outcome: ${goal.outcome}`);
          }
          console.log();
        }
      }
    } else {
      console.log(`GOAL HISTORY (Project: ${projectId.slice(0, 8)}...)`);
      console.log("═".repeat(60));
      console.log();

      const goals = getGoalHistory(projectId);

      if (goals.length === 0) {
        console.log("  No goals found for this project.");
      } else {
        for (const goal of goals) {
          const status = goal.active ? "[ACTIVE]" : "[COMPLETED]";
          console.log(`  ${status} ${goal.goal}`);
          console.log(`    Created: ${formatTime(goal.created_at)} (${formatRelativeTime(goal.created_at)})`);
          if (goal.completed_at) {
            console.log(`    Completed: ${formatTime(goal.completed_at)}`);
          }
          if (goal.outcome) {
            console.log(`    Outcome: ${goal.outcome}`);
          }
          console.log();
        }
      }
    }

    closeDatabase();
    return;
  }

  // =========================================================================
  // Clear Goal
  // =========================================================================
  if (clear) {
    const activeGoal = getActiveGoal(projectId);

    if (!activeGoal) {
      console.log("No active goal to clear.");
      closeDatabase();
      return;
    }

    completeGoal(activeGoal.id, "Manually cleared by user");
    console.log(`Goal cleared: "${activeGoal.goal}"`);
    closeDatabase();
    return;
  }

  // =========================================================================
  // Set New Goal
  // =========================================================================
  if (goalText) {
    const executing = isCurrentlyExecuting(projectId);

    if (executing) {
      // Queue the goal for after the current cycle
      setPendingGoal(projectId, goalText);
      console.log();
      console.log("Goal queued. Will apply after current cycle completes.");
      console.log();
      console.log(`  Pending goal: "${goalText}"`);
      console.log();
      console.log("Run 'npm run agent:cycle' to complete the current task.");
    } else {
      // Set immediately
      const goal = createGoal(projectId, goalText);
      console.log();
      console.log("Goal set successfully.");
      console.log();
      console.log(`  Current goal: "${goal.goal}"`);
      console.log(`  Created: ${formatRelativeTime(goal.created_at)}`);
      console.log();

      // Check if there was a previous goal
      const history = getGoalHistory(projectId);
      if (history.length > 1) {
        const previous = history[1]; // The one we just marked as completed
        console.log(`  Previous goal: "${previous.goal}"`);
        console.log(`  Outcome: ${previous.outcome || "Not specified"}`);
      }
    }

    closeDatabase();
    return;
  }

  // =========================================================================
  // Show Current Goal (default)
  // =========================================================================
  console.log();
  console.log(`CURRENT GOAL (Project: ${projectId.slice(0, 8)}...)`);
  console.log("═".repeat(60));
  console.log();

  const activeGoal = getActiveGoal(projectId);
  const pendingGoal = getPendingGoal(projectId);

  if (activeGoal) {
    console.log(`  "${activeGoal.goal}"`);
    console.log();
    console.log(`  Set: ${formatTime(activeGoal.created_at)} (${formatRelativeTime(activeGoal.created_at)})`);
  } else {
    console.log("  No active goal set.");
    console.log();
    console.log("  Set a goal with: npm run goal \"your goal here\"");
  }

  if (pendingGoal) {
    console.log();
    console.log("PENDING GOAL (will apply after current cycle)");
    console.log("─".repeat(60));
    console.log(`  "${pendingGoal.goal}"`);
    console.log(`  Queued: ${formatRelativeTime(pendingGoal.queued_at)}`);
  }

  console.log();
  console.log("─".repeat(60));
  console.log("  npm run goal \"...\"      Set new goal");
  console.log("  npm run goal --history  View past goals");
  console.log("  npm run goal --clear    Clear current goal");
  console.log();

  closeDatabase();
}

run();
