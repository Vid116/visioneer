# Visioneer Handoff Document

## What This Is

Visioneer is an autonomous AI agent architecture for long-running learning/execution projects. It takes high-level goals ("learn jazz piano", "build a product") and executes them over days/weeks — researching, planning, practicing, storing learnings.

## Current State: Production Ready

All core phases complete and **proven working** with real Claude Agent SDK execution.

| Phase | Status | What It Does |
|-------|--------|--------------|
| 1. Foundation | Done | SQLite database, schema, CRUD operations |
| 2. Memory System | Done | Vector embeddings, semantic search, query planner |
| 3. Agent Loop | Done | Wake-up flow, task prioritization, execution loop |
| 4. Autonomous Execution | Done | Claude SDK execution, stores learnings, dependency unblocking |
| 5. Goal & Coherence | Done | Goal tracking, coherence warnings, auto-reprioritization |
| 6. E2E Validation | Done | Proven with chess learning test (6/6 criteria passed) |
| 7. Tool Use | Done | WebSearch, WebFetch, Read, Write, Bash, Glob, Grep via SDK |
| 8. Continuous Mode | Done | `npm run agent:continuous` runs until complete/blocked |
| 9. Memory Research | Done | Comprehensive research on improving memory system |

## Recent Sessions

### Session 2024-12-01 (Latest) - Phase 1 Memory Prep

**Focus:** Preparing for Phase 1 memory system improvements

#### What Was Done

1. **Complete Codebase Analysis for Memory Improvements**
   - Documented all key files and their roles in memory system
   - Mapped embedding generation flow: `embed()` → `storeChunk()` → `storeVectorEmbedding()`
   - Identified all modification points for Phase 1 improvements

2. **Key Technical Findings**
   - **Embedding trigger:** Caller generates via `embed()` then passes to `storeChunk()` (execution.ts:561-588)
   - **DB connection:** Singleton pattern with statement caching (connection.ts)
   - **SDK parsing:** Streams messages, extracts JSON from markdown code blocks (executor.ts:263-353)
   - **No migrations:** Schema uses `IF NOT EXISTS` - need ALTER TABLE for new columns
   - **Tests:** Vitest + E2E tests with mock executors

3. **Phase 1 Implementation Plan Ready**
   - Entry points identified for BM25, decay, persistence scoring
   - Schema changes needed: add `strength`, `persistence_score`, `last_decay` to chunks
   - Hybrid retrieval modification point: `retrieval/planner.ts:executeHybridQuery()`

#### Key Entry Points for Memory Improvements

| What to Modify | File | Function/Location |
|----------------|------|-------------------|
| Add BM25 search | `src/db/queries.ts` | Add `searchBM25()` alongside `searchSemantic()` |
| Hybrid retrieval | `src/retrieval/planner.ts:466-539` | Modify `executeHybridQuery()` |
| Memory decay | `src/db/queries.ts` | Add `decayChunkStrength()` function |
| Persistence scoring | `src/db/queries.ts:541-581` | Modify `storeChunk()` to calculate score |
| Chunk schema changes | `src/db/schema.sql:88-104` | Add `strength`, `persistence_score` columns |
| Re-ranking | `src/retrieval/planner.ts` | Add cross-encoder after semantic search |
| Contextual headers | `src/embedding/index.ts` | Modify `embed()` to prepend context |

---

### Session 2024-12-01 (Earlier) - Bug Fixes & Docs

#### What Was Done

1. **Fixed Continuous Mode Exit Bug**
   - Problem: Agent stopped when all tasks done but `progress_snapshot` showed incomplete areas
   - Root cause: No connection between task completion and progress tracking
   - Fix: Added re-planning trigger in `cycle.ts:97-113` when tasks=done but progress<100%
   - Also updated `planner.ts` to be progress-aware

2. **Created Architecture Documentation**
   - New file: `docs/ARCHITECTURE.md` (500+ lines)
   - Documents all 3 layers, data flow, execution cycle, database schema
   - Includes known issues and extension points

3. **Organized Research Artifacts**
   - `artifacts/memory-research/` - 15 files on memory improvements
   - `artifacts/chess-research/` - 7 files from chess learning tests
   - Cleaned up duplicate/orphan folders

4. **Memory Research Completed**
   - 59 tasks executed autonomously
   - Produced actionable recommendations for memory improvements
   - Key findings in `artifacts/memory-research/visioneer-memory-executive-summary.md`

### Key Memory Research Findings

Top 5 quick wins identified:
| # | Improvement | Effort | Impact |
|---|-------------|--------|--------|
| 1 | Add BM25 Keyword Search | ~3 days | +20-30% retrieval |
| 2 | Persistence Score Calculator | ~2 days | Smart retention |
| 3 | Basic Decay Functions | ~2 days | Stops memory bloat |
| 4 | Contextual Chunk Headers | ~2 days | +35-49% retrieval |
| 5 | Cross-Encoder Re-ranking | ~1 day | +15-30% accuracy |

