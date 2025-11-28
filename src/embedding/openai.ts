import OpenAI from "openai";
import { EmbeddingProvider } from "./interface.js";
import { embeddingLogger } from "../utils/logger.js";

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions: number;
  
  private client: OpenAI;
  private model: string;
  private batchSize: number;
  
  constructor(config: {
    model: string;
    dimensions: number;
    apiKey?: string;
    batchSize?: number;
  }) {
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.batchSize = config.batchSize || 100;
    
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    });
    
    embeddingLogger.info(`Initialized OpenAI embedding provider`, {
      model: this.model,
      dimensions: this.dimensions,
    });
  }
  
  async embed(text: string): Promise<Float32Array> {
    const results = await this.embedBatch([text]);
    return results[0];
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }
    
    const allEmbeddings: Float32Array[] = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      
      embeddingLogger.debug(`Embedding batch ${i / this.batchSize + 1}`, {
        batchSize: batch.length,
        totalTexts: texts.length,
      });
      
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        dimensions: this.dimensions,
      });
      
      for (const item of response.data) {
        allEmbeddings.push(new Float32Array(item.embedding));
      }
    }
    
    return allEmbeddings;
  }
}

/**
 * Factory function for creating OpenAI embedding provider.
 */
export function createOpenAIProvider(config: {
  model: string;
  dimensions: number;
  apiKey?: string;
  batchSize?: number;
}): EmbeddingProvider {
  return new OpenAIEmbeddingProvider(config);
}
