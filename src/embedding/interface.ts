// =============================================================================
// Embedding Provider Interface
// =============================================================================

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  
  /**
   * Generates an embedding for a single text.
   */
  embed(text: string): Promise<Float32Array>;
  
  /**
   * Generates embeddings for multiple texts (batched).
   */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

/**
 * Factory function type for creating embedding providers.
 */
export type EmbeddingProviderFactory = (config: {
  model: string;
  dimensions: number;
  apiKey?: string;
}) => EmbeddingProvider;
