#!/usr/bin/env tsx

/**
 * Agent Cycle Runner
 *
 * Runs agent cycles in two modes:
 * - Single: Run ONE cycle (default)
 * - Continuous: Keep running until complete or blocked (--continuous flag)
 *
 * Single cycle:
 * 1. Wake up (load state)
 * 2. If waiting_for_user, print pending questions and exit
 * 3. Pick highest priority task
 * 4. Execute via Claude API
 * 5. Store learnings
 * 6. Update task status
 * 7. Log activity
 * 8. Print summary
 *
 * Usage:
 *   npx tsx src/agent/cycle.ts [projectId]
 *   npx tsx src/agent/cycle.ts [projectId] --continuous
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  listProjects,
  getQuestions,
  getActiveGoal,
  createTask,
  logActivity,
  getTasks,
} from "../db/queries.js";
import {
  wakeUp,
  canProceed,
  getStatusMessage,
  formatWakeUpSummary,
  executeWorkLoop,
  getSessionSummary,
  WakeUpResult,
} from "./index.js";

// SDK-based executor and planner (subscription-based, no API costs)
import { executor } from "./executor.js";
import { planTasksFromGoal } from "./planner.js";

// Phase 1: Memory system imports
import { getTickManager } from "../memory/tick-manager.js";
import { runDecayProcess } from "../memory/decay.js";
import { rebuildBM25Index } from "../retrieval/bm25.js";
import { updateAllPersistenceScores } from "../memory/persistence.js";

// =============================================================================
// Types
// =============================================================================

interface CycleResult {
  success: boolean;
  canContinue: boolean; // true if more work available
  tasksCompleted: number;
  tasksBlocked: number;
  totalTasksDone: number;
  totalTasksRemaining: number;
  status: "ready" | "waiting_for_user" | "complete" | "error" | "no_tasks";
  message?: string;
  tick?: number; // Phase 1: Current cognitive tick
}

// =============================================================================
// Single Cycle (returns result instead of exiting)
// =============================================================================

async function runSingleCycle(projectId: string, cycleNum?: number): Promise<CycleResult> {
  const cyclePrefix = cycleNum !== undefined ? `[Cycle ${cycleNum}] ` : "";

  // =========================================================================
  // Phase 1: Initialize Tick Manager
  // =========================================================================
  const tickManager = getTickManager(projectId);
  await tickManager.initialize();
  const tick = tickManager.incrementTick();
  console.log(`┌─ Tick ${tick} ──────────────────────────────────────────────────────┐`);

  // Run decay if needed (every tick by default)
  if (tickManager.shouldRunDecay(1)) {
    const state = tickManager.getState();
    const decayResult = runDecayProcess(projectId, tick, state.last_decay_tick);
    if (decayResult.processed > 0) {
      console.log(`  Memory decay: ${decayResult.processed} chunks, ${decayResult.statusChanges} status changes`);
      if (decayResult.tombstoned > 0) {
        console.log(`  Tombstoned: ${decayResult.tombstoned} chunks (archived)`);
      }
    }
    tickManager.markDecayRun();
  }

  // Update persistence scores periodically (every 5 ticks)
  if (tick % 5 === 0) {
    const psResult = updateAllPersistenceScores(projectId, tick);
    if (psResult.updated > 0) {
      console.log(`  Persistence scores: ${psResult.updated} updated, avg=${psResult.avgScore.toFixed(3)}`);
    }
  }

  // Rebuild BM25 index (could optimize to incremental later)
  try {
    const indexedCount = await rebuildBM25Index(projectId);
    if (indexedCount > 0) {
      console.log(`  BM25 index: ${indexedCount} chunks indexed`);
    }
  } catch (error) {
    console.warn(`  BM25 index rebuild failed:`, error);
  }

  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log();

  // =========================================================================
  // Step 1: Wake Up
  // =========================================================================
  console.log("┌─ Wake Up ────────────────────────────────────────────────────┐");

  const wakeResult = await wakeUp({
    projectId,
    trigger: "manual",
  });

  console.log(formatWakeUpSummary(wakeResult.summary));
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log();

  // =========================================================================
  // Step 2: Planning (if no tasks exist OR goal changed)
  // =========================================================================
  let currentWakeResult = wakeResult;

  // Check if we need to plan new tasks
  const goal = getActiveGoal(projectId);
  let needsPlanning = false;
  let planningReason = "";

  if (wakeResult.summary.totalTasks === 0) {
    needsPlanning = true;
    planningReason = "No tasks exist";
  } else if (wakeResult.state.orientation?.progress_snapshot) {
    // Check if all tasks done but progress_snapshot shows incomplete areas
    const allTasks = getTasks(projectId);
    const allDone = allTasks.length > 0 && allTasks.every((t) => t.status === "done");

    if (allDone) {
      const progressSnapshot = wakeResult.state.orientation.progress_snapshot;
      const incompleteAreas = progressSnapshot.filter(
        (p) => p.status !== "complete" && (p.percent === null || p.percent < 100)
      );

      if (incompleteAreas.length > 0) {
        needsPlanning = true;
        planningReason = `All tasks done but ${incompleteAreas.length} area(s) incomplete: ${incompleteAreas.map((a) => a.area).join(", ")}`;
      }
    }
  }

  if (!needsPlanning && goal) {
    // Check if any non-done tasks were created AFTER the current goal was set
    // This detects goal changes where old tasks are still present
    const allTasks = getTasks(projectId);
    const goalSetTime = new Date(goal.created_at).getTime();

    // Find tasks created after the goal was set (tasks for current goal)
    const tasksForCurrentGoal = allTasks.filter(
      (t) => new Date(t.created_at).getTime() >= goalSetTime
    );

    // Find non-done tasks from before the goal (old tasks)
    const oldPendingTasks = allTasks.filter(
      (t) => new Date(t.created_at).getTime() < goalSetTime && t.status !== "done"
    );

    if (tasksForCurrentGoal.length === 0 && oldPendingTasks.length === 0) {
      // All tasks are done AND they're all from before the current goal
      // This means we completed old goal's tasks but need new ones for current goal
      needsPlanning = true;
      planningReason = "Goal updated - all previous tasks complete";
    } else if (tasksForCurrentGoal.length === 0 && oldPendingTasks.length > 0) {
      // There are pending tasks but they're all from before the current goal
      // Mark old tasks as done (they were for a different goal) and plan new ones
      console.log("┌─ Goal Change Detected ────────────────────────────────────────┐");
      console.log(`  Current goal set: ${goal.created_at}`);
      console.log(`  Found ${oldPendingTasks.length} task(s) from previous goal`);
      console.log("  These tasks will be skipped (from old goal)");
      console.log("└────────────────────────────────────────────────────────────────┘");
      console.log();

      needsPlanning = true;
      planningReason = "Goal updated - need tasks for new goal";
    }
  }

  if (!goal && needsPlanning) {
    return {
      success: false,
      canContinue: false,
      tasksCompleted: 0,
      tasksBlocked: 0,
      totalTasksDone: 0,
      totalTasksRemaining: 0,
      status: "error",
      message: "No goal set. Set a goal first with: npm run goal \"Your goal\"",
      tick,
    };
  }

  if (needsPlanning && goal) {
    console.log("┌─ Planning ──────────────────────────────────────────────────┐");
    console.log(`  ${planningReason}. Creating tasks from goal...`);
    console.log(`  Goal: "${goal.goal}"`);
    console.log();
    console.log("  Calling Claude to plan tasks...");
    console.log();

    try {
      const plannedTasks = await planTasksFromGoal(
        wakeResult.state.orientation!,
        goal
      );

      // Create tasks in database, resolving dependencies by title
      const titleToId: Map<string, string> = new Map();

      for (const task of plannedTasks) {
        // Resolve depends_on titles to IDs
        const dependsOnIds: string[] = [];
        for (const depTitle of task.depends_on) {
          const depId = titleToId.get(depTitle);
          if (depId) {
            dependsOnIds.push(depId);
          }
        }

        const created = createTask(
          projectId,
          task.title,
          task.description,
          task.skill_area,
          dependsOnIds
        );

        titleToId.set(task.title, created.id);
        console.log(`  + Created: ${task.title}`);
      }

      console.log();
      console.log(`  Created ${plannedTasks.length} tasks.`);
      console.log("└──────────────────────────────────────────────────────────────┘");
      console.log();

      // Log activity
      logActivity(projectId, `Planned ${plannedTasks.length} tasks from goal`, {
        goal: goal.goal,
        taskCount: plannedTasks.length,
        tasks: plannedTasks.map((t) => t.title),
      });

      // Re-wake to load the new tasks
      currentWakeResult = await wakeUp({
        projectId,
        trigger: "manual",
      });
    } catch (error) {
      console.log(`  Planning failed: ${error}`);
      console.log("└──────────────────────────────────────────────────────────────┘");
      return {
        success: false,
        canContinue: false,
        tasksCompleted: 0,
        tasksBlocked: 0,
        totalTasksDone: 0,
        totalTasksRemaining: 0,
        status: "error",
        message: `Planning failed: ${error}`,
        tick,
      };
    }
  }

  // =========================================================================
  // Step 3: Check if we can proceed
  // =========================================================================
  // Re-fetch tasks after potential planning, and filter to current goal's tasks only
  const allTasksNow = getTasks(projectId);
  const currentGoal = getActiveGoal(projectId);
  const goalSetTime = currentGoal ? new Date(currentGoal.created_at).getTime() : 0;

  // Only count tasks created after current goal was set
  const currentGoalTasks = currentGoal
    ? allTasksNow.filter((t) => new Date(t.created_at).getTime() >= goalSetTime)
    : allTasksNow;

  const doneTasks = currentGoalTasks.filter((t) => t.status === "done").length;
  const remainingTasks = currentGoalTasks.length - doneTasks;

  if (!canProceed(currentWakeResult.state)) {
    const statusMsg = getStatusMessage(currentWakeResult.state);
    console.log(`${cyclePrefix}Status: ${statusMsg}`);

    // If waiting for user, show pending questions
    if (currentWakeResult.state.status === "waiting_for_user") {
      console.log();
      console.log("┌─ Pending Questions ─────────────────────────────────────────┐");

      const questions = getQuestions(projectId, "open");
      if (questions.length > 0) {
        for (const q of questions) {
          console.log(`  ? ${q.question}`);
          if (q.context) {
            console.log(`    Context: ${q.context.slice(0, 100)}...`);
          }
          console.log(`    ID: ${q.id}`);
          console.log();
        }
      }

      console.log("└──────────────────────────────────────────────────────────────┘");
      console.log();
      console.log("Answer questions to unblock tasks: npm run answer");
    }

    return {
      success: true,
      canContinue: false,
      tasksCompleted: 0,
      tasksBlocked: currentWakeResult.summary.blockedTasks,
      totalTasksDone: doneTasks,
      totalTasksRemaining: remainingTasks,
      status: currentWakeResult.state.status === "complete" ? "complete" : "waiting_for_user",
      message: statusMsg,
      tick,
    };
  }

  console.log(`${cyclePrefix}Status: ${getStatusMessage(currentWakeResult.state)}`);
  console.log();

  // =========================================================================
  // Step 4: Execute One Task
  // =========================================================================
  console.log("┌─ Execute Task ───────────────────────────────────────────────┐");

  const currentTask = currentWakeResult.state.current_task;
  if (!currentTask) {
    console.log("  No tasks ready to execute.");
    console.log("└──────────────────────────────────────────────────────────────┘");
    return {
      success: true,
      canContinue: false,
      tasksCompleted: 0,
      tasksBlocked: 0,
      totalTasksDone: doneTasks,
      totalTasksRemaining: remainingTasks,
      status: remainingTasks === 0 ? "complete" : "no_tasks",
      message: "No tasks ready to execute",
      tick,
    };
  }

  console.log(`  Task: ${currentTask.title}`);
  console.log(`  Description: ${currentTask.description.slice(0, 80)}...`);
  console.log(`  Skill Area: ${currentTask.skill_area}`);
  console.log();
  console.log("  Executing via SDK (subscription)...");
  console.log();

  // Execute single task via the work loop (handles all the bookkeeping)
  const session = await executeWorkLoop(currentWakeResult.state, executor, {
    maxTasksPerSession: 1, // Only execute one task
  });

  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log();

  // =========================================================================
  // Step 5: Print Summary
  // =========================================================================
  console.log("┌─ Cycle Summary ──────────────────────────────────────────────┐");
  console.log(
    getSessionSummary(session)
      .split("\n")
      .map((l) => "  " + l)
      .join("\n")
  );
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log();

  // Re-check task counts after execution (filter to current goal's tasks)
  const updatedAllTasks = getTasks(projectId);
  const activeGoal = getActiveGoal(projectId);
  const activeGoalTime = activeGoal ? new Date(activeGoal.created_at).getTime() : 0;

  // Only count tasks for the current goal
  const updatedTasks = activeGoal
    ? updatedAllTasks.filter((t) => new Date(t.created_at).getTime() >= activeGoalTime)
    : updatedAllTasks;

  const updatedDone = updatedTasks.filter((t) => t.status === "done").length;
  const updatedRemaining = updatedTasks.length - updatedDone;
  const readyTasks = updatedTasks.filter((t) => t.status === "ready").length;
  const inProgressTasks = updatedTasks.filter((t) => t.status === "in_progress").length;

  // Can continue if there are ready or in-progress tasks
  const canContinue = readyTasks > 0 || inProgressTasks > 0;

  return {
    success: true,
    canContinue,
    tasksCompleted: session.tasksCompleted,
    tasksBlocked: session.tasksBlocked,
    totalTasksDone: updatedDone,
    totalTasksRemaining: updatedRemaining,
    status: updatedRemaining === 0 ? "complete" : canContinue ? "ready" : "waiting_for_user",
    tick,
  };
}

// =============================================================================
// Continuous Mode
// =============================================================================

async function runContinuous(projectId: string): Promise<void> {
  const MAX_CYCLES = 50;
  const DELAY_BETWEEN_CYCLES_MS = 3000;
  let cycleCount = 0;
  let totalTasksCompleted = 0;
  const startTime = Date.now();

  console.log();
  console.log("========================================");
  console.log("  CONTINUOUS MODE");
  console.log("  Execution: SDK (subscription)");
  console.log("  Press Ctrl+C to stop");
  console.log("========================================");
  console.log();

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    const elapsed = formatElapsed(Date.now() - startTime);
    console.log();
    console.log("----------------------------------------");
    console.log("  Interrupted by user");
    console.log(`  Completed ${totalTasksCompleted} task(s) in ${cycleCount} cycle(s) (${elapsed})`);
    console.log("----------------------------------------");
    closeDatabase();
    process.exit(0);
  });

  while (cycleCount < MAX_CYCLES) {
    cycleCount++;

    console.log();
    console.log(`========== CYCLE ${cycleCount}/${MAX_CYCLES} ==========`);
    console.log();

    const result = await runSingleCycle(projectId, cycleCount);
    totalTasksCompleted += result.tasksCompleted;

    // Log cycle summary
    console.log(`Cycle ${cycleCount} complete: ${result.status}`);
    console.log(`  Tasks: ${result.totalTasksDone} done, ${result.totalTasksRemaining} remaining`);

    // Check exit conditions
    if (result.status === "complete") {
      const elapsed = formatElapsed(Date.now() - startTime);
      console.log();
      console.log("========================================");
      console.log("  ALL TASKS COMPLETE!");
      console.log(`  Total: ${result.totalTasksDone} tasks in ${cycleCount} cycle(s) (${elapsed})`);
      console.log("========================================");
      break;
    }

    if (result.status === "waiting_for_user") {
      console.log();
      console.log("----------------------------------------");
      console.log("  Remaining tasks blocked on unanswered questions.");
      console.log("  Run: npm run answer");
      console.log("----------------------------------------");
      break;
    }

    if (result.status === "error") {
      console.log();
      console.log("----------------------------------------");
      console.log(`  Error: ${result.message}`);
      console.log("----------------------------------------");
      break;
    }

    if (!result.canContinue) {
      console.log();
      console.log("----------------------------------------");
      console.log("  No more actionable tasks.");
      console.log("----------------------------------------");
      break;
    }

    // Delay before next cycle
    console.log();
    console.log(`  Waiting ${DELAY_BETWEEN_CYCLES_MS / 1000}s before next cycle...`);
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CYCLES_MS));
  }

  if (cycleCount >= MAX_CYCLES) {
    const elapsed = formatElapsed(Date.now() - startTime);
    console.log();
    console.log("========================================");
    console.log(`  Reached maximum cycle limit (${MAX_CYCLES})`);
    console.log(`  Completed ${totalTasksCompleted} task(s) in ${cycleCount} cycle(s) (${elapsed})`);
    console.log("========================================");
  }

  closeDatabase();
}

// =============================================================================
// Original Single Cycle Mode (with process.exit)
// =============================================================================

async function runCycle(): Promise<void> {
  console.log("========================================");
  console.log("  VISIONEER AGENT CYCLE");
  console.log("  Mode: SDK (subscription)");
  console.log("========================================");
  console.log();

  // Initialize database
  initializeSchema();

  // Get project ID from args (skip --continuous flag)
  // Skip args[0] (node path) and args[1] (tsx), start from args[2]
  let projectId = process.argv.slice(2).find((arg) => !arg.startsWith("--") && !arg.includes("cycle.ts") && !arg.includes("tsx"));

  if (!projectId) {
    const projects = listProjects();
    if (projects.length === 0) {
      console.log("No projects found. Create a project first.");
      closeDatabase();
      process.exit(1);
    }

    // Use most recent project
    projectId = projects[0].id;
    console.log(`Using project: ${projectId.slice(0, 8)}...`);
  }

  console.log();

  const result = await runSingleCycle(projectId);

  if (result.status === "error") {
    console.log(`Error: ${result.message}`);
    closeDatabase();
    process.exit(1);
  }

  if (result.tasksCompleted > 0) {
    console.log("Cycle complete. Run again to continue.");
  } else if (result.tasksBlocked > 0) {
    console.log("Task blocked. Check questions with: npm run status");
  } else if (result.status === "complete") {
    console.log("All tasks complete!");
  } else {
    console.log("No tasks processed.");
  }

  closeDatabase();
}

// =============================================================================
// Helpers
// =============================================================================

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// =============================================================================
// Entry Point
// =============================================================================

const continuous = process.argv.includes("--continuous");

// Initialize database first
initializeSchema();

// Get project ID from args (skip flags and script path)
// Skip args[0] (node path) and args[1] (tsx), start from args[2]
let projectId = process.argv.slice(2).find(
  (arg) => !arg.startsWith("--") && !arg.includes("cycle.ts") && !arg.includes("tsx")
);

if (!projectId) {
  const projects = listProjects();
  if (projects.length === 0) {
    console.log("No projects found. Create a project first.");
    closeDatabase();
    process.exit(1);
  }
  projectId = projects[0].id;
}

if (continuous) {
  console.log(`Using project: ${projectId.slice(0, 8)}...`);
  runContinuous(projectId).catch((error) => {
    console.error("\nContinuous mode failed:", error);
    closeDatabase();
    process.exit(1);
  });
} else {
  runCycle().catch((error) => {
    console.error("\nCycle failed:", error);
    closeDatabase();
    process.exit(1);
  });
}
