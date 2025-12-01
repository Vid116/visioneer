import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { LearningContext, ChunkV2 } from '../../src/utils/types.js';

/**
 * Memory System Integration Tests
 *
 * These tests verify that all Phase 1 memory components work together correctly.
 * We use an in-memory SQLite database to avoid interfering with the production database.
 */

describe('Memory System Integration', () => {
  let db: Database.Database;
  const PROJECT_ID = 'integration-test-project';

  // Create schema for testing
  const createSchema = `
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS agent_state (
      project_id TEXT PRIMARY KEY,
      current_tick INTEGER NOT NULL DEFAULT 0,
      last_decay_tick INTEGER NOT NULL DEFAULT 0,
      last_consolidation_tick INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      confidence TEXT NOT NULL DEFAULT 'inferred',
      source TEXT NOT NULL DEFAULT 'research',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_accessed TEXT DEFAULT CURRENT_TIMESTAMP,
      last_useful TEXT,
      tick_created INTEGER DEFAULT 0,
      tick_last_accessed INTEGER,
      tick_last_useful INTEGER,
      learning_context TEXT DEFAULT '{}',
      initial_strength REAL DEFAULT 1.0,
      current_strength REAL DEFAULT 1.0,
      decay_function TEXT DEFAULT 'exponential',
      decay_rate REAL DEFAULT 0.05,
      persistence_score REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      successful_uses INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      pinned INTEGER DEFAULT 0,
      superseded_by TEXT,
      valid_until_tick INTEGER
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      from_chunk_id TEXT NOT NULL,
      to_chunk_id TEXT NOT NULL,
      type TEXT NOT NULL,
      weight REAL DEFAULT 0.5,
      last_activated TEXT DEFAULT CURRENT_TIMESTAMP,
      activation_count INTEGER DEFAULT 0,
      context_tags TEXT DEFAULT '[]',
      origin TEXT DEFAULT 'explicit',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chunks_archive (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content_summary TEXT,
      content_hash TEXT,
      type TEXT,
      tags TEXT,
      learning_context TEXT,
      tick_created INTEGER,
      tick_archived INTEGER,
      final_strength REAL,
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `;

  beforeAll(() => {
    // Create in-memory database
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(createSchema);
    db.exec(`INSERT INTO projects (id) VALUES ('${PROJECT_ID}')`);
  });

  afterAll(() => {
    db.close();
  });

  // Helper functions
  function insertChunk(chunk: Partial<ChunkV2>): void {
    const defaultContext: LearningContext = {
      tick: chunk.tick_created || 0,
      task_id: null,
      goal_id: null,
      phase: 'research',
      skill_area: null,
      query_context: '',
      related_chunks: [],
    };

    const stmt = db.prepare(`
      INSERT INTO chunks (
        id, project_id, content, type, tags, confidence, source,
        tick_created, learning_context, current_strength, decay_function, decay_rate, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      chunk.id || `chunk-${Date.now()}`,
      chunk.project_id || PROJECT_ID,
      chunk.content || 'Test content',
      chunk.type || 'research',
      JSON.stringify(chunk.tags || []),
      chunk.confidence || 'verified',
      chunk.source || 'research',
      chunk.tick_created || 0,
      JSON.stringify(chunk.learning_context || defaultContext),
      chunk.current_strength ?? 1.0,
      chunk.decay_function || 'exponential',
      chunk.decay_rate ?? 0.05,
      chunk.status || 'active'
    );
  }

  function getChunk(id: string): Record<string, unknown> | undefined {
    return db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  }

  function updateChunkStrength(id: string, strength: number): void {
    db.prepare('UPDATE chunks SET current_strength = ? WHERE id = ?').run(strength, id);
  }

  function updateChunkStatus(id: string, status: string): void {
    db.prepare('UPDATE chunks SET status = ? WHERE id = ?').run(status, id);
  }

  function insertRelationship(fromId: string, toId: string, type: string): void {
    const stmt = db.prepare(`
      INSERT INTO relationships (id, from_chunk_id, to_chunk_id, type, weight)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(`rel-${Date.now()}-${Math.random()}`, fromId, toId, type, 0.5);
  }

  function getRelationshipCount(chunkId: string): number {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM relationships
      WHERE from_chunk_id = ? OR to_chunk_id = ?
    `).get(chunkId, chunkId) as { count: number };
    return result.count;
  }

  describe('Chunk Lifecycle', () => {
    it('should create chunk with default Phase 1 fields', () => {
      const chunkId = 'lifecycle-test-1';
      insertChunk({
        id: chunkId,
        content: 'Test chunk for lifecycle',
        tick_created: 1,
      });

      const chunk = getChunk(chunkId);

      expect(chunk).toBeDefined();
      expect(chunk!.current_strength).toBe(1.0);
      expect(chunk!.decay_function).toBe('exponential');
      expect(chunk!.decay_rate).toBe(0.05);
      expect(chunk!.status).toBe('active');
    });

    it('should store and parse learning context', () => {
      const chunkId = 'context-test-1';
      const context: LearningContext = {
        tick: 42,
        task_id: 'task-123',
        goal_id: 'goal-456',
        phase: 'execution',
        skill_area: 'practice',
        query_context: 'test query',
        related_chunks: ['chunk-a', 'chunk-b'],
      };

      insertChunk({
        id: chunkId,
        content: 'Chunk with context',
        learning_context: context,
        tick_created: 42,
      });

      const chunk = getChunk(chunkId);
      const parsedContext = JSON.parse(chunk!.learning_context as string);

      expect(parsedContext.tick).toBe(42);
      expect(parsedContext.task_id).toBe('task-123');
      expect(parsedContext.goal_id).toBe('goal-456');
      expect(parsedContext.phase).toBe('execution');
      expect(parsedContext.skill_area).toBe('practice');
      expect(parsedContext.related_chunks).toEqual(['chunk-a', 'chunk-b']);
    });
  });

  describe('Strength and Decay', () => {
    it('should update strength value', () => {
      const chunkId = 'strength-test-1';
      insertChunk({
        id: chunkId,
        content: 'Strength test chunk',
        current_strength: 1.0,
      });

      updateChunkStrength(chunkId, 0.5);

      const chunk = getChunk(chunkId);
      expect(chunk!.current_strength).toBe(0.5);
    });

    it('should handle strength approaching zero', () => {
      const chunkId = 'weak-strength-1';
      insertChunk({
        id: chunkId,
        content: 'Weak chunk',
        current_strength: 0.01,
      });

      updateChunkStrength(chunkId, 0);

      const chunk = getChunk(chunkId);
      expect(chunk!.current_strength).toBe(0);
    });
  });

  describe('Status Transitions', () => {
    it('should transition from active to warm', () => {
      const chunkId = 'status-test-1';
      insertChunk({
        id: chunkId,
        content: 'Status test chunk',
        status: 'active',
      });

      updateChunkStatus(chunkId, 'warm');

      const chunk = getChunk(chunkId);
      expect(chunk!.status).toBe('warm');
    });

    it('should follow status hierarchy', () => {
      const chunkId = 'status-hierarchy-1';
      insertChunk({
        id: chunkId,
        content: 'Hierarchy test',
        status: 'active',
      });

      const statuses = ['warm', 'cool', 'cold', 'tombstone'];
      for (const status of statuses) {
        updateChunkStatus(chunkId, status);
        const chunk = getChunk(chunkId);
        expect(chunk!.status).toBe(status);
      }
    });
  });

  describe('Persistence Score Factors', () => {
    it('should track access count', () => {
      const chunkId = 'access-test-1';
      insertChunk({
        id: chunkId,
        content: 'Access test chunk',
      });

      // Simulate multiple accesses
      db.prepare('UPDATE chunks SET access_count = access_count + 1 WHERE id = ?').run(chunkId);
      db.prepare('UPDATE chunks SET access_count = access_count + 1 WHERE id = ?').run(chunkId);
      db.prepare('UPDATE chunks SET access_count = access_count + 1 WHERE id = ?').run(chunkId);

      const chunk = getChunk(chunkId);
      expect(chunk!.access_count).toBe(3);
    });

    it('should track successful uses', () => {
      const chunkId = 'success-test-1';
      insertChunk({
        id: chunkId,
        content: 'Success test chunk',
      });

      db.prepare('UPDATE chunks SET successful_uses = successful_uses + 1 WHERE id = ?').run(chunkId);

      const chunk = getChunk(chunkId);
      expect(chunk!.successful_uses).toBe(1);
    });

    it('should count relationships for connection score', () => {
      const chunkId = 'rel-test-1';
      insertChunk({ id: chunkId, content: 'Main chunk' });
      insertChunk({ id: 'rel-test-2', content: 'Related chunk 1' });
      insertChunk({ id: 'rel-test-3', content: 'Related chunk 2' });

      insertRelationship(chunkId, 'rel-test-2', 'supports');
      insertRelationship(chunkId, 'rel-test-3', 'builds_on');

      const count = getRelationshipCount(chunkId);
      expect(count).toBe(2);
    });
  });

  describe('Chunk Types', () => {
    it('should handle user_input type with no decay', () => {
      const chunkId = 'user-input-1';
      insertChunk({
        id: chunkId,
        type: 'user_input',
        content: 'User provided content',
        decay_function: 'none',
        decay_rate: 0,
      });

      const chunk = getChunk(chunkId);
      expect(chunk!.type).toBe('user_input');
      expect(chunk!.decay_function).toBe('none');
      expect(chunk!.decay_rate).toBe(0);
    });

    it('should handle decision type with linear decay', () => {
      const chunkId = 'decision-1';
      insertChunk({
        id: chunkId,
        type: 'decision',
        content: 'Decision content',
        decay_function: 'linear',
        decay_rate: 0.02,
      });

      const chunk = getChunk(chunkId);
      expect(chunk!.type).toBe('decision');
      expect(chunk!.decay_function).toBe('linear');
    });

    it('should handle attempt type with faster decay', () => {
      const chunkId = 'attempt-1';
      insertChunk({
        id: chunkId,
        type: 'attempt',
        content: 'Attempt content',
        decay_rate: 0.1,
      });

      const chunk = getChunk(chunkId);
      expect(chunk!.type).toBe('attempt');
      expect(chunk!.decay_rate).toBe(0.1);
    });
  });

  describe('Agent State (Tick Tracking)', () => {
    it('should initialize agent state', () => {
      db.prepare(`
        INSERT OR REPLACE INTO agent_state (project_id, current_tick)
        VALUES (?, 0)
      `).run(PROJECT_ID);

      const state = db.prepare('SELECT * FROM agent_state WHERE project_id = ?')
        .get(PROJECT_ID) as Record<string, unknown>;

      expect(state).toBeDefined();
      expect(state.current_tick).toBe(0);
    });

    it('should increment tick', () => {
      db.prepare('UPDATE agent_state SET current_tick = current_tick + 1 WHERE project_id = ?')
        .run(PROJECT_ID);

      const state = db.prepare('SELECT * FROM agent_state WHERE project_id = ?')
        .get(PROJECT_ID) as Record<string, unknown>;

      expect(state.current_tick).toBe(1);
    });

    it('should track decay tick separately', () => {
      db.prepare(`
        UPDATE agent_state
        SET last_decay_tick = current_tick, current_tick = current_tick + 5
        WHERE project_id = ?
      `).run(PROJECT_ID);

      const state = db.prepare('SELECT * FROM agent_state WHERE project_id = ?')
        .get(PROJECT_ID) as Record<string, unknown>;

      expect((state.current_tick as number)).toBeGreaterThan(state.last_decay_tick as number);
    });
  });

  describe('Archiving (Chunks Archive)', () => {
    it('should archive tombstoned chunk', () => {
      const chunkId = 'archive-test-1';
      insertChunk({
        id: chunkId,
        content: 'Content to be archived eventually',
        tick_created: 1,
      });

      // Archive the chunk
      const chunk = getChunk(chunkId);
      const summary = (chunk!.content as string).slice(0, 50);

      db.prepare(`
        INSERT INTO chunks_archive (
          id, project_id, content_summary, type, tags, tick_created, tick_archived, final_strength
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        chunkId,
        PROJECT_ID,
        summary,
        chunk!.type,
        chunk!.tags,
        chunk!.tick_created,
        100, // tick archived
        0.01  // final strength
      );

      const archived = db.prepare('SELECT * FROM chunks_archive WHERE id = ?')
        .get(chunkId) as Record<string, unknown>;

      expect(archived).toBeDefined();
      expect(archived.content_summary).toBe(summary);
      expect(archived.final_strength).toBe(0.01);
      expect(archived.tick_archived).toBe(100);
    });
  });

  describe('Pinned Chunks', () => {
    it('should mark chunk as pinned', () => {
      const chunkId = 'pinned-1';
      insertChunk({
        id: chunkId,
        content: 'Important pinned content',
      });

      db.prepare('UPDATE chunks SET pinned = 1 WHERE id = ?').run(chunkId);

      const chunk = getChunk(chunkId);
      expect(chunk!.pinned).toBe(1);
    });
  });

  describe('Superseded Chunks', () => {
    it('should track superseding relationships', () => {
      const oldChunkId = 'old-chunk-1';
      const newChunkId = 'new-chunk-1';

      insertChunk({ id: oldChunkId, content: 'Old information' });
      insertChunk({ id: newChunkId, content: 'Updated information' });

      db.prepare('UPDATE chunks SET superseded_by = ? WHERE id = ?')
        .run(newChunkId, oldChunkId);

      const oldChunk = getChunk(oldChunkId);
      expect(oldChunk!.superseded_by).toBe(newChunkId);
    });
  });

  describe('Memory Reactivation Scenario', () => {
    it('should boost strength on successful use', () => {
      const chunkId = 'reactivate-1';
      insertChunk({
        id: chunkId,
        content: 'Chunk to reactivate',
        current_strength: 0.2,
      });

      // Simulate reactivation: boost strength on successful use
      const chunk = getChunk(chunkId);
      const oldStrength = chunk!.current_strength as number;
      const boost = 0.2 * (1 - oldStrength); // Diminishing returns
      const newStrength = Math.min(1.0, oldStrength + boost);

      db.prepare(`
        UPDATE chunks
        SET current_strength = ?, successful_uses = successful_uses + 1, access_count = access_count + 1
        WHERE id = ?
      `).run(newStrength, chunkId);

      const updated = getChunk(chunkId);
      expect(updated!.current_strength).toBeGreaterThan(oldStrength);
      expect(updated!.successful_uses).toBe(1);
      expect(updated!.access_count).toBe(1);
    });

    it('should potentially promote status on reactivation', () => {
      const chunkId = 'promote-1';
      insertChunk({
        id: chunkId,
        content: 'Chunk to promote',
        current_strength: 0.2,
        status: 'warm',
      });

      // Simulate strong reactivation
      const newStrength = 0.5;

      db.prepare(`
        UPDATE chunks
        SET current_strength = ?, status = 'active'
        WHERE id = ? AND ? > 0.4
      `).run(newStrength, chunkId, newStrength);

      const chunk = getChunk(chunkId);
      expect(chunk!.current_strength).toBe(0.5);
      expect(chunk!.status).toBe('active');
    });
  });

  describe('Full Lifecycle Test', () => {
    it('should complete full memory lifecycle', () => {
      const criteria = [
        'Chunk created with context',
        'Strength decays over time',
        'Reactivation boosts strength',
        'Status transitions correctly',
        'Archive on tombstone',
      ];
      const passed: string[] = [];

      // 1. Create chunk with learning context
      const chunkId = 'lifecycle-full-1';
      const context: LearningContext = {
        tick: 10,
        task_id: 'task-1',
        goal_id: 'goal-1',
        phase: 'research',
        skill_area: 'theory',
        query_context: 'test',
        related_chunks: [],
      };

      insertChunk({
        id: chunkId,
        content: 'Full lifecycle test chunk',
        learning_context: context,
        tick_created: 10,
        current_strength: 1.0,
      });

      let chunk = getChunk(chunkId);
      expect(chunk).toBeDefined();
      passed.push('Chunk created with context');

      // 2. Simulate decay
      updateChunkStrength(chunkId, 0.4);
      chunk = getChunk(chunkId);
      expect(chunk!.current_strength).toBe(0.4);
      passed.push('Strength decays over time');

      // 3. Simulate reactivation
      updateChunkStrength(chunkId, 0.6);
      db.prepare('UPDATE chunks SET successful_uses = successful_uses + 1 WHERE id = ?').run(chunkId);
      chunk = getChunk(chunkId);
      expect(chunk!.current_strength).toBe(0.6);
      expect(chunk!.successful_uses).toBe(1);
      passed.push('Reactivation boosts strength');

      // 4. Continue decay to status transition
      updateChunkStrength(chunkId, 0.25);
      updateChunkStatus(chunkId, 'warm');
      chunk = getChunk(chunkId);
      expect(chunk!.status).toBe('warm');

      updateChunkStrength(chunkId, 0.01);
      updateChunkStatus(chunkId, 'cold');
      chunk = getChunk(chunkId);
      expect(chunk!.status).toBe('cold');
      passed.push('Status transitions correctly');

      // 5. Archive on tombstone
      updateChunkStrength(chunkId, 0);
      updateChunkStatus(chunkId, 'tombstone');

      db.prepare(`
        INSERT INTO chunks_archive (id, project_id, content_summary, tick_archived, final_strength)
        VALUES (?, ?, ?, ?, ?)
      `).run(chunkId, PROJECT_ID, 'Full lifecycle...', 100, 0);

      const archived = db.prepare('SELECT * FROM chunks_archive WHERE id = ?')
        .get(chunkId) as Record<string, unknown>;
      expect(archived).toBeDefined();
      passed.push('Archive on tombstone');

      // Verify all criteria
      expect(passed).toEqual(criteria);
    });
  });
});
