# Visioneer Handoff Document

## What This Is

Visioneer is an autonomous AI agent architecture for long-running learning/execution projects. It takes high-level goals ("learn jazz piano", "build a product") and executes them over days/weeks — researching, planning, practicing, storing learnings.

## Current State: E2E Validated

All core phases complete and **proven working** with real API calls.

| Phase | Status | What It Does |
|-------|--------|--------------|
| 1. Foundation | ✅ | SQLite database, schema, CRUD operations |
| 2. Memory System | ✅ | Vector embeddings, semantic search, query planner |
| 3. Agent Loop | ✅ | Wake-up flow, task prioritization, execution loop |
| 4. Autonomous Execution | ✅ | Real Claude API calls, stores learnings, dependency unblocking |
| 5. Goal & Coherence | ✅ | Goal tracking, coherence warnings, auto-reprioritization |
| 6. E2E Validation | ✅ | Proven with chess learning test (6/6 criteria passed) |
| 7. Tool Use | ✅ | Web search, web fetch, artifact read/write |

## E2E Test Results (Chess Learning)

The system autonomously learned chess basics in 3 cycles:

| Criterion | Result |
|-----------|--------|
| At least 3 tasks completed | ✅ 3 completed |
| At least 5 knowledge chunks | ✅ 21 stored |
| Semantic search returns relevant results | ✅ "checkmate" query: 0.622 similarity |
| No crashes or unhandled errors | ✅ 0 errors |
| System reached execution phase | ✅ intake → research → execution |
| Learnings contain chess terms | ✅ 14 terms (pawn, knight, checkmate, castling...) |

**Run it yourself:**
```bash
npm run db:reset    # Reset database
npm run test:e2e    # Run chess learning test (~85 seconds)
```

## Quick Start

```bash
# Setup
npm install
cp .env.example .env  # Add your API keys
npm run db:init

# Run a learning project
npm run goal "Learn the basics of watercolor painting"
npm run agent:cycle   # Execute one task
npm run status        # See progress
```

## CLI Commands

```bash
npm run dashboard     # Live-updating terminal dashboard (q: quit, r: refresh, a: answer)
npm run status        # Project overview, task counts, recent activity
npm run agent:cycle   # Execute ONE task via Claude API
npm run answer        # List/answer open questions
npm run goal "..."    # Set project goal
npm run goal          # Show current goal
npm run goal --history # Show past goals
npm run warnings      # List coherence warnings
npm run warnings resolve <id> exec|skip|edit  # Resolve warnings
npm run db:reset      # Reset database
npm run test:e2e      # Run E2E validation test
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ORIENTATION LAYER                        │
│  Vision, goals, skill map, phase, priorities, progress       │
│  (Rewrites automatically on major milestones)                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      WORKING LAYER                           │
│  Tasks (ready/blocked/done), Questions, Activity Log         │
│  6-factor prioritization with goal alignment                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     KNOWLEDGE LAYER                          │
│  Chunks (research, insights, decisions), Embeddings          │
│  Relationships (supports, contradicts, builds_on)            │
└─────────────────────────────────────────────────────────────┘
```

## Agent Cycle Flow

```
1. Wake Up         → Load orientation, tasks, questions
2. Prioritize      → Score tasks by 6 factors including goal alignment
3. Coherence Check → Is top task aligned with goal? If not, skip & warn
4. Execute         → Claude API executes task, returns learnings
5. Store           → Save learnings as knowledge chunks with embeddings
6. Update          → Mark task done, unblock dependents
7. Apply Goals     → If pending goal exists, activate it now
8. Orientation     → Check if rewrite triggered (milestone/threshold)
```

## Key Files

```
src/
├── agent/
│   ├── wakeup.ts              # State reconstruction on wake
│   ├── prioritization.ts      # 6-factor task scoring (incl. goal alignment)
│   ├── execution.ts           # Work loop, result handling, coherence checks
│   ├── executor.ts            # Claude API integration with tool loop
│   ├── cycle.ts               # Single cycle runner
│   ├── coherence.ts           # Coherence checking module
│   ├── orientation-rewrite.ts # Auto-rewrite orientation on triggers
│   └── tools/
│       ├── index.ts           # Tool definitions for Claude API
│       └── executor.ts        # Tool implementations (search, fetch, artifacts)
├── cli/
│   ├── dashboard.ts           # Live-updating terminal dashboard
│   ├── status.ts              # Project status display
│   ├── answer.ts              # Question answering
│   ├── goal.ts                # Goal management CLI
│   └── warnings.ts            # Coherence warnings CLI
├── db/
│   ├── schema.sql             # Database schema
│   ├── queries.ts             # All CRUD operations
│   └── vector-store.ts        # In-memory embeddings + SQLite persistence
├── embedding/
│   ├── index.ts               # Embedding provider factory
│   └── openai.ts              # OpenAI embeddings (text-embedding-3-large)
├── retrieval/
│   └── planner.ts             # Query routing (semantic vs tags vs relationships)
└── mcp/
    ├── orientation.ts         # MCP server (tested)
    ├── working.ts             # MCP server (untested)
    └── knowledge.ts           # MCP server (untested)
tests/
└── e2e-chess-test.ts          # End-to-end validation test
```

## Database Tables

