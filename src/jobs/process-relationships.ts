#!/usr/bin/env tsx

/**
 * Relationship Processing Job
 *
 * Processes co-retrieval patterns to create/strengthen implicit relationships.
 * Should be run periodically (e.g., after each session or via cron).
 *
 * Usage: npm run jobs:relationships
 *
 * What it does:
 * 1. Finds chunk pairs that were retrieved together >= threshold times
 * 2. Creates implicit "related_to" relationships for new pairs
 * 3. Strengthens existing relationships for repeated co-retrievals
 * 4. Cleans up old co-retrieval records to prevent unbounded growth
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  processImplicitRelationships,
  cleanupOldCoretrievals,
  getRelationshipCount,
  listProjects,
} from "../db/queries.js";
import { loadVectorIndex } from "../db/vector-store.js";

interface ProcessingConfig {
  coretrievalThreshold: number;     // Min co-retrievals to create relationship
  initialWeight: number;            // Starting weight for new implicit relationships
  strengthenAmount: number;         // Amount to increase weight on repeated co-retrieval
  coretrievalRetentionDays: number; // How long to keep co-retrieval records
}

const DEFAULT_CONFIG: ProcessingConfig = {
  coretrievalThreshold: 3,
  initialWeight: 0.2,
  strengthenAmount: 0.05,
  coretrievalRetentionDays: 30,
};

async function runRelationshipMaintenance(config: ProcessingConfig = DEFAULT_CONFIG) {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           RELATIONSHIP MAINTENANCE JOB                     ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // Initialize database
  initializeSchema();
  loadVectorIndex();

  // Get project for stats
  const projects = listProjects();
  if (projects.length === 0) {
    console.log("No projects found. Nothing to process.");
    closeDatabase();
    return;
  }

  const projectId = projects[0].id;
  const beforeCount = getRelationshipCount(projectId);

  console.log(`Project: ${projectId.slice(0, 8)}...`);
  console.log(`Relationships before: ${beforeCount}`);
  console.log();

  // Process implicit relationships
  console.log("─".repeat(60));
  console.log("Processing implicit relationships...");
  console.log(`  Threshold: ${config.coretrievalThreshold} co-retrievals`);
  console.log(`  Initial weight: ${config.initialWeight}`);
  console.log(`  Strengthen amount: ${config.strengthenAmount}`);
  console.log();

  try {
    const result = processImplicitRelationships(
      config.coretrievalThreshold,
      config.initialWeight,
      config.strengthenAmount
    );

    console.log(`  Created: ${result.created} new implicit relationships`);
    console.log(`  Strengthened: ${result.strengthened} existing relationships`);
    console.log();
  } catch (error) {
    console.error("Error processing implicit relationships:", error);
  }

  // Clean up old co-retrieval records
  console.log("─".repeat(60));
  console.log("Cleaning up old co-retrieval records...");
  console.log(`  Retention: ${config.coretrievalRetentionDays} days`);
  console.log();

  try {
    const cleaned = cleanupOldCoretrievals(config.coretrievalRetentionDays);
    console.log(`  Removed: ${cleaned} old records`);
    console.log();
  } catch (error) {
    console.error("Error cleaning up co-retrieval records:", error);
  }

  // Final stats
  const afterCount = getRelationshipCount(projectId);
  console.log("─".repeat(60));
  console.log("Summary:");
  console.log(`  Relationships before: ${beforeCount}`);
  console.log(`  Relationships after: ${afterCount}`);
  console.log(`  Net change: ${afterCount - beforeCount > 0 ? "+" : ""}${afterCount - beforeCount}`);
  console.log();

  closeDatabase();
  console.log("Done!");
}

// Parse CLI arguments for config overrides
function parseArgs(): Partial<ProcessingConfig> {
  const args = process.argv.slice(2);
  const config: Partial<ProcessingConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case "--threshold":
      case "-t":
        config.coretrievalThreshold = parseInt(value, 10);
        i++;
        break;
      case "--weight":
      case "-w":
        config.initialWeight = parseFloat(value);
        i++;
        break;
      case "--strengthen":
      case "-s":
        config.strengthenAmount = parseFloat(value);
        i++;
        break;
      case "--retention":
      case "-r":
        config.coretrievalRetentionDays = parseInt(value, 10);
        i++;
        break;
      case "--help":
      case "-h":
        console.log("Usage: npm run jobs:relationships [options]");
        console.log();
        console.log("Options:");
        console.log("  -t, --threshold <n>   Min co-retrievals to create relationship (default: 3)");
        console.log("  -w, --weight <n>      Initial weight for new relationships (default: 0.2)");
        console.log("  -s, --strengthen <n>  Amount to strengthen existing relationships (default: 0.05)");
        console.log("  -r, --retention <n>   Days to keep co-retrieval records (default: 30)");
        console.log("  -h, --help            Show this help");
        process.exit(0);
    }
  }

  return config;
}

const cliConfig = parseArgs();
const finalConfig = { ...DEFAULT_CONFIG, ...cliConfig };

runRelationshipMaintenance(finalConfig).catch(console.error);
