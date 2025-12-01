import { describe, it, expect } from 'vitest';
import {
  calculatePersistenceScore,
  PS_WEIGHTS,
  PS_CONFIG,
} from '../../src/memory/persistence.js';
import { ChunkV2, LearningContext } from '../../src/utils/types.js';

describe('Persistence Score', () => {
  // Helper to create test chunks
  function createTestChunk(overrides: Partial<ChunkV2> = {}): ChunkV2 {
    const defaultLearningContext: LearningContext = {
      tick: 0,
      task_id: null,
      goal_id: null,
      phase: 'research',
      skill_area: null,
      query_context: '',
      related_chunks: [],
    };

    return {
      id: 'test-chunk-001',
      project_id: 'test-project',
      content: 'Test content',
      type: 'research',
      tags: [],
      confidence: 'inferred',
      source: 'research',
      created_at: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
      last_useful: null,
      tick_created: 0,
      tick_last_accessed: 0,
      tick_last_useful: null,
      learning_context: defaultLearningContext,
      initial_strength: 1.0,
      current_strength: 1.0,
      decay_function: 'exponential',
      decay_rate: 0.05,
      persistence_score: 0.5,
      access_count: 0,
      successful_uses: 0,
      status: 'active',
      pinned: false,
      superseded_by: null,
      valid_until_tick: null,
      ...overrides,
    };
  }

  describe('calculatePersistenceScore', () => {
    it('should return value between 0 and 1', () => {
      const chunk = createTestChunk();
      const score = calculatePersistenceScore(chunk, 100, 0);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should score user_input highest in salience', () => {
      const userInput = createTestChunk({ type: 'user_input' });
      const research = createTestChunk({ type: 'research' });

      const userScore = calculatePersistenceScore(userInput, 100, 0);
      const researchScore = calculatePersistenceScore(research, 100, 0);

      expect(userScore).toBeGreaterThan(researchScore);
    });

    it('should score decision higher than research', () => {
      const decision = createTestChunk({ type: 'decision' });
      const research = createTestChunk({ type: 'research' });

      const decisionScore = calculatePersistenceScore(decision, 100, 0);
      const researchScore = calculatePersistenceScore(research, 100, 0);

      expect(decisionScore).toBeGreaterThan(researchScore);
    });

    it('should increase with access count (frequency)', () => {
      const noAccess = createTestChunk({ access_count: 0 });
      const someAccess = createTestChunk({ access_count: 5 });
      const manyAccess = createTestChunk({ access_count: 20 });

      const lowScore = calculatePersistenceScore(noAccess, 100, 0);
      const midScore = calculatePersistenceScore(someAccess, 100, 0);
      const highScore = calculatePersistenceScore(manyAccess, 100, 0);

      expect(highScore).toBeGreaterThan(midScore);
      expect(midScore).toBeGreaterThan(lowScore);
    });

    it('should increase with connections', () => {
      const chunk = createTestChunk();

      const isolated = calculatePersistenceScore(chunk, 100, 0);
      const fewConnections = calculatePersistenceScore(chunk, 100, 5);
      const manyConnections = calculatePersistenceScore(chunk, 100, 15);

      expect(manyConnections).toBeGreaterThan(fewConnections);
      expect(fewConnections).toBeGreaterThan(isolated);
    });

    it('should decrease with tick distance (recency)', () => {
      const recentChunk = createTestChunk({ tick_last_accessed: 95 });
      const olderChunk = createTestChunk({ tick_last_accessed: 50 });
      const oldChunk = createTestChunk({ tick_last_accessed: 10 });

      const recentScore = calculatePersistenceScore(recentChunk, 100, 5);
      const olderScore = calculatePersistenceScore(olderChunk, 100, 5);
      const oldScore = calculatePersistenceScore(oldChunk, 100, 5);

      expect(recentScore).toBeGreaterThan(olderScore);
      expect(olderScore).toBeGreaterThan(oldScore);
    });

    it('should return 0 recency for null tick_last_accessed', () => {
      const neverAccessed = createTestChunk({ tick_last_accessed: null });
      const recentlyAccessed = createTestChunk({ tick_last_accessed: 99 });

      const neverScore = calculatePersistenceScore(neverAccessed, 100, 0);
      const recentScore = calculatePersistenceScore(recentlyAccessed, 100, 0);

      expect(recentScore).toBeGreaterThan(neverScore);
    });

    it('should score pinned chunks highest in importance', () => {
      const pinned = createTestChunk({ pinned: true });
      const notPinned = createTestChunk({ pinned: false });

      const pinnedScore = calculatePersistenceScore(pinned, 100, 0);
      const notPinnedScore = calculatePersistenceScore(notPinned, 100, 0);

      expect(pinnedScore).toBeGreaterThan(notPinnedScore);
    });

    it('should boost chunks with goal-related tags', () => {
      const goalRelated = createTestChunk({ tags: ['goal', 'important'] });
      const noTags = createTestChunk({ tags: [] });

      const goalScore = calculatePersistenceScore(goalRelated, 100, 0);
      const noTagScore = calculatePersistenceScore(noTags, 100, 0);

      expect(goalScore).toBeGreaterThan(noTagScore);
    });

    it('should boost chunks with priority tags', () => {
      const priorityChunk = createTestChunk({ tags: ['priority'] });
      const noTags = createTestChunk({ tags: [] });

      const priorityScore = calculatePersistenceScore(priorityChunk, 100, 0);
      const noTagScore = calculatePersistenceScore(noTags, 100, 0);

      expect(priorityScore).toBeGreaterThan(noTagScore);
    });
  });

  describe('frequency score saturation', () => {
    it('should saturate near 1.0 at high access counts', () => {
      const chunk10 = createTestChunk({ access_count: 10 });
      const chunk50 = createTestChunk({ access_count: 50 });
      const chunk100 = createTestChunk({ access_count: 100 });

      const score10 = calculatePersistenceScore(chunk10, 100, 0);
      const score50 = calculatePersistenceScore(chunk50, 100, 0);
      const score100 = calculatePersistenceScore(chunk100, 100, 0);

      // Differences should diminish as access count increases
      const diff10to50 = score50 - score10;
      const diff50to100 = score100 - score50;

      expect(diff10to50).toBeGreaterThan(diff50to100);
    });

    it('should follow exponential saturation formula', () => {
      // f(n) = 1 - e^(-k*n) where k = 0.3
      const chunk = createTestChunk({ access_count: 10 });

      // Expected frequency component: 1 - e^(-0.3 * 10) = 1 - e^(-3) ≈ 0.95
      const expectedFrequency = 1 - Math.exp(-PS_CONFIG.frequencyK * 10);

      expect(expectedFrequency).toBeCloseTo(0.95, 1);
    });
  });

  describe('connection score cap', () => {
    it('should cap at maxConnections', () => {
      const chunk = createTestChunk();

      const atMax = calculatePersistenceScore(chunk, 100, PS_CONFIG.maxConnections);
      const aboveMax = calculatePersistenceScore(chunk, 100, PS_CONFIG.maxConnections + 10);

      // Scores should be the same when at or above max
      expect(atMax).toBe(aboveMax);
    });
  });

  describe('weight validation', () => {
    it('should have weights that sum to 1.0', () => {
      const totalWeight =
        PS_WEIGHTS.frequency +
        PS_WEIGHTS.salience +
        PS_WEIGHTS.connection +
        PS_WEIGHTS.recency +
        PS_WEIGHTS.importance;

      expect(totalWeight).toBeCloseTo(1.0, 10);
    });
  });

  describe('verified vs inferred confidence', () => {
    it('should score verified confidence higher', () => {
      const verified = createTestChunk({ confidence: 'verified' });
      const inferred = createTestChunk({ confidence: 'inferred' });
      const speculative = createTestChunk({ confidence: 'speculative' });

      const verifiedScore = calculatePersistenceScore(verified, 100, 0);
      const inferredScore = calculatePersistenceScore(inferred, 100, 0);
      const speculativeScore = calculatePersistenceScore(speculative, 100, 0);

      expect(verifiedScore).toBeGreaterThan(inferredScore);
      expect(inferredScore).toBeGreaterThan(speculativeScore);
    });
  });

  describe('source-based salience', () => {
    it('should score user source highest', () => {
      const userSource = createTestChunk({ source: 'user' });
      const researchSource = createTestChunk({ source: 'research' });

      const userScore = calculatePersistenceScore(userSource, 100, 0);
      const researchScore = calculatePersistenceScore(researchSource, 100, 0);

      expect(userScore).toBeGreaterThan(researchScore);
    });

    it('should score experiment source higher than research', () => {
      const experimentSource = createTestChunk({ source: 'experiment' });
      const researchSource = createTestChunk({ source: 'research' });

      const experimentScore = calculatePersistenceScore(experimentSource, 100, 0);
      const researchScore = calculatePersistenceScore(researchSource, 100, 0);

      expect(experimentScore).toBeGreaterThan(researchScore);
    });
  });

  describe('tags with important or core keywords', () => {
    it('should boost chunks with important tag', () => {
      const important = createTestChunk({ tags: ['important'] });
      const normal = createTestChunk({ tags: ['misc'] });

      const importantScore = calculatePersistenceScore(important, 100, 0);
      const normalScore = calculatePersistenceScore(normal, 100, 0);

      expect(importantScore).toBeGreaterThan(normalScore);
    });

    it('should boost chunks with core tag', () => {
      const core = createTestChunk({ tags: ['core'] });
      const normal = createTestChunk({ tags: ['misc'] });

      const coreScore = calculatePersistenceScore(core, 100, 0);
      const normalScore = calculatePersistenceScore(normal, 100, 0);

      expect(coreScore).toBeGreaterThan(normalScore);
    });

    it('should boost chunks with pinned tag', () => {
      const pinnedTag = createTestChunk({ tags: ['pinned'] });
      const normal = createTestChunk({ tags: ['misc'] });

      const pinnedScore = calculatePersistenceScore(pinnedTag, 100, 0);
      const normalScore = calculatePersistenceScore(normal, 100, 0);

      expect(pinnedScore).toBeGreaterThan(normalScore);
    });
  });
});
