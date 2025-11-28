#!/usr/bin/env tsx

/**
 * Visioneer - Autonomous AI Agent Architecture
 * 
 * This is the main entry point for running Visioneer.
 * 
 * Usage:
 *   npm run dev          - Run in development mode with hot reload
 *   npm run start        - Run the compiled version
 *   npm run mcp:*        - Run individual MCP servers
 *   npm run db:init      - Initialize the database
 */

import { initializeSchema, closeDatabase } from "./db/connection.js";
import { loadConfig } from "./utils/config.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("main");

async function main() {
  logger.info("Starting Visioneer...");
  
  // Load configuration
  const config = loadConfig();
  logger.info("Configuration loaded", { version: config.version });
  
  // Initialize database
  logger.info("Initializing database...");
  initializeSchema();
  logger.info("Database ready");
  
  // Display startup info
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗   ██╗██╗███████╗██╗ ██████╗ ███╗   ██╗███████╗███████╗██████╗  ║
║   ██║   ██║██║██╔════╝██║██╔═══██╗████╗  ██║██╔════╝██╔════╝██╔══██╗ ║
║   ██║   ██║██║███████╗██║██║   ██║██╔██╗ ██║█████╗  █████╗  ██████╔╝ ║
║   ╚██╗ ██╔╝██║╚════██║██║██║   ██║██║╚██╗██║██╔══╝  ██╔══╝  ██╔══██╗ ║
║    ╚████╔╝ ██║███████║██║╚██████╔╝██║ ╚████║███████╗███████╗██║  ██║ ║
║     ╚═══╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝  ╚═╝ ║
║                                                               ║
║   Autonomous AI Agent Architecture v${config.version.padEnd(25)}    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

To use Visioneer with Claude Code, add the MCP servers to your config:

  {
    "mcpServers": {
      "visioneer-orientation": {
        "command": "npx",
        "args": ["tsx", "src/mcp/orientation.ts"],
        "cwd": "/path/to/visioneer"
      },
      "visioneer-working": {
        "command": "npx",
        "args": ["tsx", "src/mcp/working.ts"],
        "cwd": "/path/to/visioneer"
      },
      "visioneer-knowledge": {
        "command": "npx",
        "args": ["tsx", "src/mcp/knowledge.ts"],
        "cwd": "/path/to/visioneer"
      }
    }
  }

Database: ${config.storage.database_path}
Embedding: ${config.embedding.provider} (${config.embedding.model})

Ready.
`);
  
  // Handle shutdown
  process.on("SIGINT", () => {
    logger.info("Shutting down...");
    closeDatabase();
    process.exit(0);
  });
  
  process.on("SIGTERM", () => {
    logger.info("Shutting down...");
    closeDatabase();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error("Failed to start", { error });
  process.exit(1);
});
