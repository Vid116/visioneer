/**
 * Message Logger
 *
 * Captures and stores all messages exchanged with the LLM
 * for dashboard visualization.
 */

import { EventEmitter } from 'events';
import Database from 'better-sqlite3';
import path from 'path';
import { eventBus } from '../events/event-bus.js';

export interface LoggedMessage {
  id: string;
  sessionId: string;
  taskId?: string;
  timestamp: Date;
  role: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;

  // For tool calls
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;

  // Metadata
  tokenCount?: number;
  model?: string;
  turnNumber: number;

  // For grouping in UI
  conversationId: string;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result';

class MessageLogger extends EventEmitter {
  private db: Database.Database;
  private currentSession: string;
  private turnCounter: number = 0;
  private initialized: boolean = false;

  constructor() {
    super();
    // Store messages in a separate SQLite file
    const dbPath = path.join(process.cwd(), 'message-log.db');
    this.db = new Database(dbPath);
    this.initSchema();
    this.currentSession = `session-${Date.now()}`;
    this.initialized = true;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        task_id TEXT,
        timestamp TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_name TEXT,
        tool_input TEXT,
        tool_output TEXT,
        token_count INTEGER,
        model TEXT,
        turn_number INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    `);
  }

  startNewSession(): string {
    this.currentSession = `session-${Date.now()}`;
    this.turnCounter = 0;
    return this.currentSession;
  }

  getCurrentSession(): string {
    return this.currentSession;
  }

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  logSystemMessage(content: string, conversationId: string, taskId?: string): void {
    this.logMessage({
      role: 'system',
      content,
      conversationId,
      taskId,
    });
  }

  logUserMessage(
    content: string,
    conversationId: string,
    taskId?: string,
    tokenCount?: number
  ): void {
    this.turnCounter++;
    this.logMessage({
      role: 'user',
      content,
      conversationId,
      taskId,
      tokenCount,
      turnNumber: this.turnCounter,
    });
  }

  logAssistantMessage(
    content: string,
    conversationId: string,
    taskId?: string,
    tokenCount?: number,
    model?: string
  ): void {
    this.logMessage({
      role: 'assistant',
      content,
      conversationId,
      taskId,
      tokenCount,
      model,
      turnNumber: this.turnCounter,
    });
  }

  logToolCall(
    toolName: string,
    toolInput: unknown,
    conversationId: string,
    taskId?: string
  ): void {
    this.logMessage({
      role: 'tool_call',
      content: `Calling ${toolName}`,
      toolName,
      toolInput:
        typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput, null, 2),
      conversationId,
      taskId,
      turnNumber: this.turnCounter,
    });
  }

  logToolResult(
    toolName: string,
    toolOutput: unknown,
    conversationId: string,
    taskId?: string
  ): void {
    const output =
      typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput, null, 2);
    this.logMessage({
      role: 'tool_result',
      content: `Result from ${toolName}`,
      toolName,
      toolOutput: output.slice(0, 50000), // Limit size
      conversationId,
      taskId,
      turnNumber: this.turnCounter,
    });
  }

  private logMessage(
    params: Partial<LoggedMessage> & {
      role: MessageRole;
      content: string;
      conversationId: string;
    }
  ): void {
    const message: LoggedMessage = {
      id: this.generateId(),
      sessionId: this.currentSession,
      timestamp: new Date(),
      turnNumber: params.turnNumber || this.turnCounter,
      ...params,
    } as LoggedMessage;

    // Insert into database
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, session_id, conversation_id, task_id, timestamp, role, content,
        tool_name, tool_input, tool_output, token_count, model, turn_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.sessionId,
      message.conversationId,
      message.taskId || null,
      message.timestamp.toISOString(),
      message.role,
      message.content,
      message.toolName || null,
      message.toolInput || null,
      message.toolOutput || null,
      message.tokenCount || null,
      message.model || null,
      message.turnNumber
    );

    // Emit for real-time updates via event bus
    eventBus.emitEvent('agent:action', {
      action: 'llm:message',
      messageId: message.id,
      role: message.role,
      conversationId: message.conversationId,
      toolName: message.toolName,
      contentPreview: message.content.slice(0, 200),
    });

    // Emit for local subscribers
    this.emit('message', message);
  }

  // Query methods for dashboard
  getRecentMessages(limit = 100): LoggedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit) as LoggedMessage[];
  }

  getSessionMessages(sessionId: string): LoggedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);
    return stmt.all(sessionId) as LoggedMessage[];
  }

  getConversationMessages(conversationId: string): LoggedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `);
    return stmt.all(conversationId) as LoggedMessage[];
  }

