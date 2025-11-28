-- =============================================================================
-- Visioneer Database Schema
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Projects
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Orientation Layer (one per project)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orientation (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT NOT NULL,  -- JSON serialized Orientation
    last_rewritten TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- Working Layer: Tasks
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'in_progress', 'blocked', 'done')),
    skill_area TEXT,
    depends_on TEXT,  -- JSON array of task IDs
    blocked_by TEXT,  -- JSON array of question IDs
    outcome TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_skill_area ON tasks(project_id, skill_area);

-- -----------------------------------------------------------------------------
-- Working Layer: Questions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    context TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
    answer TEXT,
    blocks_tasks TEXT,  -- JSON array of task IDs
    asked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questions_project_status ON questions(project_id, status);

-- -----------------------------------------------------------------------------
-- Working Layer: Activity Log
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,  -- JSON
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activities_project_time ON activities(project_id, timestamp DESC);

-- -----------------------------------------------------------------------------
-- Knowledge Layer: Chunks
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('research', 'insight', 'decision', 'resource', 'attempt', 'user_input')),
    tags TEXT NOT NULL,  -- JSON array
    confidence TEXT NOT NULL CHECK (confidence IN ('verified', 'inferred', 'speculative')),
    source TEXT NOT NULL CHECK (source IN ('research', 'user', 'deduction', 'experiment')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_useful TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(project_id, type);
CREATE INDEX IF NOT EXISTS idx_chunks_confidence ON chunks(project_id, confidence);

-- -----------------------------------------------------------------------------
-- Knowledge Layer: Chunk Embeddings (for sqlite-vss)
-- Note: This is created separately when sqlite-vss is loaded
-- -----------------------------------------------------------------------------

-- The virtual table will be created by the init script:
-- CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vss0(embedding(3072));

-- Mapping table to link chunks to their embeddings
CREATE TABLE IF NOT EXISTS chunk_embedding_map (
    chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
    embedding_rowid INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- Knowledge Layer: Relationships
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    from_chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    to_chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('supports', 'contradicts', 'builds_on', 'replaces', 'requires', 'related_to')),
    weight REAL NOT NULL DEFAULT 0.5 CHECK (weight >= 0.0 AND weight <= 1.0),
    last_activated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activation_count INTEGER DEFAULT 0,
    context_tags TEXT,  -- JSON array
    origin TEXT NOT NULL DEFAULT 'explicit' CHECK (origin IN ('explicit', 'implicit')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_chunk_id, to_chunk_id, type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_chunk_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_chunk_id);
CREATE INDEX IF NOT EXISTS idx_relationships_weight ON relationships(weight DESC);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);

-- -----------------------------------------------------------------------------
-- Knowledge Layer: Co-retrieval Tracking (for implicit relationships)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS coretrieval (
    id TEXT PRIMARY KEY,
    chunk_a_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    chunk_b_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    query_context TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coretrieval_chunks ON coretrieval(chunk_a_id, chunk_b_id);
CREATE INDEX IF NOT EXISTS idx_coretrieval_session ON coretrieval(session_id);

-- -----------------------------------------------------------------------------
-- Knowledge Layer: Archived Relationships (decayed below threshold)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS relationships_archive (
    id TEXT PRIMARY KEY,
    from_chunk_id TEXT NOT NULL,
    to_chunk_id TEXT NOT NULL,
    type TEXT NOT NULL,
    final_weight REAL NOT NULL,
    reason TEXT NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    original_data TEXT  -- JSON of full relationship
);

-- -----------------------------------------------------------------------------
-- Triggers for automatic timestamp updates
-- -----------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS update_task_timestamp 
    AFTER UPDATE ON tasks
    BEGIN
        UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_chunk_accessed
    AFTER UPDATE OF last_accessed ON chunks
    BEGIN
        UPDATE chunks SET last_accessed = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- -----------------------------------------------------------------------------
-- Goals: Track project goals with history
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    outcome TEXT  -- what was learned/achieved before switching
);

CREATE INDEX IF NOT EXISTS idx_goals_project ON goals(project_id);
CREATE INDEX IF NOT EXISTS idx_goals_active ON goals(project_id, active);

-- -----------------------------------------------------------------------------
-- Pending Goal: Queue goal changes during active cycles
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pending_goals (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    queued_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Coherence Warnings: Tasks flagged as potentially off-track
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS coherence_warnings (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    concern TEXT NOT NULL,
    suggestion TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved INTEGER DEFAULT 0,
    resolution TEXT  -- 'executed', 'dismissed', 'modified'
);

CREATE INDEX IF NOT EXISTS idx_coherence_warnings_project ON coherence_warnings(project_id);
CREATE INDEX IF NOT EXISTS idx_coherence_warnings_unresolved ON coherence_warnings(project_id, resolved);
