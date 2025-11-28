#!/usr/bin/env tsx

/**
 * Single Cycle Runner
 *
 * Runs ONE complete agent cycle:
 * 1. Wake up (load state)
 * 2. If waiting_for_user, print pending questions and exit
 * 3. Pick highest priority task
 * 4. Execute via Claude API
 * 5. Store learnings
 * 6. Update task status
 * 7. Log activity
 * 8. Print summary
 *
 * Usage: npx tsx src/agent/cycle.ts [projectId]
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import { listProjects, getQuestions } from "../db/queries.js";
import {
  wakeUp,
  canProceed,
  getStatusMessage,
  formatWakeUpSummary,
  executeWorkLoop,
  getSessionSummary,
} from "./index.js";
import { claudeExecutor } from "./executor.js";

async function runCycle() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║              VISIONEER AGENT CYCLE                         ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // Initialize database
  initializeSchema();

  // Get project ID from args or find active project
  let projectId = process.argv[2];

  if (!projectId) {
    const projects = listProjects();
    if (projects.length === 0) {
      console.log("❌ No projects found. Create a project first.");
      closeDatabase();
      process.exit(1);
    }

    // Use most recent project
    projectId = projects[0].id;
    console.log(`📂 Using project: ${projectId.slice(0, 8)}...`);
  }

  console.log();

  // =========================================================================
  // Step 1: Wake Up
  // =========================================================================
  console.log("┌─ Step 1: Wake Up ───────────────────────────────────────────┐");

  const wakeResult = await wakeUp({
    projectId,
    trigger: "manual",
  });

  console.log(formatWakeUpSummary(wakeResult.summary));
  console.log();

  // =========================================================================
  // Step 2: Check if we can proceed
  // =========================================================================
  if (!canProceed(wakeResult.state)) {
    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
    console.log(`⏸️  Status: ${getStatusMessage(wakeResult.state)}`);

    // If waiting for user, show pending questions
    if (wakeResult.state.status === "waiting_for_user") {
      console.log();
      console.log("┌─ Pending Questions ─────────────────────────────────────────┐");

      const questions = getQuestions(projectId, "open");
      if (questions.length > 0) {
        for (const q of questions) {
          console.log(`  ❓ ${q.question}`);
          if (q.context) {
            console.log(`     Context: ${q.context.slice(0, 100)}...`);
          }
          console.log(`     ID: ${q.id}`);
          console.log();
        }
      }

      console.log("└─────────────────────────────────────────────────────────────┘");
      console.log();
      console.log("Answer questions to unblock tasks, then run again.");
    }

    closeDatabase();
    process.exit(0);
  }

  console.log(`✅ Status: ${getStatusMessage(wakeResult.state)}`);
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log();

  // =========================================================================
  // Step 3-7: Execute One Task
  // =========================================================================
  console.log("┌─ Step 2: Execute Task ──────────────────────────────────────┐");

  const currentTask = wakeResult.state.current_task;
  if (!currentTask) {
    console.log("  No tasks ready to execute.");
    console.log("└─────────────────────────────────────────────────────────────┘");
    closeDatabase();
    process.exit(0);
  }

  console.log(`  📋 Task: ${currentTask.title}`);
  console.log(`  📝 Description: ${currentTask.description.slice(0, 80)}...`);
  console.log(`  🎯 Skill Area: ${currentTask.skill_area}`);
  console.log();
  console.log("  🤖 Calling Claude API...");
  console.log();

  // Execute single task via the work loop (handles all the bookkeeping)
  const session = await executeWorkLoop(wakeResult.state, claudeExecutor, {
    maxTasksPerSession: 1, // Only execute one task
  });

  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log();

  // =========================================================================
  // Step 8: Print Summary
  // =========================================================================
  console.log("┌─ Cycle Summary ─────────────────────────────────────────────┐");
  console.log(
    getSessionSummary(session)
      .split("\n")
      .map((l) => "  " + l)
      .join("\n")
  );
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log();

  if (session.tasksCompleted > 0) {
    console.log("✅ Cycle complete. Run again to continue.");
  } else if (session.tasksBlocked > 0) {
    console.log("⏸️  Task blocked. Check questions with: npm run status");
  } else {
    console.log("ℹ️  No tasks processed.");
  }

  closeDatabase();
}

runCycle().catch((error) => {
  console.error("\n❌ Cycle failed:", error);
  closeDatabase();
  process.exit(1);
});
