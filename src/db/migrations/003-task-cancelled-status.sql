-- =============================================================================
-- Migration 003: Add 'cancelled' status to tasks
-- =============================================================================
-- This migration adds the 'cancelled' status to support pivot detection.
-- When a user signals a major direction change, existing tasks can be
-- marked as cancelled rather than left in an inconsistent state.
--
-- SQLite doesn't support ALTER TABLE to modify CHECK constraints, so we
-- need to recreate the table. This migration is safe to run on new
-- databases (the new schema already includes 'cancelled').

-- For SQLite, we need to:
-- 1. Create a new table with the updated constraint
-- 2. Copy data from old table
-- 3. Drop old table
-- 4. Rename new table

-- Check if migration already applied (new status already exists in constraint)
-- Note: This is a simplified approach - in production you'd use a migrations table

-- Step 1: Create new table with updated constraint
CREATE TABLE IF NOT EXISTS tasks_new (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'in_progress', 'blocked', 'done', 'cancelled')),
    skill_area TEXT,
    depends_on TEXT,
    blocked_by TEXT,
    outcome TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    failure_reason TEXT,
    failure_context TEXT,
    failed_at TIMESTAMP,
    -- Pivot tracking
    cancelled_reason TEXT,
    cancelled_at TIMESTAMP
);

-- Step 2: Copy existing data (only if tasks table exists and has data)
INSERT OR IGNORE INTO tasks_new (
    id, project_id, title, description, status, skill_area,
    depends_on, blocked_by, outcome, created_at, updated_at,
    started_at, completed_at, failure_reason, failure_context, failed_at
)
SELECT
    id, project_id, title, description, status, skill_area,
    depends_on, blocked_by, outcome, created_at, updated_at,
    started_at, completed_at, failure_reason, failure_context, failed_at
FROM tasks;

-- Step 3: Drop old table
DROP TABLE IF EXISTS tasks;

-- Step 4: Rename new table
ALTER TABLE tasks_new RENAME TO tasks;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_skill_area ON tasks(project_id, skill_area);

-- Recreate trigger
DROP TRIGGER IF EXISTS update_task_timestamp;
CREATE TRIGGER update_task_timestamp
    AFTER UPDATE ON tasks
    BEGIN
        UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
