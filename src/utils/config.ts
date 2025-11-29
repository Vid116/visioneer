import { readFileSync, existsSync } from "fs";
import { VisioneerConfig, ToolsConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = "./visioneer.config.json";

let cachedConfig: VisioneerConfig | null = null;

/**
 * Loads the Visioneer configuration from file.
 * Uses environment variable override if set.
 * Caches the config after first load.
 */
export function loadConfig(): VisioneerConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = process.env.VISIONEER_CONFIG_PATH || DEFAULT_CONFIG_PATH;

  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    cachedConfig = JSON.parse(content) as VisioneerConfig;
    
    // Apply environment variable overrides
    if (process.env.VISIONEER_DB_PATH) {
      cachedConfig.storage.database_path = process.env.VISIONEER_DB_PATH;
    }

    // Allow overriding embedding provider (useful for testing)
    if (process.env.VISIONEER_EMBEDDING_PROVIDER) {
      cachedConfig.embedding.provider = process.env.VISIONEER_EMBEDDING_PROVIDER as "openai" | "voyage" | "ollama" | "mock";
    }

    return cachedConfig;
  } catch (error) {
    throw new Error(`Failed to parse configuration: ${error}`);
  }
}

/**
 * Reloads config from disk (useful for testing or hot reload)
 */
export function reloadConfig(): VisioneerConfig {
  cachedConfig = null;
  return loadConfig();
}

/**
 * Gets a specific config section
 */
export function getEmbeddingConfig() {
  return loadConfig().embedding;
}

export function getStorageConfig() {
  return loadConfig().storage;
}

export function getOrientationConfig() {
  return loadConfig().orientation;
}

export function getWorkingConfig() {
  return loadConfig().working;
}

export function getKnowledgeConfig() {
  return loadConfig().knowledge;
}

export function getRetrievalConfig() {
  return loadConfig().retrieval;
}

export function getAgentConfig() {
  return loadConfig().agent;
}

const DEFAULT_TOOLS_CONFIG: ToolsConfig = {
  web_search: {
    enabled: true,
    provider: "serper",
    max_results: 5,
  },
  web_fetch: {
    enabled: true,
    max_content_length: 10000,
  },
  artifacts: {
    enabled: true,
    directory: "./artifacts",
  },
};

export function getToolsConfig(): ToolsConfig {
  const config = loadConfig();
  if (!config.tools) {
    return DEFAULT_TOOLS_CONFIG;
  }
  // Merge with defaults in case some fields are missing
  return {
    web_search: { ...DEFAULT_TOOLS_CONFIG.web_search, ...config.tools.web_search },
    web_fetch: { ...DEFAULT_TOOLS_CONFIG.web_fetch, ...config.tools.web_fetch },
    artifacts: { ...DEFAULT_TOOLS_CONFIG.artifacts, ...config.tools.artifacts },
  };
}
