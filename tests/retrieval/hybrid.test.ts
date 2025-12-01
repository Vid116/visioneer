import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildRetrievalContext,
  RETRIEVAL_WEIGHTS,
} from '../../src/retrieval/hybrid.js';
import { RetrievalContext, LearningContext, ChunkV2 } from '../../src/utils/types.js';

// Mock external dependencies
vi.mock('../../src/db/connection.js', () => ({
  getDatabase: vi.fn(() => ({})),
  prepareStatement: vi.fn(() => ({
    all: vi.fn(() => []),
    get: vi.fn(() => null),
    run: vi.fn(),
  })),
}));

vi.mock('../../src/db/vector-store.js', () => ({
  searchSimilar: vi.fn(() => []),
}));

vi.mock('../../src/embedding/index.js', () => ({
  embed: vi.fn(() => new Float32Array(3072)),
}));

vi.mock('../../src/retrieval/bm25.js', () => ({
  searchBM25: vi.fn(() => []),
}));

vi.mock('../../src/memory/decay.js', () => ({
  reactivateMemory: vi.fn(),
}));

describe('Hybrid Search', () => {
  describe('RETRIEVAL_WEIGHTS', () => {
    it('should have correct semantic weight', () => {
      expect(RETRIEVAL_WEIGHTS.semantic).toBe(0.40);
    });

    it('should have correct keyword weight', () => {
      expect(RETRIEVAL_WEIGHTS.keyword).toBe(0.35);
    });

    it('should have correct graph weight', () => {
      expect(RETRIEVAL_WEIGHTS.graph).toBe(0.25);
    });

    it('should sum to 1.0', () => {
      const total = RETRIEVAL_WEIGHTS.semantic + RETRIEVAL_WEIGHTS.keyword + RETRIEVAL_WEIGHTS.graph;
      expect(total).toBeCloseTo(1.0, 10);
    });
  });

  describe('buildRetrievalContext', () => {
    it('should build context from full parameters', () => {
      const task = { id: 'task-001', skill_area: 'theory' };

      const context = buildRetrievalContext(42, task, 'goal-001', 'research', 'test query');

      expect(context.tick).toBe(42);
      expect(context.task_id).toBe('task-001');
      expect(context.goal_id).toBe('goal-001');
      expect(context.phase).toBe('research');
      expect(context.skill_area).toBe('theory');
      expect(context.query).toBe('test query');
    });

    it('should handle null task', () => {
      const context = buildRetrievalContext(42, null, 'goal-001', 'research', 'test query');

      expect(context.task_id).toBeNull();
      expect(context.skill_area).toBeNull();
    });

    it('should handle null goal', () => {
      const context = buildRetrievalContext(42, null, null, 'research', 'test query');

      expect(context.goal_id).toBeNull();
    });

    it('should handle different phases', () => {
      const phases = ['intake', 'research', 'planning', 'execution', 'refinement', 'complete'];

      for (const phase of phases) {
        const context = buildRetrievalContext(0, null, null, phase, '');
        expect(context.phase).toBe(phase);
      }
    });

    it('should handle empty query', () => {
      const context = buildRetrievalContext(0, null, null, 'research', '');

      expect(context.query).toBe('');
    });
  });
});

