import { getDatabase, prepareStatement } from '../db/connection.js';
import { TickState } from '../utils/types.js';
import { emitTickAdvance } from '../events/event-bus.js';

/**
 * Tick Manager - Cognitive Time Tracking
 *
 * Manages the "cognitive tick" which represents one cycle of agent activity.
 * Ticks are used for:
 * - **Memory decay**: Memories decay over ticks, not wall-clock time
 * - **Learning context**: Records which tick a memory was created/accessed
 * - **Scheduling**: Triggers decay and consolidation processes at intervals
 *
 * Unlike wall-clock time, cognitive ticks only advance when the agent is active,
 * making memory decay proportional to agent activity rather than elapsed time.
 *
 * @example
 * ```typescript
 * const manager = getTickManager(projectId);
 * await manager.initialize();
 *
 * // At start of each cycle
 * const tick = manager.incrementTick();
 * console.log(`Starting cycle ${tick}`);
 *
 * // Check if maintenance needed
 * if (manager.shouldRunDecay()) {
 *   runDecayProcess(projectId, tick, manager.getState().last_decay_tick);
 *   manager.markDecayRun();
 * }
 * ```
 *
 * @see {@link runDecayProcess} for decay implementation
 * @see {@link LearningContext} for how ticks are used in context capture
 */
export class TickManager {
  private projectId: string;
  private currentTick: number = 0;
  private initialized: boolean = false;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Initialize tick manager, loading or creating state
   */
  async initialize(): Promise<number> {
    const db = getDatabase();

    // Try to get existing state
    const stmt = prepareStatement(`
      SELECT * FROM agent_state WHERE project_id = ?
    `);
    const row = stmt.get(this.projectId) as TickState | undefined;

    if (row) {
      this.currentTick = row.current_tick;
    } else {
      // Create initial state
      const insertStmt = prepareStatement(`
        INSERT INTO agent_state (project_id, current_tick, last_decay_tick, last_consolidation_tick)
        VALUES (?, 0, 0, 0)
      `);
      insertStmt.run(this.projectId);
      this.currentTick = 0;
    }

    this.initialized = true;
    return this.currentTick;
  }

  /**
   * Increment tick at the START of each agent cycle
   */
  incrementTick(): number {
    if (!this.initialized) {
      throw new Error('TickManager not initialized. Call initialize() first.');
    }

    this.currentTick++;

    const stmt = prepareStatement(`
      UPDATE agent_state
      SET current_tick = ?, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ?
    `);
    stmt.run(this.currentTick, this.projectId);

    // Emit event for dashboard
    emitTickAdvance(this.currentTick);

    return this.currentTick;
  }

  /**
   * Get current tick without incrementing
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Check if decay should run (every N ticks)
   */
  shouldRunDecay(tickInterval: number = 1): boolean {
    const state = this.getState();
    return (this.currentTick - state.last_decay_tick) >= tickInterval;
  }

  /**
   * Mark that decay was run at current tick
   */
  markDecayRun(): void {
    const stmt = prepareStatement(`
      UPDATE agent_state
      SET last_decay_tick = ?, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ?
    `);
    stmt.run(this.currentTick, this.projectId);
  }

  /**
   * Check if consolidation should run
   */
  shouldRunConsolidation(tickInterval: number = 10): boolean {
    const state = this.getState();
    return (this.currentTick - state.last_consolidation_tick) >= tickInterval;
  }

  /**
   * Mark that consolidation was run
   */
  markConsolidationRun(): void {
    const stmt = prepareStatement(`
      UPDATE agent_state
      SET last_consolidation_tick = ?, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ?
    `);
    stmt.run(this.currentTick, this.projectId);
  }

  /**
   * Get full state
   */
  getState(): TickState {
    const stmt = prepareStatement(`
      SELECT * FROM agent_state WHERE project_id = ?
    `);
    return stmt.get(this.projectId) as TickState;
  }
}

// Singleton instances per project
const tickManagers = new Map<string, TickManager>();

/**
 * Get or create tick manager for a project
 */
export function getTickManager(projectId: string): TickManager {
  let manager = tickManagers.get(projectId);
  if (!manager) {
    manager = new TickManager(projectId);
    tickManagers.set(projectId, manager);
  }
  return manager;
}
