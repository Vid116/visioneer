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

## Recent Session (2024-12-01)

### What Was Done

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

## Roadmap / Backlog

| Item | Status | Notes |
|------|--------|-------|
| Continuous mode | Done | `npm run agent:continuous` |
| Memory research | Done | Recommendations in artifacts |
| Architecture docs | Done | `docs/ARCHITECTURE.md` |
| BM25 hybrid search | Planned | +20-30% retrieval improvement |
| Memory decay | Planned | Prevent infinite growth |
| Persistence scoring | Planned | Smart retention decisions |
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

*Last updated: 2024-12-01*
