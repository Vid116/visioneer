import { LearningContext, Task, Orientation, DecayFunction } from '../utils/types.js';

/**
 * Current execution context (passed around during task execution)
 */
export interface ExecutionContext {
  tick: number;
  task: Task | null;
  goalId: string | null;
  orientation: Orientation;
}

/**
 * Capture learning context when storing a new chunk
 */
export function captureLearningContext(
  execContext: ExecutionContext,
  queryContext: string,
  relatedChunkIds: string[] = []
): LearningContext {
  return {
    tick: execContext.tick,
    task_id: execContext.task?.id ?? null,
    goal_id: execContext.goalId,
    phase: execContext.orientation.current_phase,
    skill_area: execContext.task?.skill_area ?? null,
    query_context: queryContext,
    related_chunks: relatedChunkIds,
  };
}

/**
 * Get decay settings based on chunk type and tags
 */
export function getDecaySettings(
  type: string,
  tags: string[]
): { function: DecayFunction; rate: number } {
  // User input never decays
  if (type === 'user_input') {
    return { function: 'none', rate: 0 };
  }

  // Decisions decay slowly (linear)
  if (type === 'decision') {
    return { function: 'linear', rate: 0.02 };
  }

  // Goal-related content decays slowly
  if (tags.some(t => t.includes('goal') || t.includes('priority'))) {
    return { function: 'exponential', rate: 0.02 };
  }

  // Attempts decay faster
  if (type === 'attempt') {
    return { function: 'exponential', rate: 0.1 };
  }

  // Default: standard exponential
  return { function: 'exponential', rate: 0.05 };
}

/**
 * Serialize learning context for storage
 */
export function serializeLearningContext(ctx: LearningContext): string {
  return JSON.stringify(ctx);
}

/**
 * Parse learning context from storage
 */
export function parseLearningContext(json: string): LearningContext {
  try {
    return JSON.parse(json);
  } catch {
    // Return default for corrupted data
    return {
      tick: 0,
      task_id: null,
      goal_id: null,
      phase: 'unknown',
      skill_area: null,
      query_context: '',
      related_chunks: [],
    };
  }
}