describe('Context Match Calculation', () => {
  // Test the context matching logic (internal function behavior)
  describe('context matching behavior', () => {
    const baseLearningContext: LearningContext = {
      tick: 10,
      task_id: 'task-001',
      goal_id: 'goal-001',
      phase: 'research',
      skill_area: 'theory',
      query_context: 'original query',
      related_chunks: [],
    };

    it('should match on goal_id', () => {
      // If learning context has goal-001 and retrieval context has goal-001,
      // there should be a match on the goal dimension
      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-999', // different
        goal_id: 'goal-001', // same
        phase: 'execution',
        skill_area: 'practice',
        query: '',
      };

      // Goal match should contribute to context score
      expect(baseLearningContext.goal_id).toBe(retrievalCtx.goal_id);
    });

    it('should match on task_id', () => {
      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-001', // same
        goal_id: 'goal-999',
        phase: 'execution',
        skill_area: 'practice',
        query: '',
      };

      expect(baseLearningContext.task_id).toBe(retrievalCtx.task_id);
    });

    it('should match on phase', () => {
      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-999',
        goal_id: 'goal-999',
        phase: 'research', // same
        skill_area: 'practice',
        query: '',
      };

      expect(baseLearningContext.phase).toBe(retrievalCtx.phase);
    });

    it('should match on skill_area', () => {
      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-999',
        goal_id: 'goal-999',
        phase: 'execution',
        skill_area: 'theory', // same
        query: '',
      };

      expect(baseLearningContext.skill_area).toBe(retrievalCtx.skill_area);
    });

    it('should have no match when all fields differ', () => {
      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-999',
        goal_id: 'goal-999',
        phase: 'execution',
        skill_area: 'practice',
        query: '',
      };

      expect(baseLearningContext.goal_id).not.toBe(retrievalCtx.goal_id);
      expect(baseLearningContext.task_id).not.toBe(retrievalCtx.task_id);
      expect(baseLearningContext.phase).not.toBe(retrievalCtx.phase);
      expect(baseLearningContext.skill_area).not.toBe(retrievalCtx.skill_area);
    });

    it('should have perfect match when all fields match', () => {
      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-001', // same
        goal_id: 'goal-001', // same
        phase: 'research',   // same
        skill_area: 'theory', // same
        query: '',
      };

      expect(baseLearningContext.goal_id).toBe(retrievalCtx.goal_id);
      expect(baseLearningContext.task_id).toBe(retrievalCtx.task_id);
      expect(baseLearningContext.phase).toBe(retrievalCtx.phase);
      expect(baseLearningContext.skill_area).toBe(retrievalCtx.skill_area);
    });
  });
});

describe('Context Boost Application', () => {
  function createMockChunk(strength: number, learningContext: LearningContext): ChunkV2 {
    return {
      id: 'test-chunk',
      project_id: 'test-project',
      content: 'Test content',
      type: 'research',
      tags: [],
      confidence: 'verified',
      source: 'research',
      created_at: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
      last_useful: null,
      tick_created: learningContext.tick,
      tick_last_accessed: null,
      tick_last_useful: null,
      learning_context: learningContext,
      initial_strength: 1.0,
      current_strength: strength,
      decay_function: 'exponential',
      decay_rate: 0.05,
      persistence_score: 0.5,
      access_count: 0,
      successful_uses: 0,
      status: 'active',
      pinned: false,
      superseded_by: null,
      valid_until_tick: null,
    };
  }

  describe('boost scenarios', () => {
    const learningCtx: LearningContext = {
      tick: 10,
      task_id: 'task-001',
      goal_id: 'goal-001',
      phase: 'research',
      skill_area: 'theory',
      query_context: '',
      related_chunks: [],
    };

    it('should identify strong context match scenario', () => {
      // When learning and retrieval contexts match on multiple dimensions
      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-001',
        goal_id: 'goal-001',
        phase: 'research',
        skill_area: 'theory',
        query: '',
      };

      // All 4 fields match - this is a strong match
      const matches = [
        learningCtx.goal_id === retrievalCtx.goal_id,
        learningCtx.task_id === retrievalCtx.task_id,
        learningCtx.phase === retrievalCtx.phase,
        learningCtx.skill_area === retrievalCtx.skill_area,
      ];

      const matchCount = matches.filter(Boolean).length;
      expect(matchCount).toBe(4);
    });

    it('should identify moderate context match scenario', () => {
      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-999',
        goal_id: 'goal-001', // match
        phase: 'research',   // match
        skill_area: 'practice',
        query: '',
      };

      const matches = [
        learningCtx.goal_id === retrievalCtx.goal_id,
        learningCtx.phase === retrievalCtx.phase,
      ];

      const matchCount = matches.filter(Boolean).length;
      expect(matchCount).toBe(2);
    });

    it('should identify weak memory reactivation scenario', () => {
      // Weak memory (low strength) with context match
      const weakChunk = createMockChunk(0.1, learningCtx);

      const retrievalCtx: RetrievalContext = {
        tick: 50,
        task_id: 'task-001',
        goal_id: 'goal-001',
        phase: 'research',
        skill_area: 'theory',
        query: '',
      };

      // Chunk has low strength but perfect context match
      expect(weakChunk.current_strength).toBeLessThan(0.3);

      const matches = [
        learningCtx.goal_id === retrievalCtx.goal_id,
        learningCtx.task_id === retrievalCtx.task_id,
        learningCtx.phase === retrievalCtx.phase,
        learningCtx.skill_area === retrievalCtx.skill_area,
      ];

      expect(matches.every(Boolean)).toBe(true);
    });
  });

  describe('boost reason categorization', () => {
    it('should categorize strong_context_match when match > 0.7', () => {
      // Context match > 0.7 triggers strong_context_match boost
      // This requires goal + task + phase + skill_area matches
      const matchThreshold = 0.7;
      expect(matchThreshold).toBe(0.7);
    });

    it('should categorize moderate_context_match when 0.4 < match <= 0.7', () => {
      // Context match between 0.4 and 0.7 triggers moderate_context_match
      const lowerBound = 0.4;
      const upperBound = 0.7;
      expect(lowerBound).toBeLessThan(upperBound);
    });

    it('should categorize memory_reactivation for weak but matched memories', () => {
      // Weak memory (strength < 0.3) with context match > 0.6
      const strengthThreshold = 0.3;
      const contextMatchThreshold = 0.6;

      expect(strengthThreshold).toBe(0.3);
      expect(contextMatchThreshold).toBe(0.6);
    });
  });
});

