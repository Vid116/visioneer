/**
 * Event Bus for Visioneer
 *
 * Emits events for dashboard monitoring.
 * Events are buffered and can be retrieved via API or WebSocket.
 */

import { EventEmitter } from 'events';

export type VisioneerEventType =
  | 'tick:advance'
  | 'chunk:created'
  | 'chunk:accessed'
  | 'chunk:decayed'
  | 'chunk:status_changed'
  | 'relationship:created'
  | 'search:executed'
  | 'contradiction:detected'
  | 'goal:started'
  | 'goal:completed'
  | 'goal:failed'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'agent:thinking'
  | 'agent:action'
  | 'agent:output'
  | 'agent:error'
  | 'agent:started'
  | 'agent:stopped'
  | 'reranker:called'
  | 'error:occurred';

export interface VisioneerEvent {
  id: string;
  type: VisioneerEventType;
  timestamp: Date;
  tick: number;
  data: Record<string, unknown>;
}

class EventBus extends EventEmitter {
  private buffer: VisioneerEvent[] = [];
  private maxBufferSize = 1000;
  private currentTick = 0;

  emitEvent(type: VisioneerEventType, data: Record<string, unknown> = {}): boolean {
    const event: VisioneerEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: new Date(),
      tick: this.currentTick,
      data,
    };

    this.buffer.push(event);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    return super.emit('event', event);
  }

  setTick(tick: number): void {
    this.currentTick = tick;
  }

  getTick(): number {
    return this.currentTick;
  }

  getRecentEvents(limit = 100): VisioneerEvent[] {
    return this.buffer.slice(-limit);
  }

  getEventsSince(sinceId: string): VisioneerEvent[] {
    const idx = this.buffer.findIndex((e) => e.id === sinceId);
    if (idx === -1) return this.buffer.slice(-100);
    return this.buffer.slice(idx + 1);
  }

  clearBuffer(): void {
    this.buffer = [];
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Helper functions for common events
export function emitChunkCreated(chunk: {
  id: string;
  type: string;
  content: string;
}): void {
  eventBus.emitEvent('chunk:created', {
    chunkId: chunk.id,
    type: chunk.type,
    contentPreview: chunk.content.slice(0, 100),
  });
}

export function emitChunkAccessed(chunkId: string): void {
  eventBus.emitEvent('chunk:accessed', { chunkId });
}

export function emitChunkDecayed(
  chunkId: string,
  oldStrength: number,
  newStrength: number
): void {
  eventBus.emitEvent('chunk:decayed', { chunkId, oldStrength, newStrength });
}

export function emitChunkStatusChanged(
  chunkId: string,
  oldStatus: string,
  newStatus: string
): void {
  eventBus.emitEvent('chunk:status_changed', { chunkId, oldStatus, newStatus });
}

export function emitRelationshipCreated(rel: {
  fromId: string;
  toId: string;
  type: string;
  weight: number;
}): void {
  eventBus.emitEvent('relationship:created', {
    fromId: rel.fromId,
    toId: rel.toId,
    type: rel.type,
    weight: rel.weight,
  });
}

export function emitSearchExecuted(
  query: string,
  resultCount: number,
  timeMs: number
): void {
  eventBus.emitEvent('search:executed', {
    query,
    resultCount,
    timeMs,
  });
}

export function emitContradictionDetected(
  chunkA: string,
  chunkB: string,
  confidence: number
): void {
  eventBus.emitEvent('contradiction:detected', {
    chunkA,
    chunkB,
    confidence,
  });
}

export function emitAgentThinking(thought: string): void {
  eventBus.emitEvent('agent:thinking', { thought: thought.slice(0, 500) });
}

export function emitAgentAction(
  action: string,
  details: Record<string, unknown>
): void {
  eventBus.emitEvent('agent:action', { action, ...details });
}

export function emitAgentOutput(output: string): void {
  eventBus.emitEvent('agent:output', { output });
}

export function emitAgentError(error: string): void {
  eventBus.emitEvent('agent:error', { error });
}

export function emitGoalStarted(goalId: string, directive: string): void {
  eventBus.emitEvent('goal:started', { goalId, directive });
}

export function emitGoalCompleted(goalId: string): void {
  eventBus.emitEvent('goal:completed', { goalId });
}

export function emitGoalFailed(goalId: string, error: string): void {
  eventBus.emitEvent('goal:failed', { goalId, error });
}

export function emitTaskStarted(taskId: string, title: string): void {
  eventBus.emitEvent('task:started', { taskId, title });
}

export function emitTaskCompleted(taskId: string): void {
  eventBus.emitEvent('task:completed', { taskId });
}

export function emitTaskFailed(taskId: string, error: string): void {
  eventBus.emitEvent('task:failed', { taskId, error });
}

export function emitTickAdvance(tick: number): void {
  eventBus.setTick(tick);
  eventBus.emitEvent('tick:advance', { tick });
}

export function emitRerankerCalled(
  query: string,
  candidateCount: number,
  timeMs: number
): void {
  eventBus.emitEvent('reranker:called', { query, candidateCount, timeMs });
}
