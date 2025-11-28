import "dotenv/config";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getStorageConfig } from "../utils/config.js";
import { dbLogger } from "../utils/logger.js";
import { initializeVectorStore, loadVectorIndex } from "./vector-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/**
 * Gets or creates the database connection.
 * Initializes schema if database doesn't exist.
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const config = getStorageConfig();
  const dbPath = config.database_path;

  dbLogger.info(`Opening database at: ${dbPath}`);

  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma("foreign_keys = ON");
  
  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");

  return db;
}

/**
 * Initializes the database schema.
 * Safe to call multiple times (uses IF NOT EXISTS).
 */
export function initializeSchema(): void {
  const database = getDatabase();
  const schemaPath = join(__dirname, "schema.sql");
  
  dbLogger.info("Initializing database schema...");

  const schema = readFileSync(schemaPath, "utf-8");
  database.exec(schema);

  // Initialize in-memory vector store
  initializeVectorStore();
  loadVectorIndex();

  dbLogger.info("Database schema initialized");
}

/**
 * Closes the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    dbLogger.info("Closing database connection");
    db.close();
    db = null;
  }
}

/**
 * Runs a function within a transaction.
 */
export function withTransaction<T>(fn: () => T): T {
  const database = getDatabase();
  return database.transaction(fn)();
}

/**
 * Helper to prepare a statement (cached).
 */
const statementCache = new Map<string, Database.Statement>();

export function prepareStatement(sql: string): Database.Statement {
  let stmt = statementCache.get(sql);
  if (!stmt) {
    stmt = getDatabase().prepare(sql);
    statementCache.set(sql, stmt);
  }
  return stmt;
}
