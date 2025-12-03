import type { EmbeddingProvider } from "./interface.js";
import { createOpenAIProvider, OpenAIEmbeddingProvider } from "./openai.js";
import { createMockProvider, MockEmbeddingProvider } from "./mock.js";
import { createVoyageProvider, VoyageEmbeddingProvider } from "./voyage.js";
import { getEmbeddingConfig } from "../utils/config.js";
import { embeddingLogger } from "../utils/logger.js";

// Re-export types and classes
export type { EmbeddingProvider } from "./interface.js";
export { OpenAIEmbeddingProvider, createOpenAIProvider } from "./openai.js";
export { MockEmbeddingProvider, createMockProvider } from "./mock.js";
export { VoyageEmbeddingProvider, createVoyageProvider } from "./voyage.js";

let cachedProvider: EmbeddingProvider | null = null;

/**
 * Gets the configured embedding provider.
 * Creates and caches on first call.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cachedProvider) {
    return cachedProvider;
  }
  
  const config = getEmbeddingConfig();
  
  embeddingLogger.info(`Creating embedding provider: ${config.provider}`);
  
  switch (config.provider) {
    case "openai":
      cachedProvider = createOpenAIProvider({
        model: config.model,
        dimensions: config.dimensions,
        batchSize: config.batch_size,
      });
      break;

    case "mock":
      cachedProvider = createMockProvider(config.dimensions);
      break;

    case "voyage":
      cachedProvider = createVoyageProvider({
        model: config.model,
        dimensions: config.dimensions,
        batchSize: config.batch_size,
      });
      break;

    case "ollama":
      // TODO: Implement Ollama provider
      throw new Error("Ollama embedding provider not yet implemented");

    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
  
  return cachedProvider;
}

/**
 * Convenience function to embed a single text.
 */
export async function embed(text: string): Promise<Float32Array> {
  return getEmbeddingProvider().embed(text);
}

/**
 * Convenience function to embed multiple texts.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  return getEmbeddingProvider().embedBatch(texts);
}
