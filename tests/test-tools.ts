/**
 * Quick test of tool implementations
 * Run with: npx tsx tests/test-tools.ts
 */

import "dotenv/config";
import { executeTool } from "../src/agent/tools/executor.js";

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebFetchResult {
  content: string;
  title: string;
}

interface WriteArtifactResult {
  path: string;
  size: number;
}

interface ReadArtifactResult {
  content: string;
}

interface ErrorResult {
  error: string;
}

async function testTools() {
  console.log("Testing tools...\n");

  // Test 1: Web search (requires SERPER_API_KEY)
  console.log("1. Testing web_search...");
  try {
    const searchResult = await executeTool(
      "web_search",
      { query: "what is checkmate in chess", max_results: 3 },
      "test-project"
    );

    if ("error" in (searchResult as ErrorResult)) {
      console.log("   ✗ Web search failed:", (searchResult as ErrorResult).error);
    } else {
      console.log("   ✓ Web search works");
      console.log(
        "   Results:",
        JSON.stringify(searchResult, null, 2).slice(0, 500)
      );
    }
  } catch (e) {
    console.log("   ✗ Web search failed:", (e as Error).message);
  }

  // Test 2: Web fetch
  console.log("\n2. Testing web_fetch...");
  try {
    const fetchResult = (await executeTool(
      "web_fetch",
      { url: "https://en.wikipedia.org/wiki/Chess" },
      "test-project"
    )) as WebFetchResult | ErrorResult;

    if ("error" in fetchResult) {
      console.log("   ✗ Web fetch failed:", fetchResult.error);
    } else {
      console.log("   ✓ Web fetch works");
      console.log("   Content length:", fetchResult.content?.length || 0);
      console.log("   Title:", fetchResult.title || "N/A");
    }
  } catch (e) {
    console.log("   ✗ Web fetch failed:", (e as Error).message);
  }

  // Test 3: Write artifact
  console.log("\n3. Testing write_artifact...");
  try {
    const writeResult = (await executeTool(
      "write_artifact",
      {
        filename: "test-notes.md",
        content: "# Test\n\nThis is a test artifact.",
        type: "notes",
      },
      "test-project"
    )) as WriteArtifactResult | ErrorResult;

    if ("error" in writeResult) {
      console.log("   ✗ Write artifact failed:", writeResult.error);
    } else {
      console.log("   ✓ Write artifact works");
      console.log("   Path:", writeResult.path);
    }
  } catch (e) {
    console.log("   ✗ Write artifact failed:", (e as Error).message);
  }

  // Test 4: Read artifact
  console.log("\n4. Testing read_artifact...");
  try {
    const readResult = (await executeTool(
      "read_artifact",
      { filename: "test-notes.md" },
      "test-project"
    )) as ReadArtifactResult | ErrorResult;

    if ("error" in readResult) {
      console.log("   ✗ Read artifact failed:", readResult.error);
    } else {
      console.log("   ✓ Read artifact works");
      console.log("   Content:", readResult.content);
    }
  } catch (e) {
    console.log("   ✗ Read artifact failed:", (e as Error).message);
  }

  console.log("\n✅ Tool tests complete");
}

testTools().catch(console.error);
