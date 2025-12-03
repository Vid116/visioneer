-- Migration 002: Add new relationship types (typed edges)
-- Run with: sqlite3 visioneer.db < src/db/migrations/002-typed-edges.sql
--
-- New relationship types:
--   caused_by    - Causal relationship (e.g., "Bug X caused_by commit Y")
--   depends_on   - Hard dependency (e.g., "Feature A depends_on API B")
--   example_of   - Instance/generalization (e.g., "React example_of frontend framework")
--   part_of      - Hierarchical containment (e.g., "Login part_of Auth Module")
--   derived_from - Transformation/derivation (e.g., "Summary derived_from full document")
--   precedes     - Temporal/logical ordering (e.g., "Step 1 precedes Step 2")

-- Step 1: Create new relationships table with expanded types
CREATE TABLE IF NOT EXISTS relationships_new (
  id TEXT PRIMARY KEY,
  from_chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  to_chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'supports',
    'contradicts',
    'builds_on',
    'replaces',
    'requires',
    'related_to',
    'caused_by',
    'depends_on',
    'example_of',
    'part_of',
    'derived_from',
    'precedes'
  )),
  weight REAL NOT NULL DEFAULT 0.5 CHECK (weight >= 0.0 AND weight <= 1.0),
  last_activated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  activation_count INTEGER DEFAULT 0,
  context_tags TEXT DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT 'explicit' CHECK (origin IN ('explicit', 'implicit', 'inferred', 'auto')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_chunk_id, to_chunk_id, type)
);

-- Step 2: Copy existing data
INSERT INTO relationships_new
SELECT * FROM relationships;

-- Step 3: Drop old table and rename
DROP TABLE relationships;
ALTER TABLE relationships_new RENAME TO relationships;

-- Step 4: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_chunk_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_chunk_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);
CREATE INDEX IF NOT EXISTS idx_relationships_weight ON relationships(weight DESC);
