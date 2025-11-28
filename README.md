# Visioneer

**Autonomous AI Agent Architecture for Long-Running Learning and Execution Projects**

Visioneer is a system that takes high-level directives ("learn piano", "speak German", "build a product") and executes them autonomously — researching, planning, practicing, and iterating over days, weeks, or months.

## Core Principles

- **Memory over context**: Reconstructs state from persistent memory, not conversation history
- **Asynchronous by default**: Questions are queued, work continues on unblocked tasks
- **Reasoning, not retrieval**: Deduces, infers, and learns — not just stores and fetches
- **Coherent vision**: All activity is checked against the original goal to prevent drift

## Architecture

### Three-Layer Agent Architecture

1. **Command Layer**: Human interface — receives directives, reports progress, surfaces questions
2. **Vision Layer**: Strategic mind — holds goals, success criteria, runs coherence checks
3. **Execution Layer**: Operational mind — performs tasks, research, practice, generates artifacts

### Three-Tier Memory System

1. **Orientation Layer**: Compressed project context, always loaded first ("project README")
2. **Working Layer**: Active tasks, open questions, blockers, activity log
3. **Knowledge Layer**: Deep storage with semantic search and evolving relationships

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd visioneer

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# - ANTHROPIC_API_KEY (required)
# - OPENAI_API_KEY (for embeddings)

# Initialize the database
npm run db:init
```

### Configuration

Edit `visioneer.config.json` to customize:

- Embedding provider and model
- Database location
- Orientation rewrite triggers
- Relationship evolution parameters
- Retrieval settings

## Usage

### With Claude Code

Add the MCP servers to your Claude Code configuration:

```json
{
  "mcpServers": {
    "visioneer-orientation": {
      "command": "npx",
      "args": ["tsx", "src/mcp/orientation.ts"],
      "cwd": "/path/to/visioneer"
    },
    "visioneer-working": {
      "command": "npx",
      "args": ["tsx", "src/mcp/working.ts"],
      "cwd": "/path/to/visioneer"
    },
    "visioneer-knowledge": {
      "command": "npx",
      "args": ["tsx", "src/mcp/knowledge.ts"],
      "cwd": "/path/to/visioneer"
    }
  }
}
```

### Running Individual Servers

```bash
# Start the orientation server
npm run mcp:orientation

# Start the working layer server
npm run mcp:working

# Start the knowledge layer server
npm run mcp:knowledge
```

### Development

```bash
# Run with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Reset database
npm run db:reset
```

## MCP Tools

### Orientation Server

- `create_project` - Initialize a new project
- `get_orientation` - Get project context (call first on wake-up)
- `update_orientation` - Rewrite orientation document
- `list_projects` - List all projects

### Working Server

- `get_tasks` - Get tasks (filterable by status/skill)
- `create_task` - Create a new task
- `update_task` - Update task status/outcome
- `get_questions` - Get open/answered questions
- `create_question` - Queue a question (non-blocking)
- `answer_question` - Record answer, unblock tasks
- `get_blockers` - Get all blocked tasks with reasons
- `log_activity` - Log an action
- `get_recent_activity` - Get activity history

### Knowledge Server

- `store_chunk` - Store knowledge with embedding
- `search_semantic` - Vector similarity search
- `search_tags` - Tag-based retrieval
- `get_related` - Traverse relationships
- `create_relationship` - Create explicit relationship
- `strengthen_relationship` - Increase relationship weight
- `weaken_relationship` - Decrease weight (decay on contradiction)
- `get_chunk` - Get specific chunk
- `get_contradictions` - Find contradicting knowledge

## Project Structure

```
visioneer/
├── src/
│   ├── index.ts              # Entry point
│   ├── mcp/                   # MCP servers
│   │   ├── orientation.ts
│   │   ├── working.ts
│   │   └── knowledge.ts
│   ├── db/                    # Database layer
│   │   ├── schema.sql
│   │   ├── connection.ts
│   │   ├── queries.ts
│   │   └── init.ts
│   ├── embedding/             # Embedding providers
│   │   ├── interface.ts
│   │   ├── openai.ts
│   │   └── index.ts
│   └── utils/                 # Utilities
│       ├── types.ts
│       ├── config.ts
│       └── logger.ts
├── visioneer.config.json      # Configuration
├── package.json
└── tsconfig.json
```

## Current Status (Phases 1-3 Complete)

### What's Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| **Database Layer** | Complete | SQLite with full schema, CRUD operations |
| **Vector Store** | Complete | In-memory cosine similarity with SQLite persistence |
| **Embedding Provider** | Complete | OpenAI integration + mock provider for testing |
| **MCP Servers** | Complete | All three servers (orientation, working, knowledge) |
| **Semantic Search** | Complete | Query embedding → cosine similarity → ranked results |
| **Co-Retrieval Tracking** | Complete | Tracks chunks retrieved together, creates implicit relationships |
| **Query Planner** | Complete | 5 query types: operational, lookup, exploration, connection, hybrid |
| **Wake-Up Flow** | Complete | State reconstruction, status detection, summary generation |
| **Task Prioritization** | Complete | 5-factor scoring: priority, dependencies, balance, phase, age |
| **Execution Loop** | Complete | Task processing with learning storage |

### What's Stubbed / Mock

| Component | Current State | What's Needed |
|-----------|---------------|---------------|
| **Task Executor** | Mock only (`mockSuccessExecutor`) | Real Claude API integration |
| **Orientation Rewrite** | Not triggered | Implement rewrite triggers & LLM-based compression |
| **Agent Prompts** | Not implemented | Claude prompts for Vision/Execution layers |
| **Coherence Checks** | Not implemented | Verify actions against orientation |
| **Drift Detection** | Not implemented | Track when agent strays from goals |

### What Requires Human Intervention

1. **Project Initialization**: Creating projects and setting initial orientation
2. **Answering Questions**: Questions block tasks until a human answers
3. **API Keys**: Must provide `OPENAI_API_KEY` for real embeddings (or use mock)
4. **Configuration**: Setting up `visioneer.config.json` for your use case

### Path to Autonomous Operation

**Phase 4: Claude Agent Integration** (Next)
- Implement real `TaskExecutor` using Claude API
- Add Vision Layer prompts for coherence checking
- Add Execution Layer prompts for task execution
- Wire up MCP servers as Claude tools

**Phase 5: Orientation Hygiene**
- Implement automatic orientation rewrites
- Add progress snapshots after milestones
- Compress old decisions and learnings

**Phase 6: Command Layer**
- Human-facing interface (CLI or web)
- Progress reporting
- Question surfacing
- Directive input

### Running Tests

```bash
# Run all tests
npm test

# Run integration test (full cycle)
npx tsx src/test-integration.ts

# Run agent loop test
npx tsx src/test-agent-loop.ts

# Run with mock embeddings (no API key needed)
VISIONEER_EMBEDDING_PROVIDER=mock npx tsx src/test-integration.ts
```

### Known Limitations

1. **Windows Compatibility**: sqlite-vss not available; using in-memory vector store instead
2. **Embedding Costs**: Each semantic search requires an API call (use mock for development)
3. **No Persistence Across Restarts**: Vector index is rebuilt from SQLite on startup
4. **Single Project Focus**: Currently optimized for one active project at a time

## Roadmap

See `docs/visioneer-technical-specification.md` for the complete specification including:

- Wake-up flow implementation
- Task prioritization logic
- Orientation rewrite triggers
- Agent layer prompts
- Query planner logic

## License

MIT
