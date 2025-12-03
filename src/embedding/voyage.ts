import type { EmbeddingProvider } from "./interface.js";
import { embeddingLogger } from "../utils/logger.js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

// Rate limit handling
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 21000; // 21 seconds for 3 RPM limit

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Voyage AI models and their dimensions
const VOYAGE_DIMENSIONS: Record<string, number> = {
  "voyage-3": 1024,
  "voyage-3-lite": 512,
  "voyage-code-3": 1024,
};

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = "voyage";
  readonly dimensions: number;

  private apiKey: string;
  private model: string;
  private batchSize: number;

  constructor(config: {
    model: string;
    dimensions?: number;
    apiKey?: string;
    batchSize?: number;
  }) {
    this.model = config.model;
    this.dimensions = config.dimensions || VOYAGE_DIMENSIONS[config.model] || 1024;
    this.batchSize = config.batchSize || 128; // Voyage supports up to 128 texts per batch

    const apiKey = config.apiKey || process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error("VOYAGE_API_KEY environment variable is not set");
    }
    this.apiKey = apiKey;

    embeddingLogger.info(`Initialized Voyage embedding provider`, {
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

      embeddingLogger.debug(`Embedding batch ${Math.floor(i / this.batchSize) + 1}`, {
        batchSize: batch.length,
        totalTexts: texts.length,
      });

      // Retry loop for rate limits
      let lastError: Error | null = null;
      let data: { data: Array<{ embedding: number[] }>; usage?: { total_tokens: number } } | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const response = await fetch(VOYAGE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: batch,
            input_type: "document", // Use 'document' for content being stored
          }),
        });

        if (response.ok) {
          data = await response.json() as {
            data: Array<{ embedding: number[] }>;
            usage?: { total_tokens: number };
          };
          break;
        }

        // Handle rate limit (429)
        if (response.status === 429) {
          const errorText = await response.text();
          lastError = new Error(`Voyage API rate limit: ${errorText}`);

          if (attempt < MAX_RETRIES - 1) {
            const delayMs = BASE_DELAY_MS * (attempt + 1);
            embeddingLogger.warn(`Rate limited, waiting ${delayMs / 1000}s before retry ${attempt + 2}/${MAX_RETRIES}`);
            await sleep(delayMs);
            continue;
          }
        } else {
          // Other errors - don't retry
          const error = await response.text();
          throw new Error(`Voyage API error: ${response.status} ${error}`);
        }
      }

      if (!data) {
        throw lastError || new Error("Failed to get embeddings after retries");
      }

      if (data.usage) {
        embeddingLogger.debug(`Voyage API usage`, { tokens: data.usage.total_tokens });
      }

      for (const item of data.data) {
        allEmbeddings.push(new Float32Array(item.embedding));
      }
    }

    return allEmbeddings;
  }
}

/**
 * Factory function for creating Voyage embedding provider.
 */
export function createVoyageProvider(config: {
  model: string;
  dimensions?: number;
  apiKey?: string;
  batchSize?: number;
}): EmbeddingProvider {
  return new VoyageEmbeddingProvider(config);
}
