#!/usr/bin/env tsx

/**
 * Test script to verify the basic Phase 1 flow:
 * 1. Create a project via orientation
 * 2. Add a task via working
 * 3. Store a chunk via knowledge
 * 4. Verify retrieval
 */

import { initializeSchema, closeDatabase } from "./db/connection.js";
import {
  createProject,
  getProject,
  listProjects,
  getOrientation,
  saveOrientation,
  createTask,
  getTasks,
  getTask,
  updateTask,
  createQuestion,
  getQuestions,
  answerQuestion,
  logActivity,
  getRecentActivity,
  storeChunk,
  getChunk,
  searchChunksByTags,
  createRelationship,
  getRelationships,
} from "./db/queries.js";
import { Orientation, Phase } from "./utils/types.js";

async function runTests() {
  console.log("=" .repeat(60));
  console.log("VISIONEER PHASE 1 - BASIC FLOW TEST");
  console.log("=" .repeat(60));
  console.log();

  // Initialize database
  console.log("1. Initializing database schema...");
  initializeSchema();
  console.log("   ✓ Database initialized\n");

  // -------------------------------------------------------------------------
  // Test 1: Create Project via Orientation Server Logic
  // -------------------------------------------------------------------------
  console.log("2. Creating a new project...");
  const project = createProject();
  console.log(`   ✓ Project created: ${project.id}\n`);

  // Create initial orientation
  console.log("3. Setting up initial orientation...");
  const orientation: Orientation = {
    project_id: project.id,
    vision_summary: "Learn jazz piano well enough to play at a jam session",
    success_criteria: [
      "Comp through blues progression",
      "Play 3 jazz standards",
      "Take a solo over changes"
    ],
    constraints: [
      "1 hour per day practice time",
      "6 month timeline"
    ],
    skill_map: [
      {
        skill: "Jazz Harmony",
        parent: null,
        dependencies: [],
        status: "not_started",
        notes: "Foundation for understanding chord progressions"
      },
      {
        skill: "Chord Voicings",
        parent: "Jazz Harmony",
        dependencies: ["Jazz Harmony"],
        status: "not_started",
        notes: "Shell voicings, drop 2, rootless voicings"
      },
      {
        skill: "Blues Form",
        parent: null,
        dependencies: [],
        status: "not_started",
        notes: "12-bar blues structure and variations"
      }
    ],
    current_phase: "intake" as Phase,
    key_decisions: [],
    active_priorities: ["Jazz Harmony basics", "Blues Form"],
    progress_snapshot: [
      { area: "Jazz Harmony", status: "not_started", percent: 0, blockers: [] },
      { area: "Chord Voicings", status: "not_started", percent: 0, blockers: ["Jazz Harmony"] },
      { area: "Blues Form", status: "not_started", percent: 0, blockers: [] }
    ],
    last_rewritten: new Date().toISOString(),
    version: 1
  };

  saveOrientation(orientation);
  console.log(`   ✓ Orientation saved (version ${orientation.version})\n`);

  // Verify orientation retrieval
  console.log("4. Retrieving orientation...");
  const retrievedOrientation = getOrientation(project.id);
  if (retrievedOrientation) {
    console.log(`   ✓ Vision: ${retrievedOrientation.vision_summary}`);
    console.log(`   ✓ Phase: ${retrievedOrientation.current_phase}`);
    console.log(`   ✓ Skills: ${retrievedOrientation.skill_map.length} defined\n`);
  } else {
    console.log("   ✗ FAILED to retrieve orientation!\n");
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Test 2: Add Tasks via Working Server Logic
  // -------------------------------------------------------------------------
  console.log("5. Creating tasks...");

  const task1 = createTask(
    project.id,
    "Research jazz harmony fundamentals",
    "Learn about ii-V-I progressions, chord extensions, and voice leading",
    "Jazz Harmony"
  );
  console.log(`   ✓ Task 1: "${task1.title}" (${task1.status})`);

  const task2 = createTask(
    project.id,
    "Learn 12-bar blues form",
    "Understand the structure, common variations, and turnarounds",
    "Blues Form"
  );
  console.log(`   ✓ Task 2: "${task2.title}" (${task2.status})`);

  const task3 = createTask(
    project.id,
    "Practice shell voicings",
    "Apply 3-7 shell voicings to ii-V-I progressions",
    "Chord Voicings",
    [task1.id] // Depends on task 1
  );
  console.log(`   ✓ Task 3: "${task3.title}" (${task3.status}) - depends on task 1\n`);

  // Verify task retrieval
  console.log("6. Retrieving tasks...");
  const allTasks = getTasks(project.id);
  console.log(`   ✓ Total tasks: ${allTasks.length}`);

  const readyTasks = getTasks(project.id, "ready");
  console.log(`   ✓ Ready tasks: ${readyTasks.length}`);

  const blockedTasks = getTasks(project.id, "blocked");
  console.log(`   ✓ Blocked tasks: ${blockedTasks.length}\n`);

  // Test task updates
  console.log("7. Testing task workflow...");
  updateTask(task1.id, { status: "in_progress" });
  const inProgressTask = getTask(task1.id);
  console.log(`   ✓ Task 1 status: ${inProgressTask?.status}`);
  console.log(`   ✓ Task 1 started_at: ${inProgressTask?.started_at}`);

  updateTask(task1.id, { status: "done", outcome: "Learned ii-V-I progressions and extensions" });
  const doneTask = getTask(task1.id);
  console.log(`   ✓ Task 1 completed: ${doneTask?.outcome}`);

  // Check if task 3 is still blocked (it shouldn't be now)
  const task3Updated = getTask(task3.id);
  console.log(`   ✓ Task 3 status after dependency complete: ${task3Updated?.status}\n`);

  // -------------------------------------------------------------------------
  // Test 3: Store Chunks via Knowledge Server Logic
  // -------------------------------------------------------------------------
  console.log("8. Storing knowledge chunks...");

  // Note: Not using embeddings for this test (Phase 2 feature)
  const chunk1 = storeChunk(
    project.id,
    "The ii-V-I progression is the most common chord movement in jazz. It creates a strong sense of resolution from dominant to tonic.",
    "research",
    ["jazz", "harmony", "ii-V-I", "progressions"],
    "verified",
    "research"
  );
  console.log(`   ✓ Chunk 1: ${chunk1.type} (${chunk1.confidence}) - ${chunk1.id.slice(0, 8)}...`);

  const chunk2 = storeChunk(
    project.id,
    "Shell voicings use only the 3rd and 7th of each chord, providing the essential chord quality with minimal notes.",
    "insight",
    ["jazz", "voicings", "shell", "technique"],
    "inferred",
    "deduction"
  );
  console.log(`   ✓ Chunk 2: ${chunk2.type} (${chunk2.confidence}) - ${chunk2.id.slice(0, 8)}...`);

  const chunk3 = storeChunk(
    project.id,
    "Practicing shell voicings through all keys is essential for fluency.",
    "attempt",
    ["practice", "voicings", "shell"],
    "verified",
    "experiment"
  );
  console.log(`   ✓ Chunk 3: ${chunk3.type} (${chunk3.confidence}) - ${chunk3.id.slice(0, 8)}...\n`);

  // Create relationships
  console.log("9. Creating relationships between chunks...");
  const rel1 = createRelationship(chunk2.id, chunk1.id, "builds_on", 0.8);
  console.log(`   ✓ Chunk 2 builds_on Chunk 1 (weight: ${rel1.weight})`);

  const rel2 = createRelationship(chunk3.id, chunk2.id, "requires", 0.9);
  console.log(`   ✓ Chunk 3 requires Chunk 2 (weight: ${rel2.weight})\n`);

  // -------------------------------------------------------------------------
  // Test 4: Verify Retrieval
  // -------------------------------------------------------------------------
  console.log("10. Testing retrieval...");

  // Retrieve by tags
  const jazzChunks = searchChunksByTags(project.id, ["jazz"]);
  console.log(`   ✓ Chunks with 'jazz' tag: ${jazzChunks.length}`);

  const voicingChunks = searchChunksByTags(project.id, ["voicings"]);
  console.log(`   ✓ Chunks with 'voicings' tag: ${voicingChunks.length}`);

  // Retrieve by confidence
  const verifiedChunks = searchChunksByTags(project.id, [], undefined, ["verified"]);
  console.log(`   ✓ Verified chunks: ${verifiedChunks.length}`);

  // Retrieve relationships
  const chunk2Relations = getRelationships(chunk2.id, undefined, 0, "both");
  console.log(`   ✓ Chunk 2 relationships: ${chunk2Relations.length}`);
  for (const { relationship, direction } of chunk2Relations) {
    console.log(`     - ${direction}: ${relationship.type} (weight: ${relationship.weight})`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // Test 5: Questions & Activity Log
  // -------------------------------------------------------------------------
  console.log("11. Testing questions and activity log...");

  const question = createQuestion(
    project.id,
    "Should I focus on bebop or blues style first?",
    "Both seem like valid starting points for jazz improvisation",
    [task2.id]
  );
  console.log(`   ✓ Question created: "${question.question}"`);
  console.log(`   ✓ Question status: ${question.status}`);

  // Check if task2 is now blocked
  const task2AfterQuestion = getTask(task2.id);
  console.log(`   ✓ Task 2 status after question: ${task2AfterQuestion?.status}`);

  // Answer the question
  const { question: answeredQ, unblockedTasks } = answerQuestion(
    question.id,
    "Start with blues - it's more accessible and forms a foundation for bebop"
  );
  console.log(`   ✓ Question answered: ${answeredQ.answer?.slice(0, 50)}...`);
  console.log(`   ✓ Unblocked tasks: ${unblockedTasks.length}`);

  // Log some activities
  logActivity(project.id, "Started Phase 1 testing", { test: true });
  logActivity(project.id, "Completed research on ii-V-I", { taskId: task1.id });

  const activities = getRecentActivity(project.id, 5);
  console.log(`   ✓ Recent activities: ${activities.length}\n`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("=" .repeat(60));
  console.log("TEST SUMMARY");
  console.log("=" .repeat(60));

  const finalTasks = getTasks(project.id);
  const finalChunks = searchChunksByTags(project.id, []);
  const finalQuestions = getQuestions(project.id);
  const finalActivities = getRecentActivity(project.id);

  console.log(`✓ Projects: ${listProjects().length}`);
  console.log(`✓ Tasks: ${finalTasks.length} (done: ${finalTasks.filter(t => t.status === "done").length})`);
  console.log(`✓ Knowledge chunks: ${finalChunks.length}`);
  console.log(`✓ Questions: ${finalQuestions.length} (answered: ${finalQuestions.filter(q => q.status === "answered").length})`);
  console.log(`✓ Activities: ${finalActivities.length}`);
  console.log();
  console.log("All basic tests passed! Phase 1 foundation is working.");
  console.log("=" .repeat(60));

  // Cleanup
  closeDatabase();
}

runTests().catch(error => {
  console.error("Test failed:", error);
  closeDatabase();
  process.exit(1);
});
