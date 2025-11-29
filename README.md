# Visioneer

An autonomous AI agent that learns and builds for you. Give it a goal like "learn chess", "research blockchain APIs", or "build a working prototype" — and it will research, plan, execute tasks, and create real artifacts.

## Quick Start

```bash
# Set a goal
npm run goal "Learn the basics of chess openings"

# Let it run
npm run agent:continuous

# Watch progress (optional, in another terminal)
npm run dashboard
```

That's it. The agent researches, learns, writes code, and stores knowledge automatically.

## What It Does

1. **You set a goal** — anything from learning a topic to building a prototype
2. **Agent plans tasks** — breaks your goal into concrete steps
3. **Agent executes** — researches the web, reads articles, writes code/docs
4. **Knowledge builds up** — facts, insights, and artifacts accumulate
5. **You watch or intervene** — monitor progress, answer questions if needed

### Example Goals

- `"Learn the basics of chess"` — researches openings, tactics, stores key concepts
- `"Research blockchain APIs for NFT tracking"` — compares providers, documents findings
- `"Build a REST API for todo management"` — writes actual working code
- `"Understand how transformers work in ML"` — studies papers, creates explanations

## Commands

| Command | What it does |
|---------|--------------|
| `npm run goal "..."` | Set a new goal |
| `npm run goal` | Show current goal |
| `npm run agent:continuous` | Run until done or blocked |
| `npm run agent:cycle` | Run one task only |
| `npm run dashboard` | Live progress view |
| `npm run status` | Static status report |
| `npm run answer` | List pending questions |
| `npm run answer <id> "..."` | Answer a question |
| `npm run db:reset` | Wipe everything, start fresh |

## Watching Progress

### Live Dashboard

```bash
npm run dashboard
```

Shows real-time updates every 2 seconds:
- Current goal and phase
- Progress bar with task counts
- Recent activity (web searches, tool use, completions)
- Pending questions that need your input

**Controls:** `q` quit | `r` refresh | `a` answer questions

### Static Status

```bash
npm run status
```

One-time snapshot of current state.

## What It Produces

Everything is stored and persists across sessions:

- **Knowledge chunks** — facts, insights, decisions (searchable)
- **Artifacts** — code files, documents, research notes (in `./artifacts/<project-id>/`)
- **Task history** — what was planned, executed, completed
- **Activity log** — timestamped record of all actions

## Answering Questions

Sometimes the agent needs your input to continue:

```bash
# See what's pending
npm run answer

# Respond to a question
npm run answer abc123 "Use PostgreSQL instead of SQLite"
```

The agent will unblock and continue with your answer.

## Tips

- **Let it run** — `npm run agent:continuous` handles everything automatically
- **Watch the dashboard** — see what it's researching and building in real-time
- **Answer quickly** — blocked tasks wait for your input
- **Check artifacts** — look in `./artifacts/` for generated code and docs
- **Cost awareness** — each cycle uses ~$0.10-0.20 in API calls
- **Fresh start** — `npm run db:reset` wipes everything if needed

## Setup

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone <repo>
cd visioneer
npm install
```

### API Keys

Copy the example and add your keys:

```bash
cp .env.example .env
```

Required keys in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...    # Claude - the reasoning engine
OPENAI_API_KEY=sk-...           # Embeddings for semantic search
SERPER_API_KEY=...              # Web search (get free key at serper.dev)
```

### Initialize

```bash
npm run db:init
```

### Verify

```bash
npm run status
```

You should see "No active project" — ready to set your first goal!

## How It Works (Technical)

Visioneer uses a three-layer architecture:

1. **Command Layer** — interprets your goals, reports progress
2. **Vision Layer** — maintains strategic coherence, plans tasks
3. **Execution Layer** — does the work (research, writing, building)

Supported by a **Memory System**:
- **Orientation** — compressed project context (always loaded)
- **Working Memory** — active tasks, questions, blockers
- **Knowledge Store** — semantic search over all learned content

The agent can use tools:
- `web_search` — find information online
- `web_fetch` — read full articles/documentation  
- `write_artifact` — create code files, documents
- `read_artifact` — reference previously created files

See [HANDOFF.md](./HANDOFF.md) for full technical details.

## Project Structure

```
visioneer/
├── src/
│   ├── agent/       # Core agent logic (cycle, execution, planning)
│   ├── cli/         # Command-line tools (dashboard, goal, status)
│   ├── db/          # SQLite + vector store
│   └── embedding/   # OpenAI embeddings integration
├── artifacts/       # Generated files (code, docs) by project
├── visioneer.db     # All persistent data
└── visioneer.config.json  # Settings
```

## License

MIT
