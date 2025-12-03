/**
 * Artifact Lifecycle Management Types
 *
 * Tracks artifacts created by the agent, their relationships,
 * and lifecycle status across goal changes.
 */

export type ArtifactStatus = 'active' | 'superseded' | 'archived' | 'deleted';

export type ArtifactType =
  | 'research'      // Research documents, analysis
  | 'guide'         // How-to guides, tutorials
  | 'spec'          // Specifications, requirements
  | 'code'          // Source code files
  | 'config'        // Configuration files
  | 'data'          // Data files (JSON, CSV, etc.)
  | 'test'          // Test files
  | 'other';        // Uncategorized

/**
 * Frontmatter metadata for artifact files
 */
export interface ArtifactMetadata {
  created: string;           // ISO date
  updated?: string;          // ISO date of last update
  supersedes?: string;       // Filename this artifact replaces
  superseded_by?: string;    // Filename that replaced this
  goal_id?: string;          // Goal ID when created
  goal_summary?: string;     // Brief goal description for context
  status: ArtifactStatus;
  type: ArtifactType;
  topic?: string;            // Topic grouping (e.g., 'memory-research', 'hardware')
  tags?: string[];           // Additional tags for discovery
  version?: number;          // Version number if versioned
}

/**
 * Database record for artifact tracking
 */
export interface ArtifactRecord {
  id: string;
  project_id: string;
  filename: string;          // Relative path from artifacts/
  absolute_path: string;     // Full filesystem path
  status: ArtifactStatus;
  type: ArtifactType;
  topic?: string;
  goal_id?: string;
  supersedes_id?: string;    // ID of artifact this supersedes
  created_at: string;
  updated_at: string;
  content_hash: string;      // For detecting external changes
  size_bytes: number;
  metadata: ArtifactMetadata;
}

/**
 * Result of artifact similarity check
 */
export interface SimilarArtifact {
  artifact: ArtifactRecord;
  similarity: number;        // 0-1 score
  matchType: 'exact_name' | 'similar_name' | 'same_topic' | 'content_overlap';
  recommendation: 'update' | 'supersede' | 'create_new';
}

/**
 * Artifact group for cleanup display
 */
export interface ArtifactGroup {
  topic: string;
  artifacts: ArtifactRecord[];
  activeCount: number;
  supersededCount: number;
  archivedCount: number;
  totalSize: number;
}

/**
 * Cleanup action
 */
export interface CleanupAction {
  artifact: ArtifactRecord;
  action: 'archive' | 'delete' | 'keep';
  reason: string;
}
