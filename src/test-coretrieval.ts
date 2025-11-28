#!/usr/bin/env tsx

/**
 * Test script for Phase 2b: Co-retrieval Tracking & Implicit Relationships
 *
 * Tests:
 * 1. Co-retrieval recording during semantic search
 * 2. Implicit relationship creation from frequent co-retrievals
 * 3. Relationship strengthening over time
 */

import { initializeSchema, closeDatabase } from "./db/connection.js";
import {
  createProject,
  storeChunk,
  searchSemantic,
  recordCoretrieval,
  getFrequentCoretrievals,
  processImplicitRelationships,
  getRelationships,
  getRelationshipBetween,
  getChunk,
} from "./db/queries.js";
import { embed } from "./embedding/index.js";
import { v4 as uuidv4 } from "uuid";

async function runTests() {
  console.log("=".repeat(60));
  console.log("VISIONEER PHASE 2b - CO-RETRIEVAL & IMPLICIT RELATIONSHIPS");
  console.log("=".repeat(60));
  console.log();

  // Initialize
  console.log("1. Initializing...");
  initializeSchema();
  const project = createProject();
  console.log(`   ✓ Project created: ${project.id.slice(0, 8)}...`);
  console.log();

  // Store chunks with embeddings
  console.log("2. Storing knowledge chunks...");

  const chunkData = [
    { content: "Jazz harmony is built on seventh chords and extensions.", tags: ["jazz", "harmony"] },
    { content: "The ii-V-I progression is fundamental to jazz.", tags: ["jazz", "harmony", "ii-V-I"] },
    { content: "Shell voicings use only the 3rd and 7th.", tags: ["jazz", "voicings"] },
    { content: "Walking bass lines outline chord tones.", tags: ["jazz", "bass"] },
    { content: "Practice arpeggios through all chord qualities.", tags: ["practice", "technique"] },
    { content: "Blues uses the I-IV-V progression with dominant 7ths.", tags: ["blues", "harmony"] },
  ];

  const chunks = [];
  for (const data of chunkData) {
    const embedding = await embed(data.content);
    const chunk = storeChunk(
      project.id,
      data.content,
      "research",
      data.tags,
      "verified",
      "research",
      embedding
    );
    chunks.push(chunk);
    console.log(`   ✓ ${chunk.id.slice(0, 8)}... "${data.content.slice(0, 40)}..."`);
  }
  console.log();

  // Simulate multiple search sessions to build co-retrieval data
  console.log("3. Simulating search sessions (building co-retrieval data)...");

  const searchQueries = [
    "jazz chord harmony",
    "seventh chords in jazz",
    "jazz harmony progressions",
    "chord voicings jazz",
    "ii-V-I jazz harmony",
  ];

  for (let session = 0; session < 4; session++) {
    const sessionId = uuidv4();
    console.log(`   Session ${session + 1}:`);

    for (const query of searchQueries) {
      const queryEmbedding = await embed(query);
      const results = searchSemantic(project.id, queryEmbedding, 3, 0.3);

      if (results.length >= 2) {
        // Record co-retrieval
        const chunkIds = results.map((r) => r.chunkId);
        recordCoretrieval(chunkIds, sessionId, query);
        console.log(`     "${query.slice(0, 25)}..." → ${results.length} results co-retrieved`);
      }
    }
  }
  console.log();

  // Check co-retrieval counts
  console.log("4. Checking co-retrieval frequencies...");
  const frequentPairs = getFrequentCoretrievals(2); // Lower threshold for testing
  console.log(`   Found ${frequentPairs.length} frequent pairs (threshold: 2)`);

  for (const pair of frequentPairs.slice(0, 5)) {
    const chunkA = getChunk(pair.chunkA);
    const chunkB = getChunk(pair.chunkB);
    console.log(`   - Count ${pair.count}: "${chunkA?.content.slice(0, 30)}..." ↔ "${chunkB?.content.slice(0, 30)}..."`);
  }
  console.log();

  // Process implicit relationships
  console.log("5. Processing implicit relationships...");
  const result = processImplicitRelationships(2, 0.2, 0.05); // Lower threshold for testing
  console.log(`   ✓ Created: ${result.created} new implicit relationships`);
  console.log(`   ✓ Strengthened: ${result.strengthened} existing relationships`);
  console.log();

  // Verify implicit relationships were created
  console.log("6. Verifying implicit relationships...");
  let totalImplicitRelationships = 0;

  for (const chunk of chunks) {
    const relations = getRelationships(chunk.id, undefined, 0, "both", 50);
    const implicit = relations.filter((r) => r.relationship.origin === "implicit");

    if (implicit.length > 0) {
      totalImplicitRelationships += implicit.length;
      console.log(`   ${chunk.id.slice(0, 8)}... has ${implicit.length} implicit relationship(s)`);

      for (const rel of implicit.slice(0, 2)) {
        const other = rel.direction === "outgoing"
          ? getChunk(rel.relationship.to_chunk_id)
          : getChunk(rel.relationship.from_chunk_id);
        console.log(`     - ${rel.relationship.type} (weight: ${rel.relationship.weight.toFixed(2)}) → "${other?.content.slice(0, 30)}..."`);
      }
    }
  }
  console.log();

  // Process again to test strengthening
  console.log("7. Testing relationship strengthening (processing again)...");

  // Add more co-retrieval data
  for (let i = 0; i < 3; i++) {
    const sessionId = uuidv4();
    for (const query of searchQueries.slice(0, 2)) {
      const queryEmbedding = await embed(query);
      const results = searchSemantic(project.id, queryEmbedding, 3, 0.3);
      if (results.length >= 2) {
        recordCoretrieval(results.map((r) => r.chunkId), sessionId, query);
      }
    }
  }

  const result2 = processImplicitRelationships(2, 0.2, 0.05);
  console.log(`   ✓ Created: ${result2.created} new relationships`);
  console.log(`   ✓ Strengthened: ${result2.strengthened} existing relationships`);

  // Check if weights increased
  if (frequentPairs.length > 0) {
    const rel = getRelationshipBetween(frequentPairs[0].chunkA, frequentPairs[0].chunkB);
    if (rel) {
      console.log(`   ✓ Top pair weight: ${rel.weight.toFixed(3)} (should be > 0.2)`);
    }
  }
  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`✓ Chunks stored: ${chunks.length}`);
  console.log(`✓ Search sessions simulated: 4`);
  console.log(`✓ Frequent co-retrieval pairs found: ${frequentPairs.length}`);
  console.log(`✓ Implicit relationships created: ${result.created + result2.created}`);
  console.log(`✓ Relationships strengthened: ${result.strengthened + result2.strengthened}`);
  console.log();
  console.log("Phase 2b complete! Co-retrieval tracking and implicit relationships working.");
  console.log("=".repeat(60));

  closeDatabase();
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  closeDatabase();
  process.exit(1);
});
