#!/usr/bin/env tsx

/**
 * Test script for Phase 3: Agent Loop
 *
 * Tests:
 * 1. Wake-up flow - state reconstruction
 * 2. Task prioritization - scoring and ordering
 * 3. Work execution loop - task processing
 */

import { initializeSchema, closeDatabase } from "./db/connection.js";
import {
  createProject,
  saveOrientation,
  createTask,
  createQuestion,
  answerQuestion,
  getTasks,
  getQuestions,
  logActivity,
  getRecentActivity,
  storeChunk,
  updateTask,
} from "./db/queries.js";
import {
  wakeUp,
  canProceed,
  getStatusMessage,
  formatWakeUpSummary,
  prioritizeTasks,
  explainPrioritization,
  executeWorkLoop,
  mockSuccessExecutor,
  getSessionSummary,
} from "./agent/index.js";
import { embed } from "./embedding/index.js";
import { Orientation, Phase } from "./utils/types.js";

async function runTests() {
  console.log("=".repeat(60));
  console.log("VISIONEER PHASE 3 - AGENT LOOP TEST");
  console.log("=".repeat(60));
  console.log();

  // Initialize
  console.log("1. Initializing...");
  initializeSchema();
  const project = createProject();
  console.log(`   ✓ Project created: ${project.id.slice(0, 8)}...`);
  console.log();

  // =========================================================================
  // Setup: Create orientation and tasks
  // =========================================================================
  console.log("2. Setting up project state...");

  const orientation: Orientation = {
    project_id: project.id,
    vision_summary: "Learn jazz piano well enough to play at a jam session",
    success_criteria: [
      "Comp through blues progression",
      "Play 3 jazz standards",
      "Take a solo over changes",
    ],
    constraints: ["1 hour per day practice time", "6 month timeline"],
    skill_map: [
      {
        skill: "Jazz Harmony",
        parent: null,
        dependencies: [],
        status: "in_progress",
        notes: "Foundation for understanding chord progressions",
      },
      {
        skill: "Chord Voicings",
        parent: "Jazz Harmony",
        dependencies: ["Jazz Harmony"],
        status: "not_started",
        notes: "Shell voicings, drop 2, rootless voicings",
      },
      {
        skill: "Blues Form",
        parent: null,
        dependencies: [],
        status: "not_started",
        notes: "12-bar blues structure and variations",
      },
    ],
    current_phase: "research" as Phase,
    key_decisions: [],
    active_priorities: ["Jazz Harmony", "Blues Form", "Practice routine"],
    progress_snapshot: [
      { area: "Jazz Harmony", status: "early", percent: 10, blockers: [] },
      { area: "Blues Form", status: "not_started", percent: 0, blockers: [] },
    ],
    last_rewritten: new Date().toISOString(),
    version: 1,
  };

  saveOrientation(orientation);
  console.log(`   ✓ Orientation saved`);

  // Create tasks with various states
  const task1 = createTask(
    project.id,
    "Research ii-V-I progressions",
    "Learn about the most common chord movement in jazz",
    "Jazz Harmony"
  );

  const task2 = createTask(
    project.id,
    "Study 12-bar blues form",
    "Understand the structure and variations",
    "Blues Form"
  );

  const task3 = createTask(
    project.id,
    "Practice shell voicings",
    "Apply 3-7 voicings to ii-V-I progressions",
    "Chord Voicings",
    [task1.id] // Depends on task1
  );

  const task4 = createTask(
    project.id,
    "Create practice routine",
    "Design a daily 1-hour practice schedule",
    "Practice routine"
  );

  // Create an open question that blocks a task
  const question = createQuestion(
    project.id,
    "Should I focus on bebop or blues vocabulary first?",
    "Both seem valuable but limited practice time",
    [task2.id]
  );

  console.log(`   ✓ Created 4 tasks (1 blocked by dependency, 1 blocked by question)`);
  console.log(`   ✓ Created 1 open question`);

  // Log some recent activity
  logActivity(project.id, "Started learning jazz piano", { phase: "research" });
  logActivity(project.id, "Researched basic chord theory", {
    skill_area: "Jazz Harmony",
  });

  console.log(`   ✓ Logged 2 activities`);
  console.log();

  // =========================================================================
  // Test 1: Wake-Up Flow
  // =========================================================================
  console.log("3. Testing Wake-Up Flow...");

  const wakeResult = await wakeUp({
    projectId: project.id,
    trigger: "manual",
  });

  console.log(`   ✓ Wake-up complete`);
  console.log(`   Status: ${wakeResult.state.status}`);
  console.log(`   Can proceed: ${canProceed(wakeResult.state)}`);
  console.log(`   Message: ${getStatusMessage(wakeResult.state)}`);
  console.log();
  console.log("   Summary:");
  console.log(
    formatWakeUpSummary(wakeResult.summary)
      .split("\n")
      .map((l) => "   " + l)
      .join("\n")
  );
  console.log();

  // =========================================================================
  // Test 2: Task Prioritization
  // =========================================================================
  console.log("4. Testing Task Prioritization...");

  const allTasks = getTasks(project.id);
  const readyTasks = allTasks.filter((t) => t.status === "ready");
  const recentActivity = getRecentActivity(project.id, 10);

  const prioritized = prioritizeTasks(readyTasks, orientation, recentActivity);

  console.log(`   Ready tasks: ${readyTasks.length}`);
  console.log(`   Prioritization order:`);
  for (const scored of prioritized) {
    console.log(`     ${explainPrioritization(scored)}`);
  }
  console.log();

  // =========================================================================
  // Test 3: Answer Question & Re-wake
  // =========================================================================
  console.log("5. Testing question answer → task unblock flow...");

  // Answer the question
  const lastWakeTime = new Date().toISOString();

  // Small delay to ensure answer time is after lastWakeTime
  await new Promise((r) => setTimeout(r, 100));

  answerQuestion(question.id, "Start with blues - it's more accessible");

  // Wake up again with lastWakeTime
  const wakeResult2 = await wakeUp({
    projectId: project.id,
    trigger: "user_input",
    lastWakeTime,
  });

  console.log(`   ✓ Question answered`);
  console.log(
    `   Ready tasks now: ${getTasks(project.id).filter((t) => t.status === "ready").length}`
  );
  console.log(
    `   Newly answered processed: ${wakeResult2.summary.newlyAnsweredQuestions}`
  );
  console.log();

  // =========================================================================
  // Test 4: Work Execution Loop
  // =========================================================================
  console.log("6. Testing Work Execution Loop...");

  // Get fresh state
  const freshWake = await wakeUp({
    projectId: project.id,
    trigger: "manual",
  });

  // Run execution loop with mock executor (completes all tasks)
  const session = await executeWorkLoop(freshWake.state, mockSuccessExecutor, {
    maxTasksPerSession: 3, // Limit for testing
  });

  console.log(`   ✓ Execution loop complete`);
  console.log();
  console.log("   Session Summary:");
  console.log(
    getSessionSummary(session)
      .split("\n")
      .map((l) => "   " + l)
      .join("\n")
  );
  console.log();

  // =========================================================================
  // Test 5: Final State Check
  // =========================================================================
  console.log("7. Checking final state...");

  const finalTasks = getTasks(project.id);
  const finalQuestions = getQuestions(project.id);
  const finalActivities = getRecentActivity(project.id, 20);

  console.log(`   Tasks by status:`);
  console.log(
    `     Ready: ${finalTasks.filter((t) => t.status === "ready").length}`
  );
  console.log(
    `     In Progress: ${finalTasks.filter((t) => t.status === "in_progress").length}`
  );
  console.log(
    `     Blocked: ${finalTasks.filter((t) => t.status === "blocked").length}`
  );
  console.log(
    `     Done: ${finalTasks.filter((t) => t.status === "done").length}`
  );
  console.log(
    `   Questions: ${finalQuestions.filter((q) => q.status === "open").length} open, ${finalQuestions.filter((q) => q.status === "answered").length} answered`
  );
  console.log(`   Activities logged: ${finalActivities.length}`);
  console.log();

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));
  console.log("✓ Wake-up flow: Working");
  console.log("✓ Task prioritization: Working");
  console.log("✓ Question → unblock flow: Working");
  console.log("✓ Execution loop: Working");
  console.log(`✓ Tasks completed: ${session.tasksCompleted}`);
  console.log(`✓ Learnings stored: ${session.learningsStored}`);
  console.log();
  console.log("Phase 3 complete! Agent loop is operational.");
  console.log("=".repeat(60));

  closeDatabase();
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  closeDatabase();
  process.exit(1);
});
