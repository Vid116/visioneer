#!/usr/bin/env tsx

/**
 * Analyze CLI
 *
 * Applies Visioneer's learned knowledge to analyze chess positions.
 * Uses semantic search to find relevant knowledge, then Claude SDK to synthesize analysis.
 * Now with relationship tracking and expansion!
 *
 * Usage: npm run analyze "1.e4 e6 2.d4 d5 3.e5"
 */

import { randomUUID } from "crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  listProjects,
  getChunk,
  recordCoretrieval,
  expandWithRelationships,
} from "../db/queries.js";
import { searchSimilar, loadVectorIndex } from "../db/vector-store.js";
import { embed } from "../embedding/index.js";

interface PositionAnalysis {
  recommendedMove: { move: string; explanation: string };
  strategicIdeas: string[];
  watchOutFor: string[];
  openingName: string;
  confidence: string;
}

interface ChunkResult {
  id: string;
  content: string;
  type: string;
  confidence: string;
  similarity: number;
}

async function main() {
  const moves = process.argv.slice(2).join(" ");

  if (!moves) {
    console.log("Usage: npm run analyze \"1.e4 e6 2.d4 d5 3.e5\"");
    console.log("       npm run analyze \"position after 3.e5 in French\"");
    console.log();
    console.log("Examples:");
    console.log("  npm run analyze \"1.e4 e6 2.d4 d5 3.e5\"       # Advance Variation");
    console.log("  npm run analyze \"1.e4 e6 2.d4 d5 3.Nc3 Bb4\"  # Winawer");
    console.log("  npm run analyze \"French Defense c5 break\"    # Concept query");
    process.exit(1);
  }

  // Initialize database
  initializeSchema();
  loadVectorIndex();

  // Get project
  const projects = listProjects();
  if (projects.length === 0) {
    console.log("No projects found. Create a chess learning goal first.");
    closeDatabase();
    process.exit(1);
  }

  const projectId = projects[0].id;

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                 VISIONEER POSITION ANALYSIS                ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`Position: ${moves}`);
  console.log();

  try {
    // 1. Build search queries from the position
    const searchQueries = buildSearchQueries(moves);
    console.log(`Searching knowledge with ${searchQueries.length} queries...`);

    // 2. Search knowledge for each query
    const allChunks: ChunkResult[] = [];
    const allChunkIds: string[] = [];

    for (const searchQuery of searchQueries) {
      const queryEmbedding = await embed(searchQuery);
      const results = searchSimilar(projectId, queryEmbedding, 8, 0.45);

      for (const result of results) {
        const chunk = getChunk(result.chunkId);
        if (chunk) {
          allChunks.push({
            id: chunk.id,
            content: chunk.content,
            type: chunk.type,
            confidence: chunk.confidence,
            similarity: result.similarity,
          });
          allChunkIds.push(chunk.id);
        }
      }
    }

    // 3. Deduplicate and sort by relevance
    const uniqueChunks = deduplicateChunks(allChunks);
    const uniqueIds = uniqueChunks.map(c => c.id);

    // Track co-retrieval for relationship learning
    if (uniqueIds.length >= 2) {
      const sessionId = randomUUID();
      recordCoretrieval(uniqueIds, sessionId, moves);
    }

    // Expand with relationships
    const relatedChunks = expandWithRelationships(uniqueIds, projectId, 0.3, 1);
    for (const relChunk of relatedChunks) {
      if (!uniqueIds.includes(relChunk.id)) {
        uniqueChunks.push({
          id: relChunk.id,
          content: relChunk.content,
          type: relChunk.type,
          confidence: relChunk.confidence,
          similarity: relChunk._relationshipWeight || 0.5,
        });
      }
    }

    console.log(`Found ${uniqueChunks.length} relevant knowledge chunks.`);
    if (relatedChunks.length > 0) {
      console.log(`(includes ${relatedChunks.length} via knowledge graph)`);
    }
    console.log();

    if (uniqueChunks.length === 0) {
      console.log("─".repeat(60));
      console.log();
      console.log("No relevant knowledge found for this position.");
      console.log("Try running more research cycles on this opening.");
      console.log();
      console.log("Tip: Set a goal like:");
      console.log("  npm run goal \"Learn the basics of the French Defense\"");
      closeDatabase();
      return;
    }

    // 4. Use Claude SDK to analyze position using the knowledge
    console.log("Analyzing with Claude...");
    const analysis = await analyzePosition(moves, uniqueChunks);

    // 5. Display results
    displayAnalysis(moves, analysis, uniqueChunks);

  } catch (error) {
    console.error("Error analyzing position:", error);
  }

  closeDatabase();
}

