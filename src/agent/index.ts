/**
 * Agent Module Exports
 *
 * Core agent functionality for Visioneer:
 * - Wake-up flow (state reconstruction)
 * - Task prioritization
 * - Work execution loop
 */

// Wake-up flow
export {
  wakeUp,
  canProceed,
  getStatusMessage,
  formatWakeUpSummary,
  type WakeTrigger,
  type WakeUpContext,
  type WakeUpResult,
  type WakeUpSummary,
} from "./wakeup.js";

// Task prioritization
export {
  prioritizeTasks,
  prioritizeTasksSimple,
  getActionableTasks,
  getNextTask,
  explainPrioritization,
  type ScoredTask,
  type ScoreFactors,
  type PrioritizationConfig,
} from "./prioritization.js";

// Work execution
export {
  executeWorkLoop,
  executeSingleTask,
  getSessionSummary,
  mockSuccessExecutor,
  mockBlockingExecutor,
  type TaskExecutor,
  type TaskResult,
  type TaskResultStatus,
  type Learning,
  type ExecutionSession,
  type ExecutionConfig,
} from "./execution.js";

// Claude API executor
export { createClaudeExecutor, claudeExecutor } from "./executor.js";

// Coherence checking
export {
  checkCoherence,
  enforceCoherence,
  batchCoherenceCheck,
  getCoherenceScore,
  type CoherenceCheckResult,
  type CoherenceConfig,
} from "./coherence.js";

// Orientation rewrite
export {
  rewriteOrientation,
  shouldRewriteOrientation,
  checkAndRewriteOrientation,
  type RewriteTrigger,
  type RewriteResult,
} from "./orientation-rewrite.js";
