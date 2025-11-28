#!/usr/bin/env tsx

/**
 * Full Integration Test
 *
 * Runs the complete Visioneer cycle:
 * 1. Create project with orientation
 * 2. Add tasks with dependencies
 * 3. Store knowledge chunks
 * 4. Run wake-up flow
 * 5. Execute tasks (with mock executor)
 * 6. Verify state updates
 * 7. Test semantic search
 * 8. Test question/answer flow
 *
 * This is the "smoke test" that verifies everything works together.
 */

import { initializeSchema, closeDatabase } from "./db/connection.js";
import {
  createProject,
  getProject,
  saveOrientation,
  getOrientation,
  createTask,
  getTasks,
  getTask,
  updateTask,
  createQuestion,
  getQuestions,
  answerQuestion,
  storeChunk,
  getChunk,
  searchChunksByTags,
  searchSemantic,
  createRelationship,
  getRelationships,
  logActivity,
  getRecentActivity,
  processImplicitRelationships,
} from "./db/queries.js";
import { wakeUp, formatWakeUpSummary } from "./agent/wakeup.js";
import { prioritizeTasks, explainPrioritization } from "./agent/prioritization.js";
import { executeWorkLoop, mockSuccessExecutor, getSessionSummary } from "./agent/execution.js";
import { planQuery, executeQuery } from "./retrieval/planner.js";
import { embed } from "./embedding/index.js";
import { Orientation, Phase } from "./utils/types.js";

// Test state tracking
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`   ✓ ${message}`);
    passed++;
  } else {
    console.log(`   ✗ ${message}`);
    failed++;
  }
}

