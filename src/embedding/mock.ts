/**
 * Mock Embedding Provider for testing.
 *
 * Generates deterministic embeddings based on text content.
 * Useful for testing without API calls.
 *
 * Algorithm:
 * - Uses word-based sparse embeddings with keyword matching
 * - Similar texts (sharing keywords) will have similar embeddings
 * - NOT suitable for production (use OpenAI for real semantic search)
 */

import type { EmbeddingProvider } from "./interface.js";
import { embeddingLogger } from "../utils/logger.js";

// Common semantic keywords and their related terms
const SEMANTIC_GROUPS: Record<string, string[]> = {
  jazz: ["jazz", "bebop", "swing", "improvisation", "improv", "standards", "changes", "modal"],
  harmony: ["harmony", "chord", "chords", "progression", "voicing", "voicings", "ii-v-i", "substitution"],
  practice: ["practice", "practicing", "warmup", "warm-up", "routine", "exercise", "exercises", "drill"],
  scales: ["scale", "scales", "mode", "modes", "key", "keys", "chromatic", "pentatonic"],
  blues: ["blues", "blue", "12-bar", "turnaround"],
  technique: ["technique", "fingering", "position", "hand", "hands"],
  melody: ["melody", "melodic", "line", "lines", "phrase", "phrasing"],
  theory: ["theory", "music", "musical", "note", "notes", "interval", "intervals"],
};

/**
 * Extracts keywords from text and returns matching semantic groups.
 */
function extractSemanticGroups(text: string): Set<string> {
  const normalizedText = text.toLowerCase();
  const groups = new Set<string>();

  for (const [group, keywords] of Object.entries(SEMANTIC_GROUPS)) {
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword)) {
        groups.add(group);
        break;
      }
    }
  }

  return groups;
}

/**
 * Simple hash function for generating dimension indices.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Generates a deterministic pseudo-embedding from text.
 * Uses semantic group features to create meaningful similarity.
 */
function generateMockEmbedding(text: string, dimensions: number): Float32Array {
  const embedding = new Float32Array(dimensions);

  // Extract semantic groups
  const groups = extractSemanticGroups(text);

  // Each semantic group activates a specific region of the embedding
  for (const group of groups) {
    const groupHash = hashString(group);
    const regionStart = groupHash % (dimensions - 100);

    // Activate ~100 dimensions for each group
    for (let i = 0; i < 100; i++) {
      const dim = regionStart + i;
      // Use deterministic but varied values
      embedding[dim] += 1.0 + Math.sin(groupHash + i) * 0.3;
    }
  }

  // Add word-level features for more granularity
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  for (const word of words) {
    const wordHash = hashString(word);
    const dim = wordHash % dimensions;
    embedding[dim] += 0.5;

    // Spread to neighbors for smoothing
    if (dim > 0) embedding[dim - 1] += 0.2;
    if (dim < dimensions - 1) embedding[dim + 1] += 0.2;
  }

  // Normalize to unit vector
  let magnitude = 0;
  for (let i = 0; i < dimensions; i++) {
    magnitude += embedding[i] * embedding[i];
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock";
  readonly dimensions: number;

  constructor(dimensions: number = 3072) {
    this.dimensions = dimensions;
    embeddingLogger.info("Initialized mock embedding provider", {
      dimensions: this.dimensions,
    });
  }

  async embed(text: string): Promise<Float32Array> {
    return generateMockEmbedding(text, this.dimensions);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map((text) => generateMockEmbedding(text, this.dimensions));
  }
}

/**
 * Factory function for creating mock embedding provider.
 */
export function createMockProvider(dimensions: number = 3072): EmbeddingProvider {
  return new MockEmbeddingProvider(dimensions);
}
