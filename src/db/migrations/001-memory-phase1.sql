-- Migration 001: Phase 1 Memory Improvements
-- Run with: sqlite3 visioneer.db < src/db/migrations/001-memory-phase1.sql

-- Check if migration already applied
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pragma_table_info('chunks') WHERE name='current_strength')
  THEN RAISE(ABORT, 'Migration already applied')
END;

-- Agent state table
CREATE TABLE IF NOT EXISTS agent_state (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  current_tick INTEGER NOT NULL DEFAULT 0,
  last_decay_tick INTEGER NOT NULL DEFAULT 0,
  last_consolidation_tick INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Add columns to chunks
ALTER TABLE chunks ADD COLUMN tick_created INTEGER DEFAULT 0;
ALTER TABLE chunks ADD COLUMN tick_last_accessed INTEGER;
ALTER TABLE chunks ADD COLUMN tick_last_useful INTEGER;
ALTER TABLE chunks ADD COLUMN learning_context TEXT DEFAULT '{}';
ALTER TABLE chunks ADD COLUMN initial_strength REAL DEFAULT 1.0;
ALTER TABLE chunks ADD COLUMN current_strength REAL DEFAULT 1.0;
ALTER TABLE chunks ADD COLUMN decay_function TEXT DEFAULT 'exponential';
ALTER TABLE chunks ADD COLUMN decay_rate REAL DEFAULT 0.05;
ALTER TABLE chunks ADD COLUMN persistence_score REAL DEFAULT 0.5;
ALTER TABLE chunks ADD COLUMN access_count INTEGER DEFAULT 0;
ALTER TABLE chunks ADD COLUMN successful_uses INTEGER DEFAULT 0;
ALTER TABLE chunks ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE chunks ADD COLUMN pinned INTEGER DEFAULT 0;
ALTER TABLE chunks ADD COLUMN superseded_by TEXT;
ALTER TABLE chunks ADD COLUMN valid_until_tick INTEGER;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chunks_strength ON chunks(current_strength);
CREATE INDEX IF NOT EXISTS idx_chunks_status ON chunks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_chunks_tick ON chunks(tick_created);

-- Archive table
CREATE TABLE IF NOT EXISTS chunks_archive (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  content_summary TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  tags TEXT NOT NULL,
  learning_context TEXT NOT NULL,
  tick_created INTEGER NOT NULL,
  tick_archived INTEGER NOT NULL,
  final_strength REAL NOT NULL,
  archived_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archive_project ON chunks_archive(project_id);
CREATE INDEX IF NOT EXISTS idx_archive_hash ON chunks_archive(content_hash);

-- Backfill existing chunks with defaults
UPDATE chunks SET
  tick_created = 0,
  learning_context = '{"tick":0,"task_id":null,"goal_id":null,"phase":"unknown","skill_area":null,"query_context":"migrated","related_chunks":[]}',
  initial_strength = 1.0,
  current_strength = 1.0,
  decay_function = CASE
    WHEN type = 'user_input' THEN 'none'
    WHEN type = 'decision' THEN 'linear'
    ELSE 'exponential'
  END,
  decay_rate = CASE
    WHEN type = 'user_input' THEN 0.0
    WHEN type = 'decision' THEN 0.02
    WHEN type = 'attempt' THEN 0.1
    ELSE 0.05
  END,
  persistence_score = 0.5,
  access_count = 0,
  successful_uses = 0,
  status = 'active',
  pinned = 0
WHERE current_strength IS NULL;

-- Initialize agent_state for existing projects
INSERT OR IGNORE INTO agent_state (project_id, current_tick)
SELECT id, 0 FROM projects;