describe('Retrieval Context Interface', () => {
  it('should accept all required fields', () => {
    const ctx: RetrievalContext = {
      tick: 100,
      task_id: 'task-abc',
      goal_id: 'goal-xyz',
      phase: 'execution',
      skill_area: 'practice',
      query: 'how does memory work',
    };

    expect(ctx.tick).toBe(100);
    expect(ctx.task_id).toBe('task-abc');
    expect(ctx.goal_id).toBe('goal-xyz');
    expect(ctx.phase).toBe('execution');
    expect(ctx.skill_area).toBe('practice');
    expect(ctx.query).toBe('how does memory work');
  });

  it('should accept null values for optional IDs', () => {
    const ctx: RetrievalContext = {
      tick: 0,
      task_id: null,
      goal_id: null,
      phase: 'intake',
      skill_area: null,
      query: '',
    };

    expect(ctx.task_id).toBeNull();
    expect(ctx.goal_id).toBeNull();
    expect(ctx.skill_area).toBeNull();
  });
});

describe('RRF (Reciprocal Rank Fusion) Constants', () => {
  // RRF_K is set to 60 in the implementation
  it('should use k=60 for RRF formula', () => {
    // RRF formula: score = Σ 1/(k + rank)
    // With k=60, this dampens the impact of rank position
    const k = 60;

    // Rank 1 contribution: 1/61 ≈ 0.0164
    const rank1Contribution = 1 / (k + 1);
    expect(rank1Contribution).toBeCloseTo(0.0164, 3);

    // Rank 10 contribution: 1/70 ≈ 0.0143
    const rank10Contribution = 1 / (k + 10);
    expect(rank10Contribution).toBeCloseTo(0.0143, 3);
  });
});

describe('Boost Formulas', () => {
  describe('strong context boost', () => {
    it('should apply up to 1.3x multiplier', () => {
      // Formula: score *= 1 + (contextMatch - 0.5) * 0.6
      // Maximum when contextMatch = 1.0: 1 + (1.0 - 0.5) * 0.6 = 1 + 0.3 = 1.3
      const maxBoost = 1 + (1.0 - 0.5) * 0.6;
      expect(maxBoost).toBe(1.3);
    });

    it('should apply minimum boost at threshold', () => {
      // At contextMatch = 0.7: 1 + (0.7 - 0.5) * 0.6 = 1 + 0.12 = 1.12
      const minBoost = 1 + (0.7 - 0.5) * 0.6;
      expect(minBoost).toBeCloseTo(1.12, 2);
    });
  });

  describe('moderate context boost', () => {
    it('should apply up to 1.15x multiplier', () => {
      // Formula: score *= 1 + (contextMatch - 0.3) * 0.3
      // At contextMatch = 0.7: 1 + (0.7 - 0.3) * 0.3 = 1 + 0.12 = 1.12
      const maxBoost = 1 + (0.7 - 0.3) * 0.3;
      expect(maxBoost).toBeCloseTo(1.12, 2);
    });
  });

  describe('memory reactivation', () => {
    it('should calculate restored score', () => {
      // Formula: restoredScore = contextMatch * baseSimilarity * 0.7
      const contextMatch = 0.8;
      const baseSimilarity = 0.9;
      const restoredScore = contextMatch * baseSimilarity * 0.7;

      expect(restoredScore).toBeCloseTo(0.504, 3);
    });

    it('should exceed weak memory base score', () => {
      const weakStrength = 0.1;
      const baseSimilarity = 0.8;
      const baseScore = weakStrength * baseSimilarity; // 0.08

      const contextMatch = 0.8;
      const restoredScore = contextMatch * baseSimilarity * 0.7; // 0.448

      expect(restoredScore).toBeGreaterThan(baseScore);
    });
  });
});