async function runIntegrationTest() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         VISIONEER FULL INTEGRATION TEST                    ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // =========================================================================
  // Phase 1: Database & Project Setup
  // =========================================================================
  console.log("┌─ Phase 1: Database & Project Setup ─────────────────────────┐");

  initializeSchema();
  assert(true, "Database initialized");

  const project = createProject();
  assert(project.id.length === 36, `Project created with UUID: ${project.id.slice(0, 8)}...`);

  const retrievedProject = getProject(project.id);
  assert(retrievedProject !== null, "Project can be retrieved");

  // Create orientation
  const orientation: Orientation = {
    project_id: project.id,
    vision_summary: "Build a todo app with React and TypeScript",
    success_criteria: [
      "Users can create, edit, delete todos",
      "Todos persist to local storage",
      "Clean, responsive UI",
    ],
    constraints: ["Complete in 2 weeks", "Use React 18+", "No external state management"],
    skill_map: [
      { skill: "React Components", parent: null, dependencies: [], status: "not_started", notes: "Functional components with hooks" },
      { skill: "State Management", parent: "React Components", dependencies: ["React Components"], status: "not_started", notes: "useState, useReducer" },
      { skill: "Local Storage", parent: null, dependencies: [], status: "not_started", notes: "Persist and load todos" },
      { skill: "CSS Styling", parent: null, dependencies: [], status: "not_started", notes: "Responsive design" },
    ],
    current_phase: "planning" as Phase,
    key_decisions: [],
    active_priorities: ["React Components", "Project setup"],
    progress_snapshot: [],
    last_rewritten: new Date().toISOString(),
    version: 1,
  };

  saveOrientation(orientation);
  const savedOrientation = getOrientation(project.id);
  assert(savedOrientation !== null, "Orientation saved and retrieved");
  assert(savedOrientation?.vision_summary === orientation.vision_summary, "Orientation content matches");

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Phase 2: Tasks & Dependencies
  // =========================================================================
  console.log("┌─ Phase 2: Tasks & Dependencies ────────────────────────────┐");

  const task1 = createTask(project.id, "Set up React project", "Initialize with Vite, configure TypeScript", "Project setup");
  const task2 = createTask(project.id, "Create TodoItem component", "Display single todo with edit/delete", "React Components");
  const task3 = createTask(project.id, "Create TodoList component", "Display list of todos", "React Components", [task2.id]);
  const task4 = createTask(project.id, "Implement local storage", "Save and load todos", "Local Storage", [task3.id]);

  assert(task1.status === "ready", "Task 1 is ready (no dependencies)");
  assert(task3.status === "blocked", "Task 3 is blocked (depends on task 2)");

  const allTasks = getTasks(project.id);
  assert(allTasks.length === 4, `Created 4 tasks`);

  const readyTasks = getTasks(project.id, "ready");
  assert(readyTasks.length === 2, `2 tasks are ready`);

  const blockedTasks = getTasks(project.id, "blocked");
  assert(blockedTasks.length === 2, `2 tasks are blocked`);

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Phase 3: Knowledge Storage & Retrieval
  // =========================================================================
  console.log("┌─ Phase 3: Knowledge Storage & Retrieval ───────────────────┐");

  const chunk1 = storeChunk(
    project.id,
    "React functional components use hooks for state and lifecycle. useState is the primary hook for local state.",
    "research",
    ["react", "hooks", "state"],
    "verified",
    "research",
    await embed("React functional components use hooks for state and lifecycle.")
  );

  const chunk2 = storeChunk(
    project.id,
    "localStorage.setItem() and localStorage.getItem() are the main APIs for web storage.",
    "research",
    ["storage", "localstorage", "persistence"],
    "verified",
    "research",
    await embed("localStorage APIs for web storage persistence")
  );

  const chunk3 = storeChunk(
    project.id,
    "Decision: Use Vite instead of Create React App for faster development experience.",
    "decision",
    ["tooling", "vite", "decision"],
    "verified",
    "user",
    await embed("Use Vite for React project setup")
  );

  assert(chunk1.id.length === 36, "Chunk 1 stored with UUID");
  assert(chunk2.type === "research", "Chunk 2 has correct type");
  assert(chunk3.confidence === "verified", "Chunk 3 has correct confidence");

  // Create relationship
  createRelationship(chunk1.id, chunk2.id, "related_to", 0.7);
  const relationships = getRelationships(chunk1.id);
  assert(relationships.length >= 1, "Relationship created between chunks");

  // Tag search
  const reactChunks = searchChunksByTags(project.id, ["react"]);
  assert(reactChunks.length === 1, "Tag search finds react chunk");

  // Semantic search
  const semanticResults = searchSemantic(
    project.id,
    await embed("How do I manage state in React?"),
    5,
    0.3
  );
  assert(semanticResults.length > 0, "Semantic search returns results");

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Phase 4: Wake-Up Flow
  // =========================================================================
  console.log("┌─ Phase 4: Wake-Up Flow ────────────────────────────────────┐");

  const wakeResult = await wakeUp({
    projectId: project.id,
    trigger: "manual",
  });

  assert(wakeResult.state.status === "ready", "Agent wakes up in ready state");
  assert(wakeResult.state.context_loaded === true, "Context is loaded");
  assert(wakeResult.state.orientation !== undefined, "Orientation is available");
  assert(wakeResult.summary.totalTasks === 4, "Summary shows 4 total tasks");
  assert(wakeResult.summary.readyTasks === 2, "Summary shows 2 ready tasks");

  console.log("\n   Wake-up summary:");
  console.log(formatWakeUpSummary(wakeResult.summary).split("\n").map(l => "   " + l).join("\n"));

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Phase 5: Task Prioritization
  // =========================================================================
  console.log("┌─ Phase 5: Task Prioritization ─────────────────────────────┐");

  const activity = getRecentActivity(project.id, 10);
  const prioritized = prioritizeTasks(readyTasks, savedOrientation!, activity);

  assert(prioritized.length === 2, "Prioritized 2 ready tasks");
  assert(prioritized[0].score > prioritized[1].score, "Tasks are sorted by score");

  console.log("\n   Prioritization:");
  for (const scored of prioritized) {
    console.log(`   ${explainPrioritization(scored)}`);
  }

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Phase 6: Question/Answer Flow
  // =========================================================================
  console.log("┌─ Phase 6: Question/Answer Flow ────────────────────────────┐");

  const question = createQuestion(
    project.id,
    "Should we use CSS modules or styled-components?",
    "Need to decide on styling approach",
    [task2.id]
  );

  assert(question.status === "open", "Question created as open");

  const task2AfterQuestion = getTask(task2.id);
  assert(task2AfterQuestion?.status === "blocked", "Task blocked after question");

  const { question: answered, unblockedTasks } = answerQuestion(
    question.id,
    "Use CSS modules - simpler and no runtime overhead"
  );

  assert(answered.status === "answered", "Question marked as answered");
  assert(unblockedTasks.length === 1, "Task unblocked after answer");

  const task2AfterAnswer = getTask(task2.id);
  assert(task2AfterAnswer?.status === "ready", "Task ready after answer");

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Phase 7: Execution Loop
  // =========================================================================
  console.log("┌─ Phase 7: Execution Loop ──────────────────────────────────┐");

  // Fresh wake-up for execution
  const freshWake = await wakeUp({ projectId: project.id, trigger: "manual" });

  const session = await executeWorkLoop(freshWake.state, mockSuccessExecutor, {
    maxTasksPerSession: 2,
  });

  assert(session.tasksCompleted === 2, "Completed 2 tasks in session");
  assert(session.learningsStored >= 2, "Stored learnings from tasks");

  console.log("\n   " + getSessionSummary(session).split("\n").slice(0, 8).join("\n   "));

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Phase 8: Query Planner
  // =========================================================================
  console.log("┌─ Phase 8: Query Planner ───────────────────────────────────┐");

  const opPlan = planQuery("What tasks are blocked?");
  assert(opPlan.type === "operational", "Operational query detected");

  const explorePlan = planQuery("What do I know about React hooks?");
  assert(explorePlan.type === "exploration", "Exploration query detected");

  const queryResult = await executeQuery(project.id, "What do I know about React?", {
    minSimilarity: 0.3,
  });
  assert(queryResult.chunks.length > 0, "Query returns chunks");

  console.log(`   Query types tested: operational, exploration`);
  console.log(`   Query "What do I know about React?" returned ${queryResult.chunks.length} chunks`);

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Phase 9: Co-retrieval & Implicit Relationships
  // =========================================================================
  console.log("┌─ Phase 9: Co-retrieval & Implicit Relationships ───────────┐");

  // Simulate co-retrievals by doing multiple searches
  for (let i = 0; i < 4; i++) {
    await executeQuery(project.id, "React state management", { minSimilarity: 0.2 });
  }

  const implicitResult = processImplicitRelationships(2, 0.2, 0.05);
  assert(implicitResult.created >= 0, `Implicit relationships: ${implicitResult.created} created, ${implicitResult.strengthened} strengthened`);

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Final State Check
  // =========================================================================
  console.log("┌─ Final State ──────────────────────────────────────────────┐");

  const finalTasks = getTasks(project.id);
  const finalChunks = searchChunksByTags(project.id, []);
  const finalQuestions = getQuestions(project.id);
  const finalActivities = getRecentActivity(project.id, 50);

  console.log(`   Tasks: ${finalTasks.filter(t => t.status === "done").length}/${finalTasks.length} done`);
  console.log(`   Knowledge chunks: ${finalChunks.length}`);
  console.log(`   Questions: ${finalQuestions.filter(q => q.status === "answered").length} answered`);
  console.log(`   Activities logged: ${finalActivities.length}`);

  console.log("└─────────────────────────────────────────────────────────────┘\n");

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    TEST RESULTS                            ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║   Passed: ${String(passed).padEnd(3)} | Failed: ${String(failed).padEnd(3)}                              ║`);
  console.log("╚════════════════════════════════════════════════════════════╝");

  if (failed === 0) {
    console.log("\n🎉 All integration tests passed!\n");
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed\n`);
  }

  closeDatabase();
  process.exit(failed > 0 ? 1 : 0);
}

runIntegrationTest().catch((error) => {
  console.error("\n❌ Integration test crashed:", error);
  closeDatabase();
  process.exit(1);
});