  getSessions(
    limit = 20
  ): { sessionId: string; startTime: string; messageCount: number }[] {
    const stmt = this.db.prepare(`
      SELECT
        session_id as sessionId,
        MIN(timestamp) as startTime,
        COUNT(*) as messageCount
      FROM messages
      GROUP BY session_id
      ORDER BY startTime DESC
      LIMIT ?
    `);
    return stmt.all(limit) as {
      sessionId: string;
      startTime: string;
      messageCount: number;
    }[];
  }

  getConversations(
    sessionId: string
  ): { conversationId: string; taskId: string | null; messageCount: number }[] {
    const stmt = this.db.prepare(`
      SELECT
        conversation_id as conversationId,
        task_id as taskId,
        COUNT(*) as messageCount
      FROM messages
      WHERE session_id = ?
      GROUP BY conversation_id
      ORDER BY MIN(timestamp) ASC
    `);
    return stmt.all(sessionId) as {
      conversationId: string;
      taskId: string | null;
      messageCount: number;
    }[];
  }

  getMessagesSince(timestamp: string): LoggedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE timestamp > ?
      ORDER BY timestamp ASC
    `);
    return stmt.all(timestamp) as LoggedMessage[];
  }

  clearOldMessages(daysOld = 7): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const stmt = this.db.prepare(`
      DELETE FROM messages WHERE timestamp < ?
    `);
    stmt.run(cutoff.toISOString());
  }

  getStats(): {
    totalMessages: number;
    totalSessions: number;
    totalConversations: number;
    messagesByRole: { role: string; count: number }[];
  } {
    const totalMessages = this.db
      .prepare('SELECT COUNT(*) as count FROM messages')
      .get() as { count: number };
    const totalSessions = this.db
      .prepare('SELECT COUNT(DISTINCT session_id) as count FROM messages')
      .get() as { count: number };
    const totalConversations = this.db
      .prepare('SELECT COUNT(DISTINCT conversation_id) as count FROM messages')
      .get() as { count: number };
    const messagesByRole = this.db
      .prepare(
        'SELECT role, COUNT(*) as count FROM messages GROUP BY role ORDER BY count DESC'
      )
      .all() as { role: string; count: number }[];

    return {
      totalMessages: totalMessages.count,
      totalSessions: totalSessions.count,
      totalConversations: totalConversations.count,
      messagesByRole,
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance - lazy initialization
let messageLoggerInstance: MessageLogger | null = null;

export function getMessageLogger(): MessageLogger {
  if (!messageLoggerInstance) {
    messageLoggerInstance = new MessageLogger();
  }
  return messageLoggerInstance;
}

// Export singleton for direct import (creates on first access)
export const messageLogger = new Proxy({} as MessageLogger, {
  get(_, prop) {
    const instance = getMessageLogger();
    const value = instance[prop as keyof MessageLogger];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

/**
 * Create a conversation context for tracking a single LLM conversation.
 * Use this when executing tasks to group related messages.
 */
export function createConversationContext(taskId?: string): {
  conversationId: string;
  taskId?: string;
  logSystem: (content: string) => void;
  logUser: (content: string, tokenCount?: number) => void;
  logAssistant: (content: string, tokenCount?: number, model?: string) => void;
  logToolCall: (toolName: string, toolInput: unknown) => void;
  logToolResult: (toolName: string, toolOutput: unknown) => void;
} {
  const logger = getMessageLogger();
  const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    conversationId,
    taskId,
    logSystem: (content: string) => logger.logSystemMessage(content, conversationId, taskId),
    logUser: (content: string, tokenCount?: number) =>
      logger.logUserMessage(content, conversationId, taskId, tokenCount),
    logAssistant: (content: string, tokenCount?: number, model?: string) =>
      logger.logAssistantMessage(content, conversationId, taskId, tokenCount, model),
    logToolCall: (toolName: string, toolInput: unknown) =>
      logger.logToolCall(toolName, toolInput, conversationId, taskId),
    logToolResult: (toolName: string, toolOutput: unknown) =>
      logger.logToolResult(toolName, toolOutput, conversationId, taskId),
  };
}
