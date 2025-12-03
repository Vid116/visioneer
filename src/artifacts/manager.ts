/**
 * Artifact Lifecycle Manager
 *
 * Manages the complete lifecycle of artifacts:
 * - Creation with metadata headers
 * - Version detection and supersession
 * - Goal-based archival
 * - Cleanup and consolidation
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, renameSync } from 'fs';
import { join, basename, dirname, extname, relative } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ArtifactMetadata,
  ArtifactRecord,
  ArtifactStatus,
  ArtifactType,
  SimilarArtifact,
  ArtifactGroup,
  CleanupAction,
} from './types.js';

// =============================================================================
// Frontmatter Parsing
// =============================================================================

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n/;

/**
 * Parse YAML-like frontmatter from file content
 */
export function parseFrontmatter(content: string): { metadata: Partial<ArtifactMetadata>; body: string } {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const frontmatter = match[1];
  const body = content.slice(match[0].length);
  const metadata: Partial<ArtifactMetadata> = {};

  // Simple YAML-like parsing (key: value)
  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: string | string[] | number = line.slice(colonIdx + 1).trim();

    // Handle arrays (tags: [a, b, c] or tags: a, b, c)
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim());
    } else if (key === 'tags' && value.includes(',')) {
      value = value.split(',').map(s => s.trim());
    } else if (key === 'version' && !isNaN(parseInt(value))) {
      value = parseInt(value);
    }

    (metadata as Record<string, unknown>)[key] = value;
  }

  return { metadata, body };
}

/**
 * Serialize metadata to frontmatter string
 */
export function serializeFrontmatter(metadata: ArtifactMetadata): string {
  const lines: string[] = ['---'];

  // Order keys for consistent output
  const orderedKeys: (keyof ArtifactMetadata)[] = [
    'created', 'updated', 'status', 'type', 'topic',
    'goal_id', 'goal_summary', 'supersedes', 'superseded_by',
    'version', 'tags'
  ];

  for (const key of orderedKeys) {
    const value = metadata[key];
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push('---', '');
  return lines.join('\n');
}

/**
 * Add or update frontmatter in content
 */
export function addFrontmatter(content: string, metadata: ArtifactMetadata): string {
  const { body } = parseFrontmatter(content);
  return serializeFrontmatter(metadata) + body;
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Calculate content hash for change detection
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Infer artifact type from filename
 */
export function inferType(filename: string): ArtifactType {
  const ext = extname(filename).toLowerCase();
  const name = basename(filename, ext).toLowerCase();

  // By extension
  if (['.py', '.ts', '.js', '.jsx', '.tsx'].includes(ext)) {
    if (name.startsWith('test_') || name.endsWith('_test') || name.endsWith('.test')) {
      return 'test';
    }
    return 'code';
  }
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext)) {
    return 'config';
  }
  if (['.csv', '.xml', '.sql'].includes(ext)) {
    return 'data';
  }

  // By name patterns for markdown
  if (ext === '.md') {
    if (name.includes('research') || name.includes('analysis')) return 'research';
    if (name.includes('guide') || name.includes('tutorial') || name.includes('how-to')) return 'guide';
    if (name.includes('spec') || name.includes('requirement') || name.includes('design')) return 'spec';
  }

  return 'other';
}

/**
 * Infer topic from path or filename
 */
export function inferTopic(filepath: string, artifactsDir: string): string | undefined {
  const rel = relative(artifactsDir, filepath);
  const parts = rel.split(/[/\\]/);

  // If in a subdirectory, use that as topic
  if (parts.length > 1) {
    return parts[0];
  }

  // Try to infer from filename
  const name = basename(filepath, extname(filepath)).toLowerCase();

  // Common topic patterns
  const topicPatterns: [RegExp, string][] = [
    [/^e-ink|eink/, 'e-ink-prototype'],
    [/^hardware|^bom|^component/, 'hardware'],
    [/^memory|^retrieval|^chunk/, 'memory-system'],
    [/^photo|^album|^slideshow/, 'photo-pipeline'],
    [/^usb|^scanner/, 'usb-scanner'],
    [/^chess/, 'chess-research'],
    [/^prototype/, 'prototype'],
  ];

  for (const [pattern, topic] of topicPatterns) {
    if (pattern.test(name)) return topic;
  }

  return undefined;
}

// =============================================================================
// Similarity Detection
// =============================================================================

/**
 * Normalize filename for comparison (remove version suffixes, dates, etc.)
 */
function normalizeFilename(filename: string): string {
  const ext = extname(filename);
  let name = basename(filename, ext);

  // Remove version patterns: -v1, _v2, -updated, -final, -draft, -new
  name = name.replace(/[-_](v\d+|updated|final|draft|new|old|backup|\d{4}-\d{2}-\d{2})$/gi, '');

  // Remove trailing numbers that might be versions
  name = name.replace(/[-_]\d+$/, '');

  return name.toLowerCase();
}