Ready-to-implement formulas:
```
Persistence Score:  PS = 0.25F + 0.20E + 0.25C + 0.15R + 0.15I
Decay (Exponential): S(t) = S0 x e^(-0.05t)  [14-day half-life]
Rank Fusion:        RRF(d) = Sum 1/(60 + rank_i(d))
```

## Quick Start

```bash
# Setup
npm install
cp .env.example .env  # Add your API keys
npm run db:init

# Run a learning project
npm run goal "Learn the basics of watercolor painting"
npm run agent:continuous   # Run until complete/blocked
npm run status             # See progress
```

## CLI Commands

```bash
# Core Operations
npm run goal "..."         # Set a new goal
npm run agent:continuous   # Run agent continuously until done
npm run status             # Show current status with progress
npm run answer             # Answer pending questions

# Monitoring
npm run dashboard          # Live-updating terminal dashboard
npm run tasks              # List all tasks
npm run warnings           # List coherence warnings

# Database
npm run db:reset           # Reset database
npm run db:init            # Initialize database

# Testing
npm run test:e2e           # Run E2E validation test
npm run sdk:test           # Test SDK connectivity
```

## Architecture Overview

See `docs/ARCHITECTURE.md` for full details.

```
ORIENTATION LAYER (Strategic Brain)
├── Vision, goals, priorities, constraints
├── Skill map with dependencies
├── Progress tracking per area (progress_snapshot)
└── Versioned, rewrites on milestones

WORKING LAYER (Operational State)
├── Tasks (ready -> in_progress -> done/blocked)
├── Questions (open -> answered)
├── Activity log
└── Goal queue (active + pending)

KNOWLEDGE LAYER (Memory)
├── Chunks (research, insight, decision, attempt)
├── Embeddings (3072-dim vectors via OpenAI)
├── Relationships (supports, contradicts, builds_on)
└── Semantic search via cosine similarity
```

## Agent Cycle Flow

```
1. Wake Up         -> Load orientation, tasks, questions
2. Plan (if needed) -> Break goal into tasks when:
                      - No tasks exist
                      - Goal changed
                      - All tasks done but progress < 100%
3. Prioritize      -> Score tasks by 6 factors (goal, priority, deps...)
4. Execute         -> Claude SDK with full tools (25 turns max)
5. Store           -> Save learnings as chunks with embeddings
6. Update          -> Mark task done, unblock dependents
7. Rewrite         -> Update orientation if milestone hit
8. Loop/Exit       -> Continue if more tasks, else stop
```

## Key Files

```
src/
├── agent/
│   ├── cycle.ts              # Main cycle runner (single + continuous)
│   ├── wakeup.ts             # State reconstruction on wake
│   ├── planner.ts            # Goal-to-tasks planning via SDK
│   ├── executor.ts           # Task execution via SDK
│   ├── execution.ts          # Work loop, result handling
│   ├── prioritization.ts     # 6-factor task scoring
│   ├── orientation-rewrite.ts # SDK-based orientation updates
│   └── coherence.ts          # Off-track detection (currently disabled)
├── cli/
│   ├── status.ts             # Status display with progress
│   ├── dashboard.ts          # Live terminal dashboard
│   ├── answer.ts             # Question answering
│   └── goal.ts               # Goal management
├── db/
│   ├── schema.sql            # Database schema
│   ├── queries.ts            # All CRUD operations
│   └── vector-store.ts       # In-memory embeddings + SQLite
├── embedding/
│   └── index.ts              # OpenAI text-embedding-3-large
└── retrieval/
    └── planner.ts            # Query routing (semantic/tags/relationships)

docs/
└── ARCHITECTURE.md           # Comprehensive architecture documentation

artifacts/
├── memory-research/          # 15 files - memory improvement research
└── chess-research/           # 7 files - chess learning artifacts
```

## Database Tables

| Table | Purpose |
|-------|---------|
| projects | Project containers |
| orientation | Strategic brain (JSON blob per project) |
| tasks | Work items with status, dependencies, failure tracking |
| questions | Blocking questions awaiting answers |
| activities | Audit log of all actions |
| chunks | Knowledge pieces with type, confidence |
| chunk_embeddings_store | Vector embeddings (in-memory + SQLite) |
| relationships | Connections between chunks |
| goals | Goal history with outcomes |
| pending_goals | Queued goals for mid-cycle changes |
| coherence_warnings | Flagged off-track tasks |

## Environment Setup

```bash
# .env file needs:
OPENAI_API_KEY=sk-...      # Required: For embeddings (text-embedding-3-large)

# Optional:
SERPER_API_KEY=...         # For web search (SDK has built-in WebSearch)

# NOT recommended (uses API credits instead of subscription):
# ANTHROPIC_API_KEY=sk-...
```

**Note:** Do NOT set `ANTHROPIC_API_KEY` if you have a Claude subscription. The SDK will automatically use your subscription when this key is absent.

## Known Issues / Gaps

