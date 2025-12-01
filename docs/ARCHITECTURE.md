# Visioneer System Architecture

A deep technical analysis of how the Visioneer autonomous learning agent works.

---

## Overview

Visioneer is an **autonomous learning agent** that:
1. Takes a goal from the user
2. Plans tasks to achieve that goal
3. Executes tasks using Claude Agent SDK
4. Stores learnings as knowledge chunks
5. Maintains strategic orientation across sessions

**Core Philosophy:** "Memory Brain + Execution Hands"
- **Visioneer** = Memory Brain (context, knowledge, state)
- **Claude Agent SDK** = Execution Hands (does actual work with tools)

---

## System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     ORIENTATION LAYER                            │
│  Strategic context that persists across all sessions             │
│  • Vision, goals, priorities, constraints                        │
│  • Skill map with dependencies                                   │
│  • Progress tracking per area                                    │
│  • Key decisions with reasoning                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WORKING LAYER                               │
│  Current operational state                                       │
│  • Tasks (ready, in_progress, blocked, done)                     │
│  • Questions (open, answered)                                    │
│  • Activity log                                                  │
│  • Goals (active, pending)                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     KNOWLEDGE LAYER                              │
│  Persistent memory with semantic retrieval                       │
│  • Chunks (research, insight, decision, attempt)                 │
│  • Embeddings (3072-dim vectors, cosine similarity)              │
│  • Relationships (supports, contradicts, builds_on, etc.)        │
│  • Co-retrieval tracking for implicit relationships              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: The Agent Cycle

```
                    ┌──────────────┐
                    │   npm run    │
                    │  agent:      │
                    │ continuous   │
                    └──────┬───────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                      1. WAKE UP                                   │
│                    (wakeup.ts)                                    │
│                                                                   │
│  Load orientation → Load tasks → Check questions →                │
│  Process newly answered → Evaluate work queue                     │
│                                                                   │
│  Output: AgentState with status:                                  │
│    • ready (has actionable work)                                  │
│    • waiting_for_user (blocked on questions)                      │
│    • complete (all tasks done)                                    │
│    • error                                                        │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    2. PLANNING                                    │
│                   (planner.ts)                                    │
│                                                                   │
│  Triggered when:                                                  │
│    • No tasks exist (totalTasks === 0)                            │
│    • Goal changed and no tasks for current goal                   │
│    • All tasks done but progress_snapshot < 100%                  │
│                                                                   │
│  Process:                                                         │
│    1. Build prompt with orientation context                       │
│    2. Call Claude SDK (no tools, pure reasoning)                  │
│    3. Parse JSON response → PlannedTask[]                         │
│    4. Create tasks in database with dependency resolution         │
│                                                                   │
│  Output: 3-7 tasks with titles, descriptions, dependencies        │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                 3. PRIORITIZATION                                 │
│               (prioritization.ts)                                 │
│                                                                   │
│  Scores each task on 6 factors:                                   │
│    • Priority match (10x weight) - matches active_priorities      │
│    • Goal alignment (8x weight) - matches current goal text       │
│    • Dependency satisfaction (5x) - no blockers                   │
│    • Phase alignment (3x) - matches current_phase                 │
│    • Skill balance (2x) - avoid same area as recent work          │
│    • Task age (1x) - older tasks get slight boost                 │
│                                                                   │
│  Output: Sorted task list, highest score first                    │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                  4. EXECUTION                                     │
│                 (executor.ts)                                     │
│                                                                   │
│  For each task:                                                   │
│    1. Gather context - semantic search for relevant chunks        │
│    2. Build prompt with:                                          │
│       - Orientation context (vision, phase, priorities)           │
│       - Retrieved knowledge chunks                                │
│       - Task details                                              │
│       - Failure context (if retry)                                │
│    3. Call Claude Agent SDK with tools:                           │
│       WebSearch, WebFetch, Read, Write, Bash, Glob, Grep          │
│    4. SDK executes (up to 25 turns per task)                      │
│    5. Parse JSON response for status + learnings                  │
│                                                                   │
│  Task Results:                                                    │
│    • complete → mark done, store learnings                        │
│    • blocked → create question, mark blocked                      │
│    • needs_research → create sub-task                             │
│    • partial → update description, continue                       │
│    • failed → store failure context for retry                     │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              5. LEARNING STORAGE                                  │
│               (execution.ts)                                      │
│                                                                   │
│  For each learning from task:                                     │
│    1. Generate embedding (OpenAI text-embedding-3-large)          │
│    2. Store chunk with:                                           │
│       - content, type, tags                                       │
│       - confidence (verified/inferred/speculative)                │
│       - source (research/user/deduction/experiment)               │
│    3. Create relationships to similar existing chunks             │
│       - Based on embedding similarity > threshold                 │
│       - Tagged with context                                       │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│           6. ORIENTATION REWRITE                                  │
│          (orientation-rewrite.ts)                                 │
│                                                                   │
│  Triggered when:                                                  │
│    • Major milestone (task matches top-level skill)               │
│    • Activity threshold (50+ activities since last rewrite)       │
│    • Goal change                                                  │
│                                                                   │
│  Process:                                                         │
│    1. Build context with task summary, recent activity            │
│    2. Call Claude SDK (no tools)                                  │
│    3. Parse updated orientation JSON                              │
│    4. Archive old orientation as chunk                            │
│    5. Save new orientation, increment version                     │
│                                                                   │
│  Updates: phase, priorities, progress_snapshot, skill statuses    │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Continue   │
                    │   or Exit    │
                    └──────────────┘
```

