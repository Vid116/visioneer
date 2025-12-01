import { describe, it, expect } from 'vitest';
import {
  captureLearningContext,
  getDecaySettings,
  serializeLearningContext,
  parseLearningContext,
  ExecutionContext,
} from '../../src/memory/context-capture.js';
import { Orientation, Task, Phase, LearningContext } from '../../src/utils/types.js';

describe('Context Capture', () => {
  const mockOrientation: Orientation = {
    project_id: 'test-project',
    vision_summary: 'Test vision',
    success_criteria: ['Criterion 1', 'Criterion 2'],
    constraints: ['Constraint 1'],
    skill_map: [],
    current_phase: 'research' as Phase,
    key_decisions: [],
    active_priorities: ['Priority 1'],
    progress_snapshot: [],
    last_rewritten: new Date().toISOString(),
    version: 1,
  };

  const mockTask: Task = {
    id: 'task-001',
    project_id: 'test-project',
    title: 'Test Task',
    description: 'Test description',
    status: 'in_progress',
    skill_area: 'theory',
    depends_on: [],
    blocked_by: [],
    outcome: null,
    failure_reason: null,
    failure_context: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    failed_at: null,
  };

  describe('captureLearningContext', () => {
    it('should capture all context fields', () => {
      const execContext: ExecutionContext = {
        tick: 42,
        task: mockTask,
        goalId: 'goal-001',
        orientation: mockOrientation,
      };

      const context = captureLearningContext(execContext, 'test query', ['chunk-1', 'chunk-2']);

      expect(context.tick).toBe(42);
      expect(context.task_id).toBe('task-001');
      expect(context.goal_id).toBe('goal-001');
      expect(context.phase).toBe('research');
      expect(context.skill_area).toBe('theory');
      expect(context.query_context).toBe('test query');
      expect(context.related_chunks).toEqual(['chunk-1', 'chunk-2']);
    });

    it('should handle null task', () => {
      const execContext: ExecutionContext = {
        tick: 10,
        task: null,
        goalId: 'goal-001',
        orientation: mockOrientation,
      };

      const context = captureLearningContext(execContext, 'test', []);

      expect(context.task_id).toBeNull();
      expect(context.skill_area).toBeNull();
    });

    it('should handle null goal', () => {
      const execContext: ExecutionContext = {
        tick: 10,
        task: mockTask,
        goalId: null,
        orientation: mockOrientation,
      };

      const context = captureLearningContext(execContext, 'test', []);

      expect(context.goal_id).toBeNull();
    });

    it('should handle empty related chunks', () => {
      const execContext: ExecutionContext = {
        tick: 10,
        task: mockTask,
        goalId: 'goal-001',
        orientation: mockOrientation,
      };

      const context = captureLearningContext(execContext, 'test', []);

      expect(context.related_chunks).toEqual([]);
    });

    it('should capture current phase from orientation', () => {
      const executionOrientation: Orientation = {
        ...mockOrientation,
        current_phase: 'execution' as Phase,
      };

      const execContext: ExecutionContext = {
        tick: 10,
        task: mockTask,
        goalId: 'goal-001',
        orientation: executionOrientation,
      };

      const context = captureLearningContext(execContext, 'test', []);

      expect(context.phase).toBe('execution');
    });

    it('should handle different skill areas', () => {
      const practiceTask: Task = {
        ...mockTask,
        skill_area: 'practice',
      };

      const execContext: ExecutionContext = {
        tick: 10,
        task: practiceTask,
        goalId: 'goal-001',
        orientation: mockOrientation,
      };

      const context = captureLearningContext(execContext, 'test', []);

      expect(context.skill_area).toBe('practice');
    });
  });

  describe('getDecaySettings', () => {
    it('should return none for user_input', () => {
      const settings = getDecaySettings('user_input', []);

      expect(settings.function).toBe('none');
      expect(settings.rate).toBe(0);
    });

    it('should return linear for decision', () => {
      const settings = getDecaySettings('decision', []);

      expect(settings.function).toBe('linear');
      expect(settings.rate).toBe(0.02);
    });

    it('should return slow decay for goal-related tags', () => {
      const settings = getDecaySettings('research', ['goal', 'priority']);

      expect(settings.rate).toBe(0.02);
    });

    it('should return slow decay for priority tags', () => {
      const settings = getDecaySettings('research', ['priority']);

      expect(settings.rate).toBe(0.02);
    });

    it('should return fast decay for attempt', () => {
      const settings = getDecaySettings('attempt', []);

      expect(settings.function).toBe('exponential');
      expect(settings.rate).toBe(0.1);
    });

    it('should return default for research', () => {
      const settings = getDecaySettings('research', []);

      expect(settings.function).toBe('exponential');
      expect(settings.rate).toBe(0.05);
    });

    it('should return default for insight', () => {
      const settings = getDecaySettings('insight', []);

      expect(settings.function).toBe('exponential');
      expect(settings.rate).toBe(0.05);
    });

    it('should return default for unknown type', () => {
      const settings = getDecaySettings('unknown_type', []);

      expect(settings.function).toBe('exponential');
      expect(settings.rate).toBe(0.05);
    });

    it('should prioritize goal tags over type', () => {
      // Even if type is attempt (fast decay), goal tags should slow it down
      const settings = getDecaySettings('research', ['goal']);

      expect(settings.rate).toBe(0.02); // Slow rate due to goal tag
    });
  });

  describe('serialization', () => {
    it('should serialize learning context to JSON string', () => {
      const original: LearningContext = {
        tick: 42,
        task_id: 'task-001',
        goal_id: 'goal-001',
        phase: 'research',
        skill_area: 'theory',
        query_context: 'test query',
        related_chunks: ['a', 'b'],
      };

      const serialized = serializeLearningContext(original);

      expect(typeof serialized).toBe('string');
      expect(serialized).toContain('tick');
      expect(serialized).toContain('42');
    });

    it('should deserialize JSON string to learning context', () => {
      const json = JSON.stringify({
        tick: 42,
        task_id: 'task-001',
        goal_id: 'goal-001',
        phase: 'research',
        skill_area: 'theory',
        query_context: 'test query',
        related_chunks: ['a', 'b'],
      });

      const deserialized = parseLearningContext(json);

      expect(deserialized.tick).toBe(42);
      expect(deserialized.task_id).toBe('task-001');
      expect(deserialized.goal_id).toBe('goal-001');
      expect(deserialized.phase).toBe('research');
      expect(deserialized.skill_area).toBe('theory');
      expect(deserialized.query_context).toBe('test query');
      expect(deserialized.related_chunks).toEqual(['a', 'b']);
    });

    it('should serialize and deserialize correctly (round trip)', () => {
      const original: LearningContext = {
        tick: 42,
        task_id: 'task-001',
        goal_id: 'goal-001',
        phase: 'research',
        skill_area: 'theory',
        query_context: 'test query',
        related_chunks: ['a', 'b'],
      };

      const serialized = serializeLearningContext(original);
      const deserialized = parseLearningContext(serialized);

      expect(deserialized).toEqual(original);
    });

    it('should handle corrupted JSON gracefully', () => {
      const result = parseLearningContext('not valid json');

      expect(result.tick).toBe(0);
      expect(result.task_id).toBeNull();
      expect(result.goal_id).toBeNull();
      expect(result.phase).toBe('unknown');
      expect(result.skill_area).toBeNull();
      expect(result.query_context).toBe('');
      expect(result.related_chunks).toEqual([]);
    });

    it('should handle empty string gracefully', () => {
      const result = parseLearningContext('');

      expect(result.tick).toBe(0);
      expect(result.phase).toBe('unknown');
    });

    it('should handle null values in JSON', () => {
      const json = JSON.stringify({
        tick: 10,
        task_id: null,
        goal_id: null,
        phase: 'planning',
        skill_area: null,
        query_context: '',
        related_chunks: [],
      });

      const deserialized = parseLearningContext(json);

      expect(deserialized.tick).toBe(10);
      expect(deserialized.task_id).toBeNull();
      expect(deserialized.goal_id).toBeNull();
      expect(deserialized.skill_area).toBeNull();
    });
  });

  describe('ExecutionContext interface', () => {
    it('should accept valid execution context', () => {
      const execContext: ExecutionContext = {
        tick: 1,
        task: mockTask,
        goalId: 'goal-001',
        orientation: mockOrientation,
      };

      // Should not throw
      const context = captureLearningContext(execContext, 'query', []);
      expect(context).toBeDefined();
    });

    it('should accept minimal execution context', () => {
      const execContext: ExecutionContext = {
        tick: 0,
        task: null,
        goalId: null,
        orientation: mockOrientation,
      };

      const context = captureLearningContext(execContext, '', []);

      expect(context.tick).toBe(0);
      expect(context.task_id).toBeNull();
      expect(context.goal_id).toBeNull();
    });
  });

  describe('decay settings edge cases', () => {
    it('should handle empty tags array', () => {
      const settings = getDecaySettings('research', []);

      expect(settings.function).toBe('exponential');
      expect(settings.rate).toBe(0.05);
    });

    it('should handle tags with partial matches', () => {
      // Tags containing 'goal' substring should trigger slow decay
      const settings1 = getDecaySettings('research', ['main-goal']);
      const settings2 = getDecaySettings('research', ['goal-related']);

      expect(settings1.rate).toBe(0.02);
      expect(settings2.rate).toBe(0.02);
    });

    it('should handle tags with priority substring', () => {
      const settings = getDecaySettings('research', ['high-priority']);

      expect(settings.rate).toBe(0.02);
    });
  });
});
