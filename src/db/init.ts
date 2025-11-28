#!/usr/bin/env tsx

import { initializeSchema, closeDatabase } from "./connection.js";
import { dbLogger } from "../utils/logger.js";

async function main() {
  try {
    dbLogger.info("Starting database initialization...");
    
    initializeSchema();
    
    dbLogger.info("Database initialization complete!");
  } catch (error) {
    dbLogger.error("Failed to initialize database", { error });
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

main();