function buildSearchQueries(moves: string): string[] {
  const queries: string[] = [moves];

  // Detect opening type
  const opening = extractOpening(moves);
  if (opening) {
    queries.push(opening);
  }

  // Add conceptual queries based on position characteristics
  if (moves.includes("e5")) {
    queries.push("Advance Variation plans");
    queries.push("c5 break French Defense");
  }
  if (moves.includes("Nc3") && moves.includes("Bb4")) {
    queries.push("Winawer Variation");
    queries.push("doubled pawns French");
  }
  if (moves.includes("exd5")) {
    queries.push("Exchange Variation French");
  }
  if (moves.includes("c5")) {
    queries.push("c5 break response");
    queries.push("pawn chain attack");
  }

  // Add generic strategic queries
  queries.push("best moves French Defense");
  queries.push("strategic ideas French");
  queries.push("traps French Defense");

  return [...new Set(queries)]; // Dedupe
}

function extractOpening(moves: string): string {
  const lower = moves.toLowerCase();

  if (lower.includes("e6") && lower.includes("d5")) {
    if (lower.includes("e5")) return "French Defense Advance Variation";
    if (lower.includes("nc3") && lower.includes("bb4")) return "French Defense Winawer Variation";
    if (lower.includes("exd5")) return "French Defense Exchange Variation";
    if (lower.includes("nc3") && lower.includes("nf6")) return "French Defense Classical Variation";
    return "French Defense";
  }

  if (lower.includes("e4") && lower.includes("e5")) {
    return "Open Game";
  }

  return "";
}

function deduplicateChunks(chunks: ChunkResult[]): ChunkResult[] {
  const seen = new Set<string>();
  return chunks
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .sort((a, b) => b.similarity - a.similarity);
}

async function analyzePosition(
  moves: string,
  chunks: ChunkResult[]
): Promise<PositionAnalysis> {
  const knowledgeContext = chunks
    .slice(0, 15) // Top 15 most relevant
    .map((c) => `[${c.confidence}, ${(c.similarity * 100).toFixed(0)}% match] ${c.content}`)
    .join("\n\n---\n\n");

  const prompt = `You are a chess coach analyzing a position. Use ONLY the knowledge provided below - do not add outside information that isn't in the knowledge base.

## Position to Analyze
${moves}

## Your Knowledge Base (from prior research)
${knowledgeContext}

## Task
Based strictly on the knowledge above, provide analysis. If the knowledge doesn't cover something, say so honestly.

Respond with ONLY valid JSON (no markdown code blocks):

{
  "recommendedMove": {
    "move": "the best move like c5 or Nc6",
    "explanation": "Brief explanation based on knowledge"
  },
  "strategicIdeas": [
    "Key strategic theme 1 from knowledge...",
    "Key strategic theme 2 from knowledge..."
  ],
  "watchOutFor": [
    "Any traps or warnings from knowledge..."
  ],
  "openingName": "Name of opening/variation if known",
  "confidence": "high/medium/low based on how much relevant knowledge you found"
}`;

  const result = query({
    prompt,
    options: {
      maxTurns: 1,
      allowedTools: [],
    },
  });

  let responseText = "";

  for await (const message of result) {
    if (message.type === "result") {
      const msg = message as Record<string, unknown>;
      responseText = msg.result as string;
    }
  }

  if (!responseText) {
    throw new Error("No analysis result received");
  }

  try {
    // Clean potential markdown code blocks
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "");
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse analysis JSON, returning raw response");
    return {
      recommendedMove: { move: "See below", explanation: responseText },
      strategicIdeas: [],
      watchOutFor: [],
      openingName: "Unknown",
      confidence: "low",
    };
  }
}

function displayAnalysis(
  moves: string,
  analysis: PositionAnalysis,
  chunks: ChunkResult[]
) {
  console.log("─".repeat(60));
  console.log();

  // Opening name
  if (analysis.openingName && analysis.openingName !== "Unknown") {
    console.log(`Opening: ${analysis.openingName}`);
    console.log();
  }

  // Recommended move
  console.log("┌─ Recommended Move ──────────────────────────────────────────┐");
  console.log();
  console.log(`  ${analysis.recommendedMove.move}`);
  console.log();
  console.log(`  ${analysis.recommendedMove.explanation}`);
  console.log();
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log();

  // Strategic ideas
  if (analysis.strategicIdeas.length > 0) {
    console.log("┌─ Strategic Ideas ───────────────────────────────────────────┐");
    console.log();
    for (const idea of analysis.strategicIdeas) {
      console.log(`  * ${idea}`);
    }
    console.log();
    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  // Warnings
  if (analysis.watchOutFor.length > 0) {
    console.log("┌─ Watch Out For ─────────────────────────────────────────────┐");
    console.log();
    for (const warning of analysis.watchOutFor) {
      console.log(`  ! ${warning}`);
    }
    console.log();
    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  // Confidence
  const confidenceIcon =
    analysis.confidence === "high" ? "+++" :
    analysis.confidence === "medium" ? "++" : "+";

  console.log(`Analysis confidence: [${confidenceIcon}] ${analysis.confidence}`);
  console.log(`Based on ${chunks.length} knowledge chunks (top match: ${(chunks[0]?.similarity * 100 || 0).toFixed(0)}%)`);
  console.log();
}

main().catch(console.error);
