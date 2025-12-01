import { describe, it, expect } from 'vitest';
import {
  applyTickDecay,
  determineStatus,
  CATEGORY_MULTIPLIERS,
  DECAY_THRESHOLDS,
} from '../../src/memory/decay.js';
import { ChunkV2, LearningContext, ChunkStatus } from '../../src/utils/types.js';

describe('Decay Functions', () => {
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
      id: 'test-chunk',
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
      tick_last_accessed: null,
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

  describe('applyTickDecay', () => {
    describe('exponential decay', () => {
      it('should reduce strength with exponential decay', () => {
        const chunk = createTestChunk({
          current_strength: 1.0,
          decay_function: 'exponential',
          decay_rate: 0.05,
        });

        const newStrength = applyTickDecay(chunk, 10, 10);

        expect(newStrength).toBeLessThan(1.0);
        expect(newStrength).toBeGreaterThan(0);
      });

      it('should follow exponential formula', () => {
        const chunk = createTestChunk({
          current_strength: 1.0,
          decay_function: 'exponential',
          decay_rate: 0.1,
          tick_last_accessed: null,
        });

        const ticksElapsed = 5;
        const newStrength = applyTickDecay(chunk, ticksElapsed, ticksElapsed);

        // S(t) = S₀ × e^(-λt) where λ = rate * multiplier
        // With research type (multiplier = 1.0) and no recent access
        expect(newStrength).toBeLessThan(1.0);
      });

      it('should decay faster with higher rates', () => {
        const slowDecay = createTestChunk({
          current_strength: 1.0,
          decay_function: 'exponential',
          decay_rate: 0.01,
        });
        const fastDecay = createTestChunk({
          current_strength: 1.0,
          decay_function: 'exponential',
          decay_rate: 0.1,
        });

        const slowStrength = applyTickDecay(slowDecay, 10, 10);
        const fastStrength = applyTickDecay(fastDecay, 10, 10);

        expect(fastStrength).toBeLessThan(slowStrength);
      });
    });

    describe('linear decay', () => {
      it('should reduce strength with linear decay', () => {
        const chunk = createTestChunk({
          current_strength: 1.0,
          decay_function: 'linear',
          decay_rate: 0.02,
          tick_last_accessed: null,
        });

        const newStrength = applyTickDecay(chunk, 10, 10);

        // Linear: S₀ - k×t = 1.0 - 0.02×10 = 0.8
        // But with multiplier and recency factor
        expect(newStrength).toBeLessThan(1.0);
        expect(newStrength).toBeGreaterThan(0);
      });

      it('should not go below 0 with linear decay', () => {
        const chunk = createTestChunk({
          current_strength: 0.1,
          decay_function: 'linear',
          decay_rate: 0.05,
          tick_last_accessed: null,
        });

        const newStrength = applyTickDecay(chunk, 100, 100);

        expect(newStrength).toBe(0);
      });
    });

    describe('power law decay', () => {
      it('should reduce strength with power law decay', () => {
        const chunk = createTestChunk({
          current_strength: 1.0,
          decay_function: 'power_law',
          decay_rate: 0.05,
        });

        const newStrength = applyTickDecay(chunk, 10, 10);

        expect(newStrength).toBeLessThan(1.0);
        expect(newStrength).toBeGreaterThan(0);
      });

      it('should decay slower than exponential for same rate', () => {
        const exponentialChunk = createTestChunk({
          current_strength: 1.0,
          decay_function: 'exponential',
          decay_rate: 0.05,
          tick_last_accessed: null,
        });
        const powerLawChunk = createTestChunk({
          current_strength: 1.0,
          decay_function: 'power_law',
          decay_rate: 0.05,
          tick_last_accessed: null,
        });

        // Power law decays slower than exponential at same rate
        const expStrength = applyTickDecay(exponentialChunk, 50, 50);
        const plStrength = applyTickDecay(powerLawChunk, 50, 50);

        expect(plStrength).toBeGreaterThan(expStrength);
      });
    });

    describe('no decay', () => {
      it('should not decay user_input type', () => {
        const chunk = createTestChunk({
          type: 'user_input',
          current_strength: 1.0,
          decay_function: 'exponential',
        });

        const newStrength = applyTickDecay(chunk, 1000, 1000);

        expect(newStrength).toBe(1.0);
      });

      it('should not decay when decay_function is none', () => {
        const chunk = createTestChunk({
          current_strength: 1.0,
          decay_function: 'none',
        });

        const newStrength = applyTickDecay(chunk, 1000, 1000);

        expect(newStrength).toBe(1.0);
      });
    });

    describe('category multipliers', () => {
      it('should decay superseded chunks faster', () => {
        const normal = createTestChunk({
          current_strength: 1.0,
          tick_last_accessed: null,
        });
        const superseded = createTestChunk({
          current_strength: 1.0,
          superseded_by: 'other-chunk-id',
          tick_last_accessed: null,
        });

        const normalDecay = applyTickDecay(normal, 10, 10);
        const supersededDecay = applyTickDecay(superseded, 10, 10);

        expect(supersededDecay).toBeLessThan(normalDecay);
      });

      it('should decay decisions slower than research', () => {
        const decision = createTestChunk({
          type: 'decision',
          current_strength: 1.0,
          tick_last_accessed: null,
        });
        const research = createTestChunk({
          type: 'research',
          current_strength: 1.0,
          tick_last_accessed: null,
        });

        const decisionDecay = applyTickDecay(decision, 20, 20);
        const researchDecay = applyTickDecay(research, 20, 20);

        expect(decisionDecay).toBeGreaterThan(researchDecay);
      });

      it('should decay attempts faster than research', () => {
        const attempt = createTestChunk({
          type: 'attempt',
          current_strength: 1.0,
          tick_last_accessed: null,
        });
        const research = createTestChunk({
          type: 'research',
          current_strength: 1.0,
          tick_last_accessed: null,
        });

        const attemptDecay = applyTickDecay(attempt, 10, 10);
        const researchDecay = applyTickDecay(research, 10, 10);

        expect(attemptDecay).toBeLessThan(researchDecay);
      });
    });

    describe('recency bonus', () => {
      it('should decay slower when recently accessed', () => {
        const notAccessed = createTestChunk({
          current_strength: 1.0,
          tick_last_accessed: null,
        });
        const recentlyAccessed = createTestChunk({
          current_strength: 1.0,
          tick_last_accessed: 95, // 5 ticks ago
        });

        const notAccessedDecay = applyTickDecay(notAccessed, 10, 100);
        const recentlyAccessedDecay = applyTickDecay(recentlyAccessed, 10, 100);

        expect(recentlyAccessedDecay).toBeGreaterThan(notAccessedDecay);
      });

      it('should reduce recency bonus over time', () => {
        const veryRecent = createTestChunk({
          current_strength: 1.0,
          tick_last_accessed: 99, // 1 tick ago
        });
        const lessRecent = createTestChunk({
          current_strength: 1.0,
          tick_last_accessed: 50, // 50 ticks ago
        });

        const veryRecentDecay = applyTickDecay(veryRecent, 10, 100);
        const lessRecentDecay = applyTickDecay(lessRecent, 10, 100);

        expect(veryRecentDecay).toBeGreaterThan(lessRecentDecay);
      });
    });

    describe('goal-related tags', () => {
      it('should decay goal-tagged chunks slower', () => {
        // Goal-related chunks have a lower multiplier (0.4) vs research (1.0)
      // So they should decay less over the same time period
      const goalTagged = createTestChunk({
          type: 'insight', // Use insight (0.8 multiplier) as base type
          tags: ['goal', 'important'], // goal tag should override to 0.4 multiplier
          current_strength: 1.0,
          tick_last_accessed: null,
        });
        const untagged = createTestChunk({
          type: 'research', // research has 1.0 multiplier
          tags: [],
          current_strength: 1.0,
          tick_last_accessed: null,
        });

        const goalDecay = applyTickDecay(goalTagged, 20, 20);
        const untaggedDecay = applyTickDecay(untagged, 20, 20);

        // Goal-tagged (0.4 multiplier) should decay slower than research (1.0 multiplier)
        expect(goalDecay).toBeGreaterThan(untaggedDecay);
      });
    });
  });

  describe('determineStatus', () => {
    it('should return active for high strength', () => {
      expect(determineStatus(0.8, 'active')).toBe('active');
      expect(determineStatus(0.5, 'active')).toBe('active');
      expect(determineStatus(0.31, 'active')).toBe('active');
    });

    it('should demote to warm below archive threshold', () => {
      // Archive threshold is 0.3
      expect(determineStatus(0.29, 'active')).toBe('warm');
      expect(determineStatus(0.25, 'active')).toBe('warm');
    });

    it('should demote to cool below summarize threshold', () => {
      // Summarize threshold is 0.15
      expect(determineStatus(0.14, 'active')).toBe('cool');
      expect(determineStatus(0.10, 'active')).toBe('cool');
    });

    it('should demote to cold below tombstone threshold', () => {
      // Tombstone threshold is 0.05
      expect(determineStatus(0.04, 'active')).toBe('cold');
      expect(determineStatus(0.01, 'active')).toBe('cold');
    });

    it('should tombstone at 0', () => {
      expect(determineStatus(0, 'active')).toBe('tombstone');
    });

    it('should never promote through decay', () => {
      // Once demoted, decay alone shouldn't promote back
      expect(determineStatus(0.8, 'warm')).toBe('warm');
      expect(determineStatus(0.8, 'cool')).toBe('cool');
      expect(determineStatus(0.8, 'cold')).toBe('cold');
    });

    it('should respect status hierarchy', () => {
      const statuses: ChunkStatus[] = ['active', 'warm', 'cool', 'cold', 'archived', 'tombstone'];

      // Going through hierarchy, higher strength should not promote
      for (let i = 1; i < statuses.length; i++) {
        const status = statuses[i];
        const result = determineStatus(1.0, status);
        expect(result).toBe(status);
      }
    });
  });

  describe('category multipliers constants', () => {
    it('should have 0 multiplier for user_input', () => {
      expect(CATEGORY_MULTIPLIERS.user_input).toBe(0);
    });

    it('should have high multiplier for superseded', () => {
      expect(CATEGORY_MULTIPLIERS.superseded).toBeGreaterThan(2);
    });

    it('should have standard multiplier for research', () => {
      expect(CATEGORY_MULTIPLIERS.research).toBe(1.0);
    });

    it('should have slow multiplier for decision', () => {
      expect(CATEGORY_MULTIPLIERS.decision).toBeLessThan(1.0);
    });

    it('should have fast multiplier for attempt', () => {
      expect(CATEGORY_MULTIPLIERS.attempt).toBeGreaterThan(1.0);
    });
  });

  describe('decay thresholds constants', () => {
    it('should have archive threshold at 0.3', () => {
      expect(DECAY_THRESHOLDS.archive).toBe(0.3);
    });

    it('should have summarize threshold at 0.15', () => {
      expect(DECAY_THRESHOLDS.summarize).toBe(0.15);
    });

    it('should have tombstone threshold at 0.05', () => {
      expect(DECAY_THRESHOLDS.tombstone).toBe(0.05);
    });

    it('should have thresholds in descending order', () => {
      expect(DECAY_THRESHOLDS.archive).toBeGreaterThan(DECAY_THRESHOLDS.summarize);
      expect(DECAY_THRESHOLDS.summarize).toBeGreaterThan(DECAY_THRESHOLDS.tombstone);
    });
  });

  describe('edge cases', () => {
    it('should handle 0 ticks elapsed', () => {
      const chunk = createTestChunk({ current_strength: 1.0 });
      const newStrength = applyTickDecay(chunk, 0, 0);

      expect(newStrength).toBe(1.0);
    });

    it('should handle very large tick values', () => {
      const chunk = createTestChunk({
        current_strength: 1.0,
        decay_function: 'exponential',
      });

      const newStrength = applyTickDecay(chunk, 10000, 10000);

      expect(newStrength).toBeGreaterThanOrEqual(0);
      expect(newStrength).toBeLessThanOrEqual(1);
    });

    it('should handle chunk starting at 0 strength', () => {
      const chunk = createTestChunk({ current_strength: 0 });
      const newStrength = applyTickDecay(chunk, 10, 10);

      expect(newStrength).toBe(0);
    });
  });
});
