type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  const envLevel = process.env.VISIONEER_LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getLogLevel()];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, component: string, message: string, data?: unknown): string {
  const timestamp = formatTimestamp();
  const levelStr = level.toUpperCase().padEnd(5);
  const componentStr = component.padEnd(15);
  
  let output = `[${timestamp}] ${levelStr} [${componentStr}] ${message}`;
  
  if (data !== undefined) {
    output += `\n${JSON.stringify(data, null, 2)}`;
  }
  
  return output;
}

export function createLogger(component: string) {
  return {
    debug(message: string, data?: unknown) {
      if (shouldLog("debug")) {
        console.debug(formatMessage("debug", component, message, data));
      }
    },

    info(message: string, data?: unknown) {
      if (shouldLog("info")) {
        console.info(formatMessage("info", component, message, data));
      }
    },

    warn(message: string, data?: unknown) {
      if (shouldLog("warn")) {
        console.warn(formatMessage("warn", component, message, data));
      }
    },

    error(message: string, data?: unknown) {
      if (shouldLog("error")) {
        console.error(formatMessage("error", component, message, data));
      }
    },
  };
}

// Pre-configured loggers for main components
export const dbLogger = createLogger("database");
export const mcpLogger = createLogger("mcp");
export const embeddingLogger = createLogger("embedding");
export const agentLogger = createLogger("agent");
export const retrievalLogger = createLogger("retrieval");