| Table | Purpose |
|-------|---------|
| projects | Project containers |
| orientation | Strategic brain (JSON blob per project) |
| tasks | Work items with status, dependencies |
| questions | Blocking questions awaiting answers |
| activities | Audit log of all actions |
| chunks | Knowledge pieces with type, confidence |
| chunk_embedding_map | Links chunks to vector embeddings |
| relationships | Connections between chunks |
| goals | Goal history with outcomes |
| pending_goals | Queued goals for mid-cycle changes |
| coherence_warnings | Flagged off-track tasks |

## Environment Setup

```bash
# .env file needs:
OPENAI_API_KEY=sk-...      # For embeddings (text-embedding-3-large)
ANTHROPIC_API_KEY=sk-...   # For Claude executor (claude-sonnet-4)
SERPER_API_KEY=...         # For web search tool

# Install and initialize:
npm install
npm run db:init
npm run status
```

## What Works

- **Database layer**: Solid, well-tested
- **Semantic search**: Real OpenAI embeddings (text-embedding-3-large, 3072 dims)
- **Wake-up flow**: Clean state reconstruction
- **Task prioritization**: 6 factors, explainable scores
- **Execution loop**: Handles complete/blocked/partial/failed
- **Claude executor**: Real API calls, stores learnings with embeddings
- **Dependency unblocking**: Auto-unblocks when deps complete
- **Goal tracking**: History, pending queue, mid-cycle safety
- **Coherence checking**: Flags off-track tasks before execution (saves API costs)
- **Orientation rewrite**: Claude-powered updates on milestones
- **Query planner**: Routes queries to optimal retrieval method
- **Co-retrieval tracking**: Records which chunks retrieved together
- **Relationship evolution**: Strengthens connections on use, weakens on contradiction
- **E2E test**: Proves autonomous learning works
- **Tool use in executor**: web_search (Serper), web_fetch (HTML extraction), write_artifact, read_artifact
- **Tool loop**: Handles multiple tool calls per task, feeds results back to Claude
- **Real research**: Agent reads actual web sources, extracts specific facts

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Vector storage | In-memory + SQLite persistence | Avoids native deps (sqlite-vss Windows issues), fast enough for <10k chunks |
| Embedding model | text-embedding-3-large (3072 dims) | Best quality, configurable via config |
| Relationship decay | Only on contradiction, not time | Storage is cheap, old connections may become relevant |
| Task execution | One task per cycle | Simpler debugging, easier oversight |
| Orientation rewrite | Claude-powered compression | Maintains semantic quality vs rule-based truncation |
| Coherence checking | Pre-execution gate | Catch drift before wasting API calls |

## API Costs (Approximate)

The E2E chess test (3 cycles, 85 seconds):
- ~3 Claude Sonnet calls (executor)
- ~3 Claude Sonnet calls (orientation rewrites)
- ~25 OpenAI embedding calls (chunks + searches)

Estimate: **~$0.10-0.20 per cycle** depending on context size.

With tools enabled:
- Serper API: ~$0.001 per search (1000 free searches on signup)
- Tool-enabled cycles cost more (additional Claude tokens for tool loop)

Cost scales with:
- Number of learnings stored (embedding costs)
- Task complexity (longer Claude responses)
- Orientation size (rewrite costs)
- Tool usage (more API round-trips)

## Config Options (visioneer.config.json)

| Setting | Default | What it does |
|---------|---------|--------------|
| embedding.model | text-embedding-3-large | Which embedding model |
| embedding.dimensions | 3072 | Vector size |
| knowledge.min_similarity_threshold | 0.7 | Semantic search cutoff |
| knowledge.coretrieval_threshold | 3 | Co-retrievals before implicit relationship |
| agent.model | claude-sonnet-4-20250514 | Executor model |
| orientation.activity_trigger_count | 50 | Activities before rewrite |

## Tools Configuration

Tools are configured in `visioneer.config.json`:

```json
"tools": {
  "web_search": { "enabled": true, "provider": "serper", "max_results": 5 },
  "web_fetch": { "enabled": true, "max_content_length": 10000 },
  "artifacts": { "enabled": true, "directory": "./artifacts" }
}
```

Required API keys in `.env`:
- `SERPER_API_KEY` - For web search

Disable tools by setting `"enabled": false` in config.

**Test tools manually:**
```bash
npx tsx tests/test-tools.ts
```

## Roadmap (Planned Order)

1. ~~**Tool Use in Executor**~~ ✅ Complete
   - ~~Give Claude web_search, web_fetch, write_artifact, read_artifact~~
   - ~~Transform from "thinking" to "researching and creating"~~

2. ~~**CLI Oversight Dashboard**~~ ✅ Complete
   - ~~Live-updating terminal dashboard (`npm run dashboard`)~~
   - ~~Shows progress bar, task/knowledge counts, recent activity~~
   - ~~Tool calls logged to activity feed~~
   - ~~Keyboard controls: q (quit), r (refresh), a (answer questions)~~

3. **Oversight Web UI** ← NEXT
   - Web-based dashboard for browser access
   - View knowledge graph visualization
   - More advanced question answering interface

4. **Harder Goals**
   - Test with domains requiring real research
   - Multi-source synthesis
   - Longer learning arcs

## What's Next (Backlog)

| Component | State |
|-----------|-------|
| CLI Dashboard | ✅ Complete - `npm run dashboard` |
| Oversight Web UI | Web dashboard, knowledge graph visualization |
| Multi-task cycle | One task per `agent:cycle` for now |
| Scheduled triggers | No cron/timer yet |
| MCP working/knowledge servers | Built but untested |
| Notifications | No alerts for questions/milestones |
| Sub-agent spawning | Single Claude call per task |
| Continuous learning mode | Run multiple cycles automatically |
