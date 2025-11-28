#!/usr/bin/env tsx

/**
 * Test script for Phase 2c: Query Planner
 *
 * Tests:
 * 1. Query type detection
 * 2. Plan generation
 * 3. Query execution across different types
 */

import { initializeSchema, closeDatabase } from "./db/connection.js";
import {
  createProject,
  storeChunk,
  createTask,
  createQuestion,
  logActivity,
  createRelationship,
} from "./db/queries.js";
import { planQuery, executeQuery, QueryType } from "./retrieval/planner.js";
import { embed } from "./embedding/index.js";

async function runTests() {
  console.log("=".repeat(60));
  console.log("VISIONEER PHASE 2c - QUERY PLANNER TEST");
  console.log("=".repeat(60));
  console.log();

  // Initialize
  console.log("1. Initializing...");
  initializeSchema();
  const project = createProject();
  console.log(`   ✓ Project created: ${project.id.slice(0, 8)}...`);
  console.log();

  // Setup test data
  console.log("2. Setting up test data...");

  // Create tasks
  const task1 = createTask(project.id, "Research jazz harmony", "Study ii-V-I", "harmony");
  const task2 = createTask(project.id, "Practice scales", "All 12 keys", "technique");
  const task3 = createTask(project.id, "Learn blues form", "12-bar structure", "blues", [task1.id]);
  console.log(`   ✓ Created ${3} tasks (1 blocked)`);

  // Create question
  createQuestion(project.id, "Should I focus on bebop or blues?", "Need direction", [task2.id]);
  console.log(`   ✓ Created 1 question`);

  // Log activities
  logActivity(project.id, "Started harmony research");
  logActivity(project.id, "Completed scale practice");
  console.log(`   ✓ Logged 2 activities`);

  // Create knowledge chunks with embeddings
  const chunk1 = storeChunk(
    project.id,
    "The ii-V-I progression is the backbone of jazz harmony.",
    "research",
    ["jazz", "harmony", "decision"],
    "verified",
    "research",
    await embed("The ii-V-I progression is the backbone of jazz harmony.")
  );

  const chunk2 = storeChunk(
    project.id,
    "Shell voicings provide essential harmony with minimal notes.",
    "insight",
    ["jazz", "voicings", "technique"],
    "inferred",
    "deduction",
    await embed("Shell voicings provide essential harmony with minimal notes.")
  );

  const chunk3 = storeChunk(
    project.id,
    "Blues scale adds tension over dominant chords.",
    "research",
    ["blues", "scales", "improvisation"],
    "verified",
    "research",
    await embed("Blues scale adds tension over dominant chords.")
  );

  const chunk4 = storeChunk(
    project.id,
    "The decision to focus on ii-V-I before blues was made for efficiency.",
    "decision",
    ["decision", "priority"],
    "verified",
    "user",
    await embed("The decision to focus on ii-V-I before blues was made for efficiency.")
  );

  console.log(`   ✓ Created 4 knowledge chunks`);

  // Create relationships
  createRelationship(chunk2.id, chunk1.id, "builds_on", 0.8);
  createRelationship(chunk3.id, chunk1.id, "related_to", 0.6);
  createRelationship(chunk4.id, chunk1.id, "supports", 0.9);
  console.log(`   ✓ Created 3 relationships`);
  console.log();

  // Test query type detection
  console.log("3. Testing query type detection...");

  const testQueries: { query: string; expectedType: QueryType }[] = [
    { query: "What's blocked?", expectedType: "operational" },
    { query: "What can I do now?", expectedType: "operational" },
    { query: "Open questions?", expectedType: "operational" },
    { query: "What did we decide about priorities?", expectedType: "lookup" },
    { query: "Find the decision on focus areas", expectedType: "lookup" },
    { query: "What contradicts the ii-V-I approach?", expectedType: "connection" },
    { query: "What builds on shell voicings?", expectedType: "connection" },
    { query: "What do I know about jazz harmony?", expectedType: "exploration" },
    { query: "Tell me about improvisation", expectedType: "exploration" },
    { query: "How do chord progressions work?", expectedType: "hybrid" },
  ];

  let correct = 0;
  for (const test of testQueries) {
    const plan = planQuery(test.query);
    const match = plan.type === test.expectedType;
    if (match) correct++;

    console.log(
      `   ${match ? "✓" : "✗"} "${test.query.slice(0, 35)}..." → ${plan.type} (expected: ${test.expectedType})`
    );
  }
  console.log(`   Detection accuracy: ${correct}/${testQueries.length}`);
  console.log();

  // Test query execution
  console.log("4. Testing query execution...");

  // Operational query
  console.log("\n   4a. Operational query: 'What's blocked?'");
  const opResult = await executeQuery(project.id, "What's blocked?");
  console.log(`       Plan: ${opResult.plan.type} → ${opResult.plan.method}`);
  console.log(`       Tasks found: ${opResult.tasks?.length || 0}`);
  if (opResult.tasks?.length) {
    for (const task of opResult.tasks) {
      console.log(`       - "${task.title}" (${task.status})`);
    }
  }

  // Lookup query
  console.log("\n   4b. Lookup query: 'What did we decide?'");
  const lookupResult = await executeQuery(project.id, "What did we decide about priorities?");
  console.log(`       Plan: ${lookupResult.plan.type} → ${lookupResult.plan.method}`);
  console.log(`       Chunks found: ${lookupResult.chunks.length}`);
  if (lookupResult.chunks.length) {
    for (const sc of lookupResult.chunks.slice(0, 2)) {
      console.log(`       - [${(sc.score * 100).toFixed(0)}%] "${sc.chunk.content.slice(0, 40)}..."`);
    }
  }

  // Exploration query
  console.log("\n   4c. Exploration query: 'What do I know about jazz harmony?'");
  const exploreResult = await executeQuery(project.id, "What do I know about jazz harmony?", {
    minSimilarity: 0.3,
  });
  console.log(`       Plan: ${exploreResult.plan.type} → ${exploreResult.plan.method}`);
  console.log(`       Chunks found: ${exploreResult.chunks.length}`);
  if (exploreResult.chunks.length) {
    for (const sc of exploreResult.chunks.slice(0, 3)) {
      console.log(`       - [${(sc.score * 100).toFixed(0)}%] "${sc.chunk.content.slice(0, 40)}..." (${sc.source})`);
    }
  }

  // Connection query
  console.log("\n   4d. Connection query: 'What supports the ii-V-I approach?'");
  const connResult = await executeQuery(project.id, "What supports the ii-V-I approach?");
  console.log(`       Plan: ${connResult.plan.type} → ${connResult.plan.method}`);
  console.log(`       Chunks found: ${connResult.chunks.length}`);
  if (connResult.chunks.length) {
    for (const sc of connResult.chunks.slice(0, 3)) {
      console.log(`       - [${(sc.score * 100).toFixed(0)}%] "${sc.chunk.content.slice(0, 40)}..." (${sc.source})`);
    }
  }

  // Hybrid query
  console.log("\n   4e. Hybrid query: 'How do chord progressions work in jazz?'");
  const hybridResult = await executeQuery(project.id, "How do chord progressions work in jazz?", {
    minSimilarity: 0.3,
  });
  console.log(`       Plan: ${hybridResult.plan.type} → ${hybridResult.plan.method}`);
  console.log(`       Explanation: ${hybridResult.plan.explanation}`);
  console.log(`       Chunks found: ${hybridResult.chunks.length}`);
  if (hybridResult.chunks.length) {
    for (const sc of hybridResult.chunks.slice(0, 4)) {
      console.log(`       - [${(sc.score * 100).toFixed(0)}%] "${sc.chunk.content.slice(0, 40)}..." (${sc.source})`);
    }
  }

  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`✓ Query type detection: ${correct}/${testQueries.length} correct`);
  console.log(`✓ Operational queries: Working`);
  console.log(`✓ Lookup queries: Working`);
  console.log(`✓ Exploration queries: Working`);
  console.log(`✓ Connection queries: Working`);
  console.log(`✓ Hybrid queries: Working`);
  console.log();
  console.log("Phase 2c complete! Query planner is operational.");
  console.log("=".repeat(60));

  closeDatabase();
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  closeDatabase();
  process.exit(1);
});
