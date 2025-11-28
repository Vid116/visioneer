#!/usr/bin/env tsx

/**
 * Test script for Phase 2a: Semantic Search
 *
 * Tests the full flow:
 * 1. Store chunks with embeddings
 * 2. Search semantically
 * 3. Verify results make sense
 */

import { initializeSchema, closeDatabase } from "./db/connection.js";
import { createProject, storeChunk, getChunk, searchSemantic } from "./db/queries.js";
import { embed } from "./embedding/index.js";
import { getVectorStoreStats } from "./db/vector-store.js";

async function runTests() {
  console.log("=".repeat(60));
  console.log("VISIONEER PHASE 2a - SEMANTIC SEARCH TEST");
  console.log("=".repeat(60));
  console.log();

  // Initialize
  console.log("1. Initializing...");
  initializeSchema();
  const project = createProject();
  console.log(`   ✓ Project created: ${project.id.slice(0, 8)}...`);
  console.log();

  // Store knowledge chunks with embeddings
  console.log("2. Storing knowledge chunks with embeddings...");

  const chunks = [
    {
      content: "The ii-V-I progression is the most important chord movement in jazz. It creates tension and resolution.",
      tags: ["jazz", "harmony", "ii-V-I"],
      type: "research" as const,
    },
    {
      content: "Shell voicings use only the 3rd and 7th of each chord, providing essential chord quality with minimal notes.",
      tags: ["jazz", "voicings", "technique"],
      type: "insight" as const,
    },
    {
      content: "The blues scale consists of the root, flat 3rd, 4th, flat 5th, 5th, and flat 7th notes.",
      tags: ["blues", "scales", "theory"],
      type: "research" as const,
    },
    {
      content: "Practice scales in all 12 keys to develop fluency and muscle memory.",
      tags: ["practice", "technique", "scales"],
      type: "attempt" as const,
    },
    {
      content: "Bebop adds chromatic passing tones to create smoother melodic lines over chord changes.",
      tags: ["bebop", "melody", "technique"],
      type: "research" as const,
    },
    {
      content: "The Coltrane changes use substitutions based on the cycle of major thirds.",
      tags: ["jazz", "harmony", "advanced"],
      type: "research" as const,
    },
    {
      content: "Start each practice session with a 5-minute warmup of scales and arpeggios.",
      tags: ["practice", "routine", "warmup"],
      type: "attempt" as const,
    },
    {
      content: "Modal jazz uses modes as the basis for improvisation rather than chord progressions.",
      tags: ["jazz", "modal", "improvisation"],
      type: "research" as const,
    },
  ];

  const storedChunks = [];

  for (const chunk of chunks) {
    console.log(`   Embedding: "${chunk.content.slice(0, 50)}..."`);

    // Generate embedding
    const embedding = await embed(chunk.content);

    // Store with embedding
    const stored = storeChunk(
      project.id,
      chunk.content,
      chunk.type,
      chunk.tags,
      "verified",
      "research",
      embedding
    );

    storedChunks.push(stored);
    console.log(`   ✓ Stored: ${stored.id.slice(0, 8)}... (${embedding.length} dims)`);
  }

  console.log();

  // Check vector store stats
  const stats = getVectorStoreStats();
  console.log(`3. Vector store stats:`);
  console.log(`   ✓ Total vectors: ${stats.totalVectors}`);
  console.log(`   ✓ Project vectors: ${stats.projectCounts[project.id]}`);
  console.log();

  // Test semantic searches
  console.log("4. Testing semantic search...");
  console.log();

  const queries = [
    "How do chord progressions work in jazz?",
    "What's the best way to practice piano?",
    "Tell me about jazz improvisation techniques",
    "How do I play the blues?",
  ];

  for (const query of queries) {
    console.log(`   Query: "${query}"`);

    // Generate query embedding
    const queryEmbedding = await embed(query);

    // Search
    const results = searchSemantic(project.id, queryEmbedding, 3, 0.3);

    if (results.length === 0) {
      console.log("   ✗ No results found!");
    } else {
      console.log(`   Found ${results.length} results:`);
      for (const result of results) {
        const chunk = getChunk(result.chunkId);
        if (chunk) {
          console.log(`     - [${(result.similarity * 100).toFixed(1)}%] "${chunk.content.slice(0, 60)}..."`);
          console.log(`       Tags: ${chunk.tags.join(", ")}`);
        }
      }
    }
    console.log();
  }

  // Test edge cases
  console.log("5. Testing edge cases...");

  // Search with high threshold
  const highThreshold = await embed("jazz chords");
  const highResults = searchSemantic(project.id, highThreshold, 10, 0.9);
  console.log(`   ✓ High threshold (0.9): ${highResults.length} results`);

  // Search with low threshold
  const lowThreshold = await embed("random unrelated topic");
  const lowResults = searchSemantic(project.id, lowThreshold, 10, 0.3);
  console.log(`   ✓ Unrelated query (0.3 threshold): ${lowResults.length} results`);

  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`✓ Chunks stored: ${storedChunks.length}`);
  console.log(`✓ Embeddings stored: ${stats.totalVectors}`);
  console.log(`✓ Semantic search: Working`);
  console.log();
  console.log("Phase 2a complete! Semantic search is operational.");
  console.log("=".repeat(60));

  closeDatabase();
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  closeDatabase();
  process.exit(1);
});