### 1. Coherence Check Disabled
**Location:** `execution.ts:179`
```typescript
const COHERENCE_CHECK_ENABLED = false;
```
The coherence check that verifies tasks align with the current goal is disabled. It was blocking too many valid tasks.

### 2. Progress Tracking is Manual
The `progress_snapshot` in orientation is updated by the orientation rewrite (Claude), not automatically from task completion. This can cause disconnects.

### 3. No BM25 Keyword Search
Currently only semantic (embedding) search. Research recommends hybrid retrieval with BM25.

### 4. No Memory Decay
Chunks persist forever. No forgetting mechanism implemented yet.

### 5. Single Embedding Provider
Only OpenAI supported. Voyage and Ollama providers are stubbed but not implemented.

## What Works Well

- **Database layer**: Solid, well-tested SQLite with proper schema
- **Semantic search**: Real OpenAI embeddings (3072 dims), cosine similarity
- **Wake-up flow**: Clean state reconstruction from persistent storage
- **Task prioritization**: 6-factor scoring with goal alignment
- **Execution loop**: Handles complete/blocked/partial/failed states
- **SDK executor**: Full tool access, up to 25 turns per task
- **Goal tracking**: History, pending queue, mid-cycle safety
- **Orientation rewrite**: Claude-powered updates on milestones
- **Continuous mode**: Runs until complete or blocked
- **Artifact management**: Saves research outputs to files

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Vector storage | In-memory + SQLite | Avoids native deps, fast for <10k chunks |
| Embedding model | text-embedding-3-large | Best quality, 3072 dimensions |
| Task execution | One task per cycle iteration | Simpler debugging, easier oversight |
| Tool access | Full SDK tools | WebSearch, Read, Write, Bash, etc. |
| Orientation rewrite | Claude-powered | Maintains semantic quality |
| Coherence check | Pre-execution (disabled) | Was too aggressive |

## SDK Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VISIONEER                                │
│   "The Memory & Context Brain"                              │
│   - Orientation, knowledge chunks, task management          │
│   - Provides context to Claude                              │
│   - Stores learnings from Claude                            │
└────────────────────────┬────────────────────────────────────┘
                         │ provides context + task
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 CLAUDE CODE (Agent SDK)                     │
│   "The Execution Hands"                                     │
│   - Does the actual work (research, file ops, etc.)         │
│   - Full tool access via subscription                       │
│   - Returns structured results + learnings                  │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps: Phase 1 Memory Improvements

**Ready to implement.** All research complete, entry points identified.

### Implementation Order (Recommended)

1. **Schema Changes** (do first)
   ```sql
   ALTER TABLE chunks ADD COLUMN strength REAL DEFAULT 1.0;
   ALTER TABLE chunks ADD COLUMN persistence_score REAL;
   ALTER TABLE chunks ADD COLUMN last_decay TIMESTAMP;
   ```

2. **BM25 Keyword Search** (~3 days)
   - Add `searchBM25()` in `queries.ts`
   - Implement term frequency / inverse document frequency
   - Or use SQLite FTS5 for built-in support

3. **Hybrid Retrieval** (~1 day after BM25)
   - Modify `executeHybridQuery()` in `retrieval/planner.ts`
   - Implement RRF: `score = 1/(60 + semantic_rank) + 1/(60 + bm25_rank)`

4. **Persistence Scoring** (~2 days)
   - Modify `storeChunk()` to calculate: `PS = 0.25F + 0.20E + 0.25C + 0.15R + 0.15I`
   - F=fundamentality, E=expertise, C=connectivity, R=recency, I=importance

5. **Memory Decay** (~2 days)
   - Add `decayChunkStrength()` function
   - Formula: `S(t) = S0 × e^(-0.05t)` (14-day half-life)
   - Run as background job or on access

## Roadmap / Backlog

| Item | Status | Notes |
|------|--------|-------|
| Continuous mode | Done | `npm run agent:continuous` |
| Memory research | Done | Recommendations in artifacts |
| Architecture docs | Done | `docs/ARCHITECTURE.md` |
| Phase 1 prep | Done | Entry points identified, ready to implement |
| BM25 hybrid search | **Next** | +20-30% retrieval improvement |
| Persistence scoring | **Next** | Smart retention decisions |
| Memory decay | **Next** | Prevent infinite growth |
| Cross-encoder re-ranking | Planned | +15-30% accuracy |
| Contextual chunk headers | Planned | +35-49% retrieval |
| Web oversight UI | Planned | Browser-based dashboard |
| Knowledge graph viz | Planned | Visualize chunk relationships |
| Multi-project support | Planned | Currently single project |

## Test Commands

```bash
npm run test:e2e              # Full E2E chess learning test
npm run sdk:test              # Basic SDK connectivity
npm run status                # Quick health check
```

## Cost Estimates

With Claude subscription (recommended):
- Embeddings: ~$0.01 per 1000 chunks (OpenAI)
- SDK execution: Included in subscription

Without subscription (API credits):
- ~$0.10-0.20 per task execution cycle
- Scales with context size and tool usage

---

*Last updated: 2024-12-01 (Phase 1 prep session)*