---

## Key Components Deep Dive

### 1. Orientation (Strategic Brain)

**Location:** `src/utils/types.ts:68-80`, stored in `orientation` table

```typescript
interface Orientation {
  project_id: string;
  vision_summary: string;          // "Master the French Defense in chess"
  success_criteria: string[];      // ["Win games using French Defense", ...]
  constraints: string[];           // ["Focus on Advance Variation", ...]
  skill_map: SkillNode[];         // Tree of skills with dependencies
  current_phase: Phase;           // intake|research|planning|execution|refinement|complete
  key_decisions: Decision[];      // Important choices with reasoning
  active_priorities: string[];    // Current focus areas (top 3-5)
  progress_snapshot: Progress[];  // Status per area with percentages
  last_rewritten: string;         // ISO timestamp
  version: number;                // Increments on each rewrite
}
```

**Purpose:** Provides strategic context that persists across sessions. The agent always loads this first on wake-up.

### 2. Tasks (Work Units)

**Location:** `src/utils/types.ts:86-104`, stored in `tasks` table

```typescript
interface Task {
  id: string;
  title: string;                  // "Research French Defense Advance Variation"
  description: string;            // Detailed description
  status: TaskStatus;             // ready|in_progress|blocked|done
  skill_area: string;             // "research", "practice", etc.
  depends_on: string[];           // Task IDs this depends on
  blocked_by: string[];           // Question IDs blocking this
  outcome: string | null;         // Result when completed
  failure_reason: string | null;  // Why it failed (for retry)
  failure_context: FailureContext | null; // Tool calls, iterations, partial results
}
```

**Task Lifecycle:**
```
ready → in_progress → done
                   ↘ blocked (question created or failed)
                   ↘ needs_research (sub-task created)
```

### 3. Knowledge Chunks (Memory)

**Location:** `src/utils/types.ts:143-155`, stored in `chunks` table

```typescript
interface Chunk {
  id: string;
  content: string;               // The actual knowledge
  type: ChunkType;               // research|insight|decision|resource|attempt|user_input
  tags: string[];                // ["french_defense", "advance_variation"]
  confidence: Confidence;        // verified|inferred|speculative
  source: Source;                // research|user|deduction|experiment
  embedding?: Float32Array;      // 3072-dimension vector
}
```

**Types of Chunks:**
- `research` - Facts from web search, documentation
- `insight` - Derived conclusions, patterns
- `decision` - Choices made with reasoning
- `resource` - URLs, file paths, references
- `attempt` - What was tried (success or failure)
- `user_input` - Answers to questions from user

### 4. Vector Store (Semantic Search)

**Location:** `src/db/vector-store.ts`

```typescript
// In-memory index for fast search
const vectorIndex: Map<string, VectorEntry> = new Map();

// Cosine similarity search O(n) but fast for <10k chunks
function searchSimilar(
  projectId: string,
  queryEmbedding: Float32Array,
  limit: number = 10,
  minSimilarity: number = 0.7
): { chunkId: string; similarity: number }[]
```

**How it works:**
1. Embeddings stored in SQLite as BLOBs (persisted)
2. Loaded into memory on startup (fast search)
3. Linear scan with cosine similarity
4. Results sorted by similarity, filtered by threshold

### 5. Query Planner (Retrieval Router)

**Location:** `src/retrieval/planner.ts`

```typescript
// Query types detected by pattern matching
type QueryType = "operational" | "lookup" | "exploration" | "connection" | "hybrid";

// Routes to appropriate retrieval method
async function executeQuery(projectId: string, query: string): Promise<RetrievalResult>
```

**Query Routing:**
| Query Type | Example | Method |
|------------|---------|--------|
| operational | "what's blocked?" | SQL on tasks/questions |
| lookup | "what did we decide about X?" | Tag-based filtering |
| exploration | "what do we know about X?" | Semantic search |
| connection | "what contradicts X?" | Relationship traversal |
| hybrid | (default) | Semantic + relationships + confidence weighting |

---

## Execution Flow Details

### Task Execution via SDK

**Location:** `src/agent/executor.ts:434-632`

