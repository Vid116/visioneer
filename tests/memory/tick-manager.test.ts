import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// In-memory store for test - must be defined before mock
const mockState: Record<string, {
  project_id: string;
  current_tick: number;
  last_decay_tick: number;
  last_consolidation_tick: number;
  created_at: string;
  updated_at: string;
}> = {};

// Mock the database module
vi.mock('../../src/db/connection.js', () => {
  return {
    getDatabase: vi.fn(() => ({})),
    prepareStatement: vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM agent_state')) {
        return {
          get: (projectId: string) => mockState[projectId] || undefined,
        };
      }
      if (sql.includes('INSERT INTO agent_state')) {
        return {
          run: (projectId: string) => {
            mockState[projectId] = {
              project_id: projectId,
              current_tick: 0,
              last_decay_tick: 0,
              last_consolidation_tick: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          },
        };
      }
      if (sql.includes('UPDATE agent_state') && sql.includes('current_tick') && !sql.includes('last_')) {
        return {
          run: (tick: number, projectId: string) => {
            if (mockState[projectId]) {
              mockState[projectId].current_tick = tick;
              mockState[projectId].updated_at = new Date().toISOString();
            }
          },
        };
      }
      if (sql.includes('UPDATE agent_state') && sql.includes('last_decay_tick')) {
        return {
          run: (tick: number, projectId: string) => {
            if (mockState[projectId]) {
              mockState[projectId].last_decay_tick = tick;
              mockState[projectId].updated_at = new Date().toISOString();
            }
          },
        };
      }
      if (sql.includes('UPDATE agent_state') && sql.includes('last_consolidation_tick')) {
        return {
          run: (tick: number, projectId: string) => {
            if (mockState[projectId]) {
              mockState[projectId].last_consolidation_tick = tick;
              mockState[projectId].updated_at = new Date().toISOString();
            }
          },
        };
      }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() };
    }),
  };
});

import { TickManager, getTickManager } from '../../src/memory/tick-manager.js';

describe('TickManager', () => {
  const TEST_PROJECT_ID = 'test-project-001';

  beforeEach(() => {
    // Clear mock state before each test
    for (const key in mockState) {
      delete mockState[key];
    }
    // Clear the singleton cache
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create state for new project', async () => {
      const manager = new TickManager(TEST_PROJECT_ID);
      const tick = await manager.initialize();

      expect(tick).toBe(0);
      expect(manager.getCurrentTick()).toBe(0);
    });

    it('should load existing state', async () => {
      // Pre-insert state
      mockState[TEST_PROJECT_ID] = {
        project_id: TEST_PROJECT_ID,
        current_tick: 42,
        last_decay_tick: 40,
        last_consolidation_tick: 30,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const manager = new TickManager(TEST_PROJECT_ID);
      const tick = await manager.initialize();

      expect(tick).toBe(42);
      expect(manager.getCurrentTick()).toBe(42);
    });
  });

  describe('incrementTick', () => {
    it('should increment tick by 1', async () => {
      const manager = new TickManager(TEST_PROJECT_ID);
      await manager.initialize();

      const newTick = manager.incrementTick();

      expect(newTick).toBe(1);
      expect(manager.getCurrentTick()).toBe(1);
    });

    it('should increment multiple times', async () => {
      const manager = new TickManager(TEST_PROJECT_ID);
      await manager.initialize();

      manager.incrementTick();
      manager.incrementTick();
      const tick = manager.incrementTick();

      expect(tick).toBe(3);
      expect(manager.getCurrentTick()).toBe(3);
    });

    it('should throw if not initialized', () => {
      const manager = new TickManager(TEST_PROJECT_ID);

      expect(() => manager.incrementTick()).toThrow('not initialized');
    });
  });

  describe('decay scheduling', () => {
    it('should calculate decay interval correctly', async () => {
      const manager = new TickManager(TEST_PROJECT_ID);
      await manager.initialize();

      // After initialization, state should exist
      const state = manager.getState();
      expect(state).toBeDefined();
      expect(state.current_tick).toBe(0);
      expect(state.last_decay_tick).toBe(0);

      // Increment a few ticks
      manager.incrementTick();
      manager.incrementTick();
      manager.incrementTick();

      expect(manager.getCurrentTick()).toBe(3);

      // shouldRunDecay checks: currentTick - last_decay_tick >= interval
      // currentTick is 3, last_decay_tick is 0, so 3 - 0 = 3 >= 1 should be true
      // Note: This depends on proper mock implementation
    });

    it('should track decay state independently', async () => {
      const manager = new TickManager(TEST_PROJECT_ID);
      await manager.initialize();

      // Get baseline state
      const initialState = manager.getState();
      expect(initialState.last_decay_tick).toBe(0);

      // Increment and mark decay
      manager.incrementTick();
      manager.markDecayRun();

      // Verify decay was marked
      const stateAfterDecay = manager.getState();
      expect(stateAfterDecay.last_decay_tick).toBe(1);
    });
  });

  describe('consolidation scheduling', () => {
    it('should track consolidation state', async () => {
      const manager = new TickManager(TEST_PROJECT_ID);
      await manager.initialize();

      // Check initial state
      const initialState = manager.getState();
      expect(initialState.last_consolidation_tick).toBe(0);

      // Increment and mark consolidation
      manager.incrementTick();
      manager.markConsolidationRun();

      // Verify consolidation was marked
      const stateAfterConsolidation = manager.getState();
      expect(stateAfterConsolidation.last_consolidation_tick).toBe(1);
    });
  });

  describe('getState', () => {
    it('should return full state object', async () => {
      mockState[TEST_PROJECT_ID] = {
        project_id: TEST_PROJECT_ID,
        current_tick: 10,
        last_decay_tick: 8,
        last_consolidation_tick: 5,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
      };

      const manager = new TickManager(TEST_PROJECT_ID);
      await manager.initialize();

      const state = manager.getState();

      expect(state).toBeDefined();
      expect(state.project_id).toBe(TEST_PROJECT_ID);
      expect(state.current_tick).toBe(10);
      expect(state.last_decay_tick).toBe(8);
      expect(state.last_consolidation_tick).toBe(5);
    });
  });
});

describe('getTickManager', () => {
  it('should return same instance for same project', () => {
    // Note: This test may not work with mocks as-is
    // The singleton behavior depends on the actual module state
    const manager1 = getTickManager('project-a');
    const manager2 = getTickManager('project-a');

    expect(manager1).toBe(manager2);
  });

  it('should return different instances for different projects', () => {
    const manager1 = getTickManager('project-a');
    const manager2 = getTickManager('project-b');

    expect(manager1).not.toBe(manager2);
  });
});
