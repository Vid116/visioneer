/**
 * Claude Agent SDK Test Harness
 *
 * Tests the Agent SDK connection and confirms subscription-based execution works.
 * Run with: npm run sdk:test
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

async function testSDK() {
  console.log("=".repeat(60));
  console.log("Claude Agent SDK Test Harness");
  console.log("=".repeat(60));
  console.log("\nTesting Agent SDK connection...\n");

  try {
    const result = query({
      prompt: "What is 2 + 2? Reply with just the number.",
      options: {
        maxTurns: 1,
      }
    });

    console.log("Streaming messages:\n");

    for await (const message of result) {
      console.log(`  [${message.type}]`, JSON.stringify(message, null, 2).slice(0, 200));

      if (message.type === "result") {
        const msg = message as Record<string, unknown>;
        console.log("\n" + "=".repeat(60));
        console.log("RESULT SUMMARY");
        console.log("=".repeat(60));
        console.log(`  Result text: ${msg.result}`);
        console.log(`  Duration (ms): ${msg.duration_ms}`);
        console.log(`  API Duration (ms): ${msg.duration_api_ms}`);
        console.log(`  Turns used: ${msg.num_turns}`);
        console.log(`  Session ID: ${msg.session_id}`);
        console.log(`  Success: ${!msg.is_error}`);
        console.log("=".repeat(60));
      }

      if (message.type === "system" && (message as Record<string, unknown>).subtype === "init") {
        const msg = message as Record<string, unknown>;
        console.log("\n  Available tools:", (msg.tools as string[])?.slice(0, 10).join(", "), "...");
        console.log(`  Working directory: ${msg.cwd}`);
        console.log(`  Session: ${msg.session_id}\n`);
      }
    }

    console.log("\nTest completed successfully!");

  } catch (error) {
    console.error("\nTest FAILED:");
    console.error(error);
    process.exit(1);
  }
}

testSDK().catch(console.error);