```typescript
async function sdkExecutor(task: Task, orientation: Orientation): Promise<TaskResult> {
  // 1. Gather relevant context chunks
  const contextChunks = await gatherTaskContext(task, orientation, maxChunks);

  // 2. Build prompt with orientation + context + task
  const prompt = buildExecutionPrompt(task, orientation, contextChunks, artifactsDir);

  // 3. Execute via Claude Agent SDK
  const sdkResult = query({
    prompt,
    options: {
      maxTurns: 25,  // Complex research needs many turns
      allowedTools: ["WebSearch", "WebFetch", "Read", "Write", "Bash", "Glob", "Grep"],
    },
  });

  // 4. Stream through messages, track tool usage
  for await (const message of sdkResult) {
    // Track tools used, handle errors, collect response
  }

  // 5. Parse structured JSON response
  return parseExecutionResponse(responseText);
}
```

### Expected Task Response Format

```json
{
  "status": "complete",
  "outcome": "Brief summary of what was accomplished",
  "learnings": [
    {
      "content": "The actual knowledge discovered",
      "type": "research",
      "tags": ["topic", "subtopic"],
      "confidence": "verified"
    }
  ]
}
```

---

## Database Schema

**Location:** `src/db/schema.sql`

### Core Tables

| Table | Purpose |
|-------|---------|
| `projects` | Project identifiers |
| `orientation` | Orientation JSON per project |
| `tasks` | Work units with status |
| `questions` | Blocking questions |
| `activities` | Activity log |
| `goals` | Goal history |
| `pending_goals` | Queue for goal changes during cycles |
| `chunks` | Knowledge storage |
| `chunk_embeddings_store` | Vector embeddings |
| `relationships` | Chunk-to-chunk relationships |
| `coretrieval` | Co-retrieval tracking for implicit relationships |
| `coherence_warnings` | Tasks flagged as off-track |

### Key Relationships

```
projects ─┬─ orientation (1:1)
          ├─ tasks (1:N) ──── questions (N:M via blocked_by)
          ├─ goals (1:N)
          ├─ chunks (1:N) ─── relationships (N:M)
          └─ activities (1:N)
```

---

## Configuration

**Location:** `visioneer.config.ts`

```typescript
interface VisioneerConfig {
  embedding: {
    provider: "openai" | "voyage" | "ollama" | "mock";
    model: "text-embedding-3-large";
    dimensions: 3072;
  };
  storage: {
    database_path: "./visioneer.db";
  };
  agent: {
    max_tasks_per_session: 5;
  };
  knowledge: {
    min_similarity_threshold: 0.7;
    default_search_limit: 20;
  };
  tools: {
    artifacts: { directory: "./artifacts" };
  };
}
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run goal "..."` | Set a new goal |
| `npm run agent:continuous` | Run agent in continuous mode |
| `npm run status` | Show current status |
| `npm run answer` | Answer pending questions |
| `npm run tasks` | List all tasks |

---

## Known Issues / Gaps

### 1. Progress Tracking Disconnect
**Problem:** `progress_snapshot` in orientation tracks research areas, but tasks are separate. When all tasks complete, progress can still show incomplete areas.

**Current Fix:** Added re-planning trigger in `cycle.ts:97-113` when all tasks done but progress < 100%.

### 2. Coherence Check Disabled
**Location:** `execution.ts:179`
```typescript
const COHERENCE_CHECK_ENABLED = false;
```
The coherence check (verifying tasks align with current goal) is disabled. When enabled, it may skip tasks that don't match the goal well.

### 3. No BM25 Keyword Search
Currently only uses semantic (embedding) search. The memory research recommends adding BM25 for hybrid retrieval.

### 4. No Decay/Forgetting
Chunks persist forever. Research recommends implementing:
- Decay functions for strength
- Archival for low-strength chunks
- Consolidation for related chunks

---

## Extension Points

### Adding New Embedding Providers
**Location:** `src/embedding/index.ts`

Implement `EmbeddingProvider` interface:
```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}
```

### Adding New Chunk Types
**Location:** `src/utils/types.ts:21-27`

Add to `ChunkType` union, update schema CHECK constraint.

### Adding New Relationship Types
**Location:** `src/utils/types.ts:33-39`

Add to `RelationshipType` union, update schema CHECK constraint.

---

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Wake up | O(n) tasks | Loads all tasks, questions |
| Prioritization | O(n) tasks | Scores each task |
| Semantic search | O(n) chunks | Linear scan through embeddings |
| Task execution | O(1) per task | Fixed max turns (25) |
| Orientation rewrite | O(1) | Single Claude call |

**Memory Usage:**
- ~12KB per chunk (3072 dimensions × 4 bytes)
- Embeddings loaded into memory on startup
- SQLite database grows with chunks and activity

---

## Summary

Visioneer is a **goal-driven autonomous agent** that:

1. **Plans** tasks from goals using Claude
2. **Prioritizes** tasks using multi-factor scoring
3. **Executes** tasks with full tool access via SDK
4. **Learns** by storing knowledge as semantic chunks
5. **Adapts** by rewriting orientation based on progress

The system maintains **three layers of memory**:
- **Orientation** (strategic, versioned)
- **Working** (operational, mutable)
- **Knowledge** (semantic, growing)

Each cycle: wake → plan (if needed) → prioritize → execute → store learnings → rewrite (if triggered) → loop or exit.