/**
 * Calculate name similarity (0-1)
 */
function nameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeFilename(name1);
  const n2 = normalizeFilename(name2);

  if (n1 === n2) return 1.0;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;

  // Simple word overlap
  const wordsArr1 = n1.split(/[-_]/);
  const wordsArr2 = n2.split(/[-_]/);
  const words1 = new Set(wordsArr1);
  const words2 = new Set(wordsArr2);
  const intersection = wordsArr1.filter(w => words2.has(w)).length;
  const unionArr = wordsArr1.concat(wordsArr2.filter(w => !words1.has(w)));

  return intersection / unionArr.length;
}

/**
 * Find similar existing artifacts
 */
export function findSimilarArtifacts(
  filename: string,
  existingArtifacts: ArtifactRecord[],
  topic?: string
): SimilarArtifact[] {
  const results: SimilarArtifact[] = [];
  const normalizedNew = normalizeFilename(filename);

  for (const artifact of existingArtifacts) {
    // Skip archived/deleted
    if (artifact.status === 'archived' || artifact.status === 'deleted') continue;

    const normalizedExisting = normalizeFilename(artifact.filename);
    let similarity = 0;
    let matchType: SimilarArtifact['matchType'] = 'similar_name';

    // Exact normalized name match
    if (normalizedNew === normalizedExisting) {
      similarity = 1.0;
      matchType = 'exact_name';
    } else {
      similarity = nameSimilarity(filename, artifact.filename);
      if (similarity > 0.6) {
        matchType = 'similar_name';
      }
    }

    // Same topic boost
    if (topic && artifact.topic === topic && similarity < 0.5) {
      similarity = Math.max(similarity, 0.4);
      matchType = 'same_topic';
    }

    if (similarity >= 0.4) {
      let recommendation: SimilarArtifact['recommendation'] = 'create_new';

      if (similarity >= 0.9) {
        recommendation = 'update'; // Very similar, probably should update
      } else if (similarity >= 0.7) {
        recommendation = 'supersede'; // Similar enough to supersede
      }

      results.push({
        artifact,
        similarity,
        matchType,
        recommendation,
      });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results;
}

// =============================================================================
// Artifact Manager Class
// =============================================================================

export class ArtifactManager {
  private artifactsDir: string;
  private archiveDir: string;

  constructor(artifactsDir: string) {
    this.artifactsDir = artifactsDir;
    this.archiveDir = join(artifactsDir, '_archive');
  }

  /**
   * Scan artifacts directory and build records
   */
  scanArtifacts(): ArtifactRecord[] {
    const records: ArtifactRecord[] = [];

    const scanDir = (dir: string) => {
      if (!existsSync(dir)) return;

      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip archive directory and hidden directories
          if (entry !== '_archive' && !entry.startsWith('.')) {
            scanDir(fullPath);
          }
        } else if (stat.isFile()) {
          const record = this.createRecordFromFile(fullPath);
          if (record) records.push(record);
        }
      }
    };

    scanDir(this.artifactsDir);
    return records;
  }

  /**
   * Create artifact record from existing file
   */
  private createRecordFromFile(filepath: string): ArtifactRecord | null {
    try {
      const content = readFileSync(filepath, 'utf-8');
      const stat = statSync(filepath);
      const { metadata } = parseFrontmatter(content);

      const filename = relative(this.artifactsDir, filepath);

      return {
        id: uuidv4(),
        project_id: 'default', // Would come from context
        filename,
        absolute_path: filepath,
        status: (metadata.status as ArtifactStatus) || 'active',
        type: (metadata.type as ArtifactType) || inferType(filepath),
        topic: metadata.topic || inferTopic(filepath, this.artifactsDir),
        goal_id: metadata.goal_id,
        supersedes_id: undefined,
        created_at: metadata.created || stat.birthtime.toISOString(),
        updated_at: metadata.updated || stat.mtime.toISOString(),
        content_hash: hashContent(content),
        size_bytes: stat.size,
        metadata: {
          created: metadata.created || stat.birthtime.toISOString().split('T')[0],
          updated: metadata.updated,
          status: (metadata.status as ArtifactStatus) || 'active',
          type: (metadata.type as ArtifactType) || inferType(filepath),
          topic: metadata.topic || inferTopic(filepath, this.artifactsDir),
          goal_id: metadata.goal_id,
          goal_summary: metadata.goal_summary,
          supersedes: metadata.supersedes,
          superseded_by: metadata.superseded_by,
          version: metadata.version as number | undefined,
          tags: metadata.tags as string[] | undefined,
        },
      };
    } catch (err) {
      console.error(`Failed to read artifact: ${filepath}`, err);
      return null;
    }
  }

  /**
   * Group artifacts by topic
   */
  groupByTopic(artifacts: ArtifactRecord[]): ArtifactGroup[] {
    const groups = new Map<string, ArtifactRecord[]>();

    for (const artifact of artifacts) {
      const topic = artifact.topic || '_ungrouped';
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic)!.push(artifact);
    }

    return Array.from(groups.entries()).map(([topic, arts]) => ({
      topic,
      artifacts: arts.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      activeCount: arts.filter(a => a.status === 'active').length,
      supersededCount: arts.filter(a => a.status === 'superseded').length,
      archivedCount: arts.filter(a => a.status === 'archived').length,
      totalSize: arts.reduce((sum, a) => sum + a.size_bytes, 0),
    }));
  }

  /**
   * Mark artifact as superseded
   */
  markSuperseded(filepath: string, supersededBy: string): void {
    const content = readFileSync(filepath, 'utf-8');
    const { metadata, body } = parseFrontmatter(content);

    const updatedMetadata: ArtifactMetadata = {
      ...metadata as ArtifactMetadata,
      status: 'superseded',
      superseded_by: supersededBy,
      updated: new Date().toISOString().split('T')[0],
    };

    writeFileSync(filepath, addFrontmatter(body, updatedMetadata));
  }

  /**
   * Archive artifacts for a goal
   */
  archiveGoalArtifacts(goalId: string, artifacts: ArtifactRecord[]): void {
    const goalArtifacts = artifacts.filter(a => a.goal_id === goalId);

    for (const artifact of goalArtifacts) {
      if (artifact.status === 'active') {
        const content = readFileSync(artifact.absolute_path, 'utf-8');
        const { metadata, body } = parseFrontmatter(content);

        const updatedMetadata: ArtifactMetadata = {
          ...metadata as ArtifactMetadata,
          status: 'archived',
          updated: new Date().toISOString().split('T')[0],
        };

        writeFileSync(artifact.absolute_path, addFrontmatter(body, updatedMetadata));
      }
    }
  }

  /**
   * Move artifact to archive directory
   */
  moveToArchive(artifact: ArtifactRecord): void {
    // Create archive directory if needed
    if (!existsSync(this.archiveDir)) {
      mkdirSync(this.archiveDir, { recursive: true });
    }

    // Preserve topic structure in archive
    const archivePath = artifact.topic
      ? join(this.archiveDir, artifact.topic)
      : this.archiveDir;

    if (!existsSync(archivePath)) {
      mkdirSync(archivePath, { recursive: true });
    }

    const newPath = join(archivePath, basename(artifact.filename));
    renameSync(artifact.absolute_path, newPath);
  }

  /**
   * Generate cleanup recommendations
   */
  generateCleanupActions(artifacts: ArtifactRecord[]): CleanupAction[] {
    const actions: CleanupAction[] = [];

    // Find superseded artifacts that can be archived
    for (const artifact of artifacts) {
      if (artifact.status === 'superseded') {
        const updatedAt = new Date(artifact.updated_at);
        const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceUpdate > 7) {
          actions.push({
            artifact,
            action: 'archive',
            reason: `Superseded ${Math.floor(daysSinceUpdate)} days ago`,
          });
        } else {
          actions.push({
            artifact,
            action: 'keep',
            reason: `Recently superseded, keeping for reference`,
          });
        }
      }
    }

    // Find archived artifacts that can be deleted
    for (const artifact of artifacts) {
      if (artifact.status === 'archived') {
        const updatedAt = new Date(artifact.updated_at);
        const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceUpdate > 30) {
          actions.push({
            artifact,
            action: 'delete',
            reason: `Archived ${Math.floor(daysSinceUpdate)} days ago`,
          });
        }
      }
    }

    return actions;
  }

  /**
   * Create new artifact with proper metadata
   */
  createArtifact(
    filename: string,
    content: string,
    options: {
      goalId?: string;
      goalSummary?: string;
      supersedes?: string;
      topic?: string;
      tags?: string[];
    } = {}
  ): string {
    const filepath = join(this.artifactsDir, filename);
    const dir = dirname(filepath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const metadata: ArtifactMetadata = {
      created: new Date().toISOString().split('T')[0],
      status: 'active',
      type: inferType(filename),
      topic: options.topic || inferTopic(filepath, this.artifactsDir),
      goal_id: options.goalId,
      goal_summary: options.goalSummary,
      supersedes: options.supersedes,
      tags: options.tags,
    };

    // Mark superseded file
    if (options.supersedes) {
      const supersededPath = join(this.artifactsDir, options.supersedes);
      if (existsSync(supersededPath)) {
        this.markSuperseded(supersededPath, filename);
      }
    }

    const finalContent = addFrontmatter(content, metadata);
    writeFileSync(filepath, finalContent);

    return filepath;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: ArtifactManager | null = null;

export function getArtifactManager(artifactsDir?: string): ArtifactManager {
  if (!instance && artifactsDir) {
    instance = new ArtifactManager(artifactsDir);
  }
  if (!instance) {
    throw new Error('ArtifactManager not initialized - provide artifactsDir');
  }
  return instance;
}
