# Visioneer Technical Specification

**Version 1.0 — Comprehensive Implementation Guide**

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technical Stack](#2-technical-stack)
3. [Architecture](#3-architecture)
4. [MCP Server API Specifications](#4-mcp-server-api-specifications)
5. [Data Schemas](#5-data-schemas)
6. [Relationship Evolution System](#6-relationship-evolution-system)
7. [Query Planner & Retrieval](#7-query-planner--retrieval)
8. [Wake-Up Flow](#8-wake-up-flow)
9. [Orientation Rewrite Logic](#9-orientation-rewrite-logic)
10. [Agent Layer Instructions](#10-agent-layer-instructions)
11. [Configuration](#11-configuration)
12. [File Structure](#12-file-structure)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. System Overview

### 1.1 What Visioneer Is

Visioneer is an autonomous AI agent architecture designed for long-running learning and execution projects. The system takes high-level directives ("learn piano", "speak German", "build a product") and executes them autonomously — researching, planning, practicing, and iterating over days, weeks, or months.

### 1.2 Core Design Principles

| Principle | Description |
|-----------|-------------|
| **Memory over context** | The system reconstructs state from persistent memory, not conversation history. The agent can "wake up" with minimal context and know exactly where it is. |
| **Asynchronous by default** | Questions are queued, work continues on unblocked tasks. The system only stops when absolutely nothing can proceed without user input. |
| **Reasoning, not retrieval** | The system deduces, infers, and learns — not just stores and fetches. It makes connections that aren't explicitly stated. |
| **Coherent vision** | All activity is checked against the original goal to prevent drift. The Vision Layer maintains strategic coherence. |
| **Evolving relationships** | Knowledge connections strengthen and shift based on experience, forming associative memory that reflects actual usage patterns. |

### 1.3 What the System Does

1. Receives a high-level directive from a human
2. Develops understanding of the domain through research
3. Decomposes the goal into a skill/task map
4. Executes tasks autonomously (research, practice, building)
5. Tracks progress and learns from outcomes
6. Asks questions when needed (non-blocking)
7. Reports back in human-understandable terms
8. Maintains coherence with the original vision throughout

---

## 2. Technical Stack

| Component | Decision | Rationale |
|-----------|----------|-----------|
| **Interface** | Claude Code (CLI/terminal) | Primary entry point for human interaction |
| **Agent Model** | Claude (via Claude Code) | Layered agents matching system architecture |
| **Orchestration** | MCP Servers + Sub-agents | Clean separation of concerns, persistent state |
| **Storage** | SQLite + sqlite-vss | Hybrid structured + vector storage in single file |
| **Embeddings** | Configurable (default: text-embedding-3-large) | Best quality, swappable via config |
| **Vector Search** | sqlite-vss extension | Embedded vector DB, no external dependencies |

### 2.1 Why This Stack

- **SQLite**: Single file, no server, portable, battle-tested
- **sqlite-vss**: Vector search without spinning up a separate service
- **MCP Servers**: Claude Code native, clean tool interfaces, persistent across sessions
- **Configurable embeddings**: Start with best quality, can swap for cost/speed later

---

## 3. Architecture

### 3.1 Three-Layer Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      COMMAND LAYER                          │
│         Human interface — intent & translation              │
│                                                             │
│  • Receives directives from human                           │
│  • Parses intent, asks clarifying questions                 │
│  • Translates internal state to human-readable reports      │
│  • Decides what to show vs. keep internal                   │
└─────────────────────────────────────────────────────────────┘
                             ↕
┌─────────────────────────────────────────────────────────────┐
│                      VISION LAYER                           │
│           Strategic mind — goals & coherence                │
│                                                             │
│  • Holds success criteria and constraints                   │
│  • Maintains skill/task map                                 │
│  • Runs coherence checks against original goal              │
│  • Detects drift, rabbit holes, blind spots                 │
│  • Triggers Orientation rewrites                            │
└─────────────────────────────────────────────────────────────┘
                             ↕
┌─────────────────────────────────────────────────────────────┐
│                     EXECUTION LAYER                         │
│          Operational mind — tasks & actions                 │
│                                                             │
│  • Breaks strategic goals into concrete tasks               │
│  • Performs research, practice, building, testing           │
│  • Interacts with tools and external systems                │
│  • Reports results back to Vision Layer                     │
└─────────────────────────────────────────────────────────────┘
                             ↕
┌─────────────────────────────────────────────────────────────┐
│                     MEMORY SYSTEM                           │
│        Persistent substrate — three-tier storage            │
│                                                             │
│  • Orientation Layer (fast context)                         │
│  • Working Layer (operational state)                        │
│  • Knowledge Layer (deep storage + relationships)           │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Three-Tier Memory Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ORIENTATION LAYER                         │
│              "What's this project? Where am I?"             │
│                                                             │
│  Single compressed document per project. Always loaded      │
│  first. The "project README" for fast orientation.          │
│                                                             │
│  Contains: vision summary, skill map, current phase,        │
│  key decisions, active priorities, progress snapshot        │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    WORKING LAYER                            │
│               "What's active right now?"                    │
│                                                             │
│  Structured operational state. Supports direct queries.     │
│                                                             │
│  Contains: tasks (with status, blockers), open questions,   │
│  activity log, pending decisions, explicit blockers         │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                   KNOWLEDGE LAYER                           │
│              "Everything learned & stored"                  │
│                                                             │
│  Deep storage with semantic search and relationships.       │
│                                                             │
│  Contains: tagged chunks with confidence levels,            │
│  evolving relationships, full history                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. MCP Server API Specifications

### 4.1 Server: `visioneer-orientation`

Manages the compressed project context documents.

#### `get_orientation`
```
Parameters:
  - project_id: string (uuid)

Returns:
  - orientation: Orientation object (see schema)

Description:
  Retrieves the current orientation document for a project.
  This should be the FIRST call when waking up on a project.
```

#### `update_orientation`
```
Parameters:
  - project_id: string (uuid)
  - orientation: Orientation object

Returns:
  - success: boolean
  - updated_at: timestamp

Description:
  Replaces the orientation document. Used during rewrite triggers.
  Archives previous version to Knowledge Layer before overwriting.
```

#### `list_projects`
```
Parameters:
  - none

Returns:
  - projects: Array of { project_id, vision_summary, current_phase, last_updated }

Description:
  Lists all projects with minimal info for selection.
```

#### `create_project`
```
Parameters:
  - vision_summary: string
  - success_criteria: string[]
  - constraints: string[] (optional)

Returns:
  - project_id: string (uuid)
  - orientation: Orientation object

Description:
  Initializes a new project with starting orientation.
```

---

### 4.2 Server: `visioneer-working`

Manages operational state — tasks, questions, blockers.

#### `get_tasks`
```
Parameters:
  - project_id: string (uuid)
  - status: string (optional) — "ready" | "in_progress" | "blocked" | "done"
  - skill_area: string (optional)

Returns:
  - tasks: Task[]

Description:
  Retrieves tasks, optionally filtered by status or skill area.
```

#### `create_task`
```
Parameters:
  - project_id: string (uuid)
  - title: string
  - description: string
  - skill_area: string
  - depends_on: string[] (optional) — task IDs

Returns:
  - task: Task

Description:
  Creates a new task. Status defaults to "ready" unless dependencies are incomplete.
```

#### `update_task`
```
Parameters:
  - task_id: string (uuid)
  - updates: {
      status?: string,
      blocked_by?: string[],  // question IDs
      description?: string,
      outcome?: string        // when completing
    }

Returns:
  - task: Task

Description:
  Updates task fields. Changing status to "done" triggers potential Orientation rewrite.
```

#### `get_questions`
```
Parameters:
  - project_id: string (uuid)
  - status: string (optional) — "open" | "answered"

Returns:
  - questions: Question[]

Description:
  Retrieves questions, optionally filtered by status.
```

#### `create_question`
```
Parameters:
  - project_id: string (uuid)
  - question: string
  - context: string
  - blocks_tasks: string[] (optional) — task IDs to mark as blocked

Returns:
  - question: Question

Description:
  Queues a question for the user. If blocks_tasks provided, those tasks
  are automatically updated to status "blocked" with blocked_by set.
```

#### `answer_question`
```
Parameters:
  - question_id: string (uuid)
  - answer: string

Returns:
  - question: Question
  - unblocked_tasks: Task[]

Description:
  Records user's answer. Automatically unblocks any tasks that were
  waiting only on this question.
```

#### `get_blockers`
```
Parameters:
  - project_id: string (uuid)

Returns:
  - blockers: Array of {
      task: Task,
      blocked_by: Question[] | Task[],
      blocker_type: "question" | "dependency"
    }

Description:
  Returns all blocked tasks with their blocker details.
```

#### `log_activity`
```
Parameters:
  - project_id: string (uuid)
  - action: string
  - details: object (optional)

Returns:
  - activity_id: string (uuid)

Description:
  Appends to the rolling activity log.
```

#### `get_recent_activity`
```
Parameters:
  - project_id: string (uuid)
  - limit: number (default: 20)

Returns:
  - activities: Activity[]

Description:
  Returns last N activities, most recent first.
```

---

### 4.3 Server: `visioneer-knowledge`

Manages deep knowledge storage, retrieval, and relationships.

#### `store_chunk`
```
Parameters:
  - project_id: string (uuid)
  - content: string
  - type: string — "research" | "insight" | "decision" | "resource" | "attempt" | "user_input"
  - tags: string[]
  - confidence: string — "verified" | "inferred" | "speculative"
  - source: string — "research" | "user" | "deduction" | "experiment"
  - related_to: Array of { chunk_id, relationship_type } (optional)

Returns:
  - chunk: Chunk

Description:
  Stores new knowledge. Automatically generates embedding for semantic search.
  If related_to provided, creates explicit relationships.
```

#### `search_semantic`
```
Parameters:
  - project_id: string (uuid)
  - query: string
  - limit: number (default: 10)
  - min_similarity: float (default: 0.7)
  - filters: {
      types?: string[],
      tags?: string[],
      confidence?: string[],
      since?: timestamp
    } (optional)

Returns:
  - results: Array of { chunk: Chunk, similarity: float }

Description:
  Vector similarity search with optional filters.
  Records co-retrieval for implicit relationship strengthening.
```

#### `search_tags`
```
Parameters:
  - project_id: string (uuid)
  - tags: string[] — chunks must have ALL these tags
  - any_tags: string[] (optional) — chunks must have AT LEAST ONE of these
  - confidence: string[] (optional)
  - limit: number (default: 50)

Returns:
  - chunks: Chunk[]

Description:
  Structured tag-based retrieval.
```

#### `get_related`
```
Parameters:
  - chunk_id: string (uuid)
  - relationship_type: string (optional) — filter by type
  - min_weight: float (default: 0.1)
  - limit: number (default: 20)
  - direction: string (default: "both") — "outgoing" | "incoming" | "both"

Returns:
  - relationships: Array of {
      chunk: Chunk,
      relationship: Relationship,
      direction: "outgoing" | "incoming"
    }

Description:
  Traverses relationships from a chunk. Sorted by relationship score.
  Updates last_activated on traversed relationships.
```

#### `create_relationship`
```
Parameters:
  - from_chunk_id: string (uuid)
  - to_chunk_id: string (uuid)
  - type: string — "supports" | "contradicts" | "builds_on" | "replaces" | "requires" | "related_to"
  - weight: float (default: 0.5)
  - context_tags: string[] (optional)

Returns:
  - relationship: Relationship

Description:
  Creates an explicit relationship between chunks.
  If relationship already exists, updates it (merges context_tags, takes max weight).
```

#### `strengthen_relationship`
```
Parameters:
  - from_chunk_id: string (uuid)
  - to_chunk_id: string (uuid)
  - amount: float (default: 0.05)

Returns:
  - relationship: Relationship

Description:
  Increases relationship weight (capped at 1.0).
  Called automatically on co-retrieval, but can also be called explicitly.
  Updates activation_count and last_activated.
```

#### `weaken_relationship`
```
Parameters:
  - from_chunk_id: string (uuid)
  - to_chunk_id: string (uuid)
  - reason: string — "contradicted" | "replaced" | "manual"
  - amount: float (default: 0.3)

Returns:
  - relationship: Relationship

Description:
  Decreases relationship weight. Used when new knowledge contradicts old.
  If weight drops below 0.05, relationship is archived (not deleted).
```

#### `get_chunk`
```
Parameters:
  - chunk_id: string (uuid)

Returns:
  - chunk: Chunk (with full metadata)

Description:
  Retrieves a specific chunk by ID.
```

#### `get_contradictions`
```
Parameters:
  - project_id: string (uuid)
  - unresolved_only: boolean (default: true)

Returns:
  - contradictions: Array of {
      chunk_a: Chunk,
      chunk_b: Chunk,
      relationship: Relationship,
      detected_at: timestamp
    }

Description:
  Returns chunks with "contradicts" relationships for review.
```

---

## 5. Data Schemas

### 5.1 Orientation

```typescript
interface Orientation {
  project_id: string;           // uuid
  vision_summary: string;       // What we're trying to achieve
  success_criteria: string[];   // Concrete, testable outcomes
  constraints: string[];        // Time, resources, priorities
  skill_map: SkillNode[];       // Decomposition of the vision
  current_phase: Phase;         // Where we are in the lifecycle
  key_decisions: Decision[];    // Major decisions (compressed)
  active_priorities: string[];  // What matters NOW
  progress_snapshot: Progress[];// High-level progress by area
  last_rewritten: timestamp;
  version: number;              // Increments on each rewrite
}

interface SkillNode {
  skill: string;                // e.g., "chord voicings"
  parent: string | null;        // Parent skill if nested
  dependencies: string[];       // Other skills required first
  status: "not_started" | "in_progress" | "achieved";
  notes: string;                // Compressed context
}

interface Decision {
  decision: string;             // What was decided
  reasoning: string;            // Why (compressed)
  date: timestamp;
}

interface Progress {
  area: string;                 // Skill or task area
  status: "not_started" | "early" | "progressing" | "nearly_done" | "complete";
  percent: number | null;       // Optional percentage
  blockers: string[];           // What's preventing progress
}

type Phase = 
  | "intake"      // Understanding the goal
  | "research"    // Investigating the domain
  | "planning"    // Building the skill/task map
  | "execution"   // Doing the work
  | "refinement"  // Polishing, filling gaps
  | "complete";   // Done
```

### 5.2 Task

```typescript
interface Task {
  id: string;                   // uuid
  project_id: string;           // uuid
  title: string;
  description: string;
  status: TaskStatus;
  skill_area: string;           // Links to skill_map
  depends_on: string[];         // Task IDs
  blocked_by: string[];         // Question IDs
  outcome: string | null;       // What happened (when done)
  created_at: timestamp;
  updated_at: timestamp;
  started_at: timestamp | null;
  completed_at: timestamp | null;
}

type TaskStatus = "ready" | "in_progress" | "blocked" | "done";
```

### 5.3 Question

```typescript
interface Question {
  id: string;                   // uuid
  project_id: string;           // uuid
  question: string;             // The actual question
  context: string;              // Why we're asking, what we know
  status: "open" | "answered";
  answer: string | null;
  blocks_tasks: string[];       // Task IDs waiting on this
  asked_at: timestamp;
  answered_at: timestamp | null;
}
```

### 5.4 Chunk

```typescript
interface Chunk {
  id: string;                   // uuid
  project_id: string;           // uuid
  content: string;              // The actual knowledge
  type: ChunkType;
  tags: string[];               // Topic, skill area, phase, etc.
  confidence: Confidence;
  source: Source;
  created_at: timestamp;
  last_accessed: timestamp;
  last_useful: timestamp | null;// When it was actually helpful
  embedding: Float32Array;      // Vector for semantic search
}

type ChunkType = 
  | "research"     // Found from external sources
  | "insight"      // Deduced or realized
  | "decision"     // Choice made and why
  | "resource"     // URL, book, tool reference
  | "attempt"      // Something tried (success or failure)
  | "user_input";  // Direct from user

type Confidence = 
  | "verified"     // Tested, confirmed, proven
  | "inferred"     // Deduced, seems right
  | "speculative"; // Might be useful, unvalidated

type Source = 
  | "research"     // External investigation
  | "user"         // User told us
  | "deduction"    // Reasoned from other knowledge
  | "experiment";  // Tried and observed
```

### 5.5 Relationship

```typescript
interface Relationship {
  id: string;                   // uuid
  from_chunk_id: string;        // uuid
  to_chunk_id: string;          // uuid
  type: RelationshipType;
  weight: number;               // 0.0 - 1.0
  last_activated: timestamp;
  activation_count: number;
  context_tags: string[];       // When does this apply?
  origin: "explicit" | "implicit";
  created_at: timestamp;
}

type RelationshipType =
  | "supports"      // Evidence or reasoning that backs up
  | "contradicts"   // Conflicts with
  | "builds_on"     // Extends or elaborates
  | "replaces"      // Supersedes (old info)
  | "requires"      // Dependency (must know X to use Y)
  | "related_to";   // General association
```

### 5.6 Activity

```typescript
interface Activity {
  id: string;                   // uuid
  project_id: string;           // uuid
  action: string;               // What happened
  details: object | null;       // Additional context
  timestamp: timestamp;
}
```

---

## 6. Relationship Evolution System

### 6.1 Dual Evolution Mechanism

Relationships evolve through two complementary mechanisms:

#### Explicit (Agent-Driven)

The agent consciously creates and manages structural relationships when it recognizes important connections:

```
Triggers:
  - Learning something that contradicts prior knowledge
  - Discovering that one concept requires another
  - Finding evidence that supports or refutes an insight
  - Deciding to replace outdated information

Actions:
  - Call create_relationship() with appropriate type
  - Set initial weight based on confidence (verified: 0.8, inferred: 0.5, speculative: 0.3)
  - Add context_tags for when this relationship applies
```

#### Implicit (System-Driven)

The system observes usage patterns and silently strengthens connections:

```
Mechanism:
  1. Every semantic search records which chunks were returned together
  2. Every relationship traversal records which paths were followed
  3. Background process (runs after each session or every N operations):
     - Analyze co-retrieval patterns
     - If chunks A and B retrieved together > 3 times with no relationship:
       → Create relationship(type: "related_to", origin: "implicit", weight: 0.2)
     - If relationship exists:
       → Call strengthen_relationship(amount: 0.05)
  4. Cap weight at 1.0

Co-retrieval Table:
  - chunk_a_id: uuid
  - chunk_b_id: uuid
  - session_id: uuid
  - timestamp: timestamp
  - query_context: string (the search that retrieved them)
```

### 6.2 Decay Policy

**Relationships decay ONLY on contradiction, not over time.**

```
Rationale:
  - Storage is effectively unlimited
  - Old associations may become relevant again
  - Time-based decay loses potentially valuable connections
  - Contradiction-based decay is semantically meaningful

When decay happens:
  - New chunk stored with type "contradicts" relationship to old chunk
  - Old chunk's outgoing relationships weakened by 0.3
  - If weight < 0.05, relationship archived (moved to archive table, not deleted)
  
When replacement happens:
  - New chunk stored with type "replaces" relationship to old chunk
  - Old chunk marked as superseded (still searchable but deprioritized)
  - Old chunk's relationships transferred to new chunk at 50% weight
```

### 6.3 Retrieval Scoring

When traversing relationships, connections are scored:

```
score = weight × recency_factor × context_match

Where:
  - weight: Base relationship strength (0.0 - 1.0)
  
  - recency_factor: Boost for recently activated relationships
    = 1.0 + (0.5 × e^(-days_since_activation / 30))
    Range: 1.0 (old) to 1.5 (just used)
    
  - context_match: How well relationship's context_tags match current query
    = (matching_tags / total_context_tags) if context_tags exist
    = 1.0 if no context_tags (always applies)

Results sorted by score descending.
```

---

## 7. Query Planner & Retrieval

### 7.1 Query Types

| Query Type | Example | Primary Mechanism |
|------------|---------|-------------------|
| **Operational** | "What's blocked?" | SQLite structured query (Working Layer) |
| **Lookup** | "What did we decide about X?" | Tag filter + keyword match |
| **Exploration** | "What do I know about rhythm?" | Semantic search |
| **Connection** | "What contradicts this?" | Relationship traversal |
| **Hybrid** | "Recent insights about chord theory" | Semantic + time filter + type filter |

### 7.2 Query Planner Logic

```python
def plan_query(query: str, context: dict) -> QueryPlan:
    """
    Analyzes the query and returns an execution plan.
    """
    
    # Detect query type from patterns
    if is_operational_query(query):
        # "What's blocked?", "What can I do?", "Open questions?"
        return QueryPlan(
            type="operational",
            target="working_layer",
            method="structured_query"
        )
    
    if is_specific_lookup(query):
        # "What did we decide about X?", "The resource for Y"
        return QueryPlan(
            type="lookup",
            target="knowledge_layer",
            method="tag_filter",
            params=extract_lookup_params(query)
        )
    
    if is_relationship_query(query):
        # "What contradicts X?", "What builds on this?", "Related to Y?"
        return QueryPlan(
            type="connection",
            target="knowledge_layer",
            method="relationship_traversal",
            params=extract_relationship_params(query)
        )
    
    if is_exploration_query(query):
        # "What do I know about X?", "Everything on topic Y"
        return QueryPlan(
            type="exploration",
            target="knowledge_layer",
            method="semantic_search",
            params={"query": extract_semantic_query(query)}
        )
    
    # Default: hybrid approach
    return QueryPlan(
        type="hybrid",
        target="knowledge_layer",
        method="semantic_then_filter_then_expand",
        params=extract_hybrid_params(query)
    )
```

### 7.3 Hybrid Retrieval (Fallback)

When query type is unclear, use sequential approach:

```
Step 1: Semantic Search (broad)
  - Run search_semantic() with extracted query terms
  - Get top 20 results
  
Step 2: Filter (narrow)
  - Apply any detected filters (time, type, confidence, tags)
  - Reduce to top 10
  
Step 3: Expand (enrich)
  - For top 5 results, run get_related() 
  - Add strongly related chunks (weight > 0.6)
  - Deduplicate
  
Step 4: Rank & Return
  - Score by: semantic_similarity × recency × confidence_weight
  - Return top N based on context needs
```

### 7.4 Confidence Weights in Retrieval

```
confidence_weight:
  - verified: 1.0
  - inferred: 0.8
  - speculative: 0.5

Applied as multiplier in final ranking.
Can be overridden by query (e.g., "include speculative")
```

---

## 8. Wake-Up Flow

### 8.1 Complete Wake-Up Sequence

```python
async def wake_up(project_id: str, trigger: WakeTrigger) -> AgentState:
    """
    Called when agent starts working on a project.
    Reconstructs full context from memory.
    """
    
    # Step 1: Load Orientation (ALWAYS FIRST)
    orientation = await orientation_server.get_orientation(project_id)
    log(f"Project: {orientation.vision_summary}")
    log(f"Phase: {orientation.current_phase}")
    log(f"Priorities: {orientation.active_priorities}")
    
    # Step 2: Load Working State
    tasks = await working_server.get_tasks(project_id)
    questions = await working_server.get_questions(project_id, status="open")
    blockers = await working_server.get_blockers(project_id)
    recent_activity = await working_server.get_recent_activity(project_id, limit=10)
    
    # Step 3: Check for Answered Questions
    newly_answered = await working_server.get_questions(
        project_id, 
        status="answered",
        since=last_wake_time
    )
    
    # Step 4: Process Answers → Unblock Tasks
    for question in newly_answered:
        # Store answer as knowledge
        await knowledge_server.store_chunk(
            project_id=project_id,
            content=f"Q: {question.question}\nA: {question.answer}",
            type="user_input",
            tags=["user_answer", question.context_tags...],
            confidence="verified",
            source="user"
        )
        # Tasks auto-unblocked by answer_question(), but verify
        
    # Step 5: Evaluate Work Queue
    actionable = [t for t in tasks if t.status == "ready"]
    in_progress = [t for t in tasks if t.status == "in_progress"]
    blocked = [t for t in tasks if t.status == "blocked"]
    
    if not actionable and not in_progress:
        if blocked and all_blocked_on_questions(blocked, questions):
            return AgentState(
                status="waiting_for_user",
                pending_questions=questions,
                message="All work blocked on unanswered questions"
            )
    
    # Step 6: Prioritize Work
    prioritized = prioritize_tasks(actionable, orientation, recent_activity)
    
    # Step 7: Return Ready State
    return AgentState(
        status="ready",
        orientation=orientation,
        current_task=prioritized[0] if prioritized else None,
        task_queue=prioritized[1:],
        open_questions=questions,
        context_loaded=True
    )
```

### 8.2 Work Execution Loop

```python
async def execute_work_loop(state: AgentState):
    """
    Main execution loop after wake-up.
    """
    
    while state.status == "ready" and state.current_task:
        task = state.current_task
        
        # Mark task in progress
        await working_server.update_task(task.id, {"status": "in_progress"})
        await working_server.log_activity(
            state.project_id,
            f"Starting: {task.title}"
        )
        
        # Execute task (this is where actual work happens)
        result = await execute_task(task, state.orientation)
        
        # Handle result
        if result.status == "complete":
            await working_server.update_task(task.id, {
                "status": "done",
                "outcome": result.outcome
            })
            # Store learnings
            for learning in result.learnings:
                await knowledge_server.store_chunk(
                    project_id=state.project_id,
                    content=learning.content,
                    type=learning.type,
                    tags=learning.tags,
                    confidence=learning.confidence,
                    source="experiment"
                )
            # Check for orientation rewrite trigger
            if should_rewrite_orientation(task, state.orientation):
                await rewrite_orientation(state.project_id)
                
        elif result.status == "blocked":
            # Create question (non-blocking)
            question = await working_server.create_question(
                project_id=state.project_id,
                question=result.question,
                context=result.context,
                blocks_tasks=[task.id]
            )
            await working_server.log_activity(
                state.project_id,
                f"Blocked on: {result.question}"
            )
            
        elif result.status == "needs_research":
            # Queue research task, continue with next
            await working_server.create_task(
                project_id=state.project_id,
                title=f"Research: {result.topic}",
                description=result.description,
                skill_area=task.skill_area
            )
        
        # Move to next task
        state.task_queue = prioritize_tasks(
            await working_server.get_tasks(state.project_id, status="ready"),
            state.orientation,
            await working_server.get_recent_activity(state.project_id)
        )
        state.current_task = state.task_queue[0] if state.task_queue else None
    
    # End of loop - either done or blocked
    await working_server.log_activity(
        state.project_id,
        f"Session complete. Tasks done: {tasks_completed}, Questions pending: {len(state.open_questions)}"
    )
```

### 8.3 Task Prioritization

```python
def prioritize_tasks(tasks: List[Task], orientation: Orientation, recent: List[Activity]) -> List[Task]:
    """
    Orders tasks by priority based on multiple factors.
    """
    
    def score(task: Task) -> float:
        score = 0.0
        
        # Factor 1: Active priorities (from orientation)
        for i, priority in enumerate(orientation.active_priorities):
            if priority.lower() in task.skill_area.lower() or priority.lower() in task.title.lower():
                score += (10 - i)  # Earlier priorities score higher
        
        # Factor 2: Dependencies satisfied
        # Tasks with all dependencies done score higher
        if not task.depends_on:
            score += 5
        
        # Factor 3: Skill area balance
        # Avoid doing too many tasks in same area consecutively
        recent_areas = [a.details.get("skill_area") for a in recent if a.details]
        if task.skill_area in recent_areas[-3:]:
            score -= 2
        
        # Factor 4: Phase alignment
        # Research tasks score higher in research phase, etc.
        if orientation.current_phase == "research" and "research" in task.title.lower():
            score += 3
        if orientation.current_phase == "execution" and "practice" in task.title.lower():
            score += 3
            
        return score
    
    return sorted(tasks, key=score, reverse=True)
```

---

## 9. Orientation Rewrite Logic

### 9.1 Rewrite Triggers

#### Event-Based (Primary)

| Event | Trigger Condition |
|-------|-------------------|
| **Major milestone** | Task completed where skill_area matches a top-level skill in skill_map |
| **Phase transition** | Agent explicitly signals moving to new phase |
| **Key decision** | Decision made that affects success criteria or constraints |
| **Goal modification** | User changes success criteria or vision |
| **Question batch answered** | 3+ questions answered that were blocking work |
| **Significant learning** | Chunk stored with confidence "verified" that changes skill_map understanding |

#### Fallback (Precautionary)

| Condition | Trigger |
|-----------|---------|
| **Size threshold** | Orientation document exceeds 2500 tokens |
| **Time threshold** | 48+ hours since last rewrite with active work happening |
| **Activity threshold** | 50+ activities logged since last rewrite |

### 9.2 Rewrite Process

```python
async def rewrite_orientation(project_id: str):
    """
    Compresses and updates the orientation document.
    """
    
    # Step 1: Gather current state
    current_orientation = await orientation_server.get_orientation(project_id)
    tasks = await working_server.get_tasks(project_id)
    recent_activity = await working_server.get_recent_activity(project_id, limit=50)
    recent_decisions = await knowledge_server.search_tags(
        project_id,
        tags=["decision"],
        since=current_orientation.last_rewritten
    )
    recent_insights = await knowledge_server.search_tags(
        project_id,
        tags=["insight"],
        confidence=["verified", "inferred"],
        since=current_orientation.last_rewritten
    )
    
    # Step 2: Archive current orientation
    await knowledge_server.store_chunk(
        project_id=project_id,
        content=serialize_orientation(current_orientation),
        type="decision",
        tags=["orientation_archive", f"v{current_orientation.version}"],
        confidence="verified",
        source="deduction"
    )
    
    # Step 3: Compute updates
    new_orientation = {
        "project_id": project_id,
        "vision_summary": current_orientation.vision_summary,  # Usually unchanged
        "success_criteria": current_orientation.success_criteria,  # Unless modified
        "constraints": current_orientation.constraints,
        
        # UPDATE: Skill map based on completed tasks and new understanding
        "skill_map": update_skill_map(
            current_orientation.skill_map,
            tasks,
            recent_insights
        ),
        
        # UPDATE: Phase based on progress
        "current_phase": determine_phase(tasks, current_orientation),
        
        # COMPRESS: Only keep last 5-7 key decisions
        "key_decisions": compress_decisions(
            current_orientation.key_decisions,
            recent_decisions
        )[-7:],
        
        # UPDATE: Based on current blockers and progress
        "active_priorities": compute_priorities(
            tasks,
            current_orientation.skill_map,
            recent_activity
        ),
        
        # UPDATE: Fresh progress snapshot
        "progress_snapshot": compute_progress(
            tasks,
            current_orientation.skill_map
        ),
        
        "last_rewritten": now(),
        "version": current_orientation.version + 1
    }
    
    # Step 4: Write new orientation
    await orientation_server.update_orientation(project_id, new_orientation)
    
    # Step 5: Log the rewrite
    await working_server.log_activity(
        project_id,
        "Orientation rewritten",
        {"version": new_orientation["version"], "trigger": trigger_reason}
    )
```

### 9.3 Compression Strategies

```python
def compress_decisions(old_decisions: List[Decision], new_decisions: List[Chunk]) -> List[Decision]:
    """
    Keeps decisions that still matter, compresses reasoning.
    """
    all_decisions = old_decisions + [
        Decision(
            decision=chunk.content.split("\n")[0],  # First line is decision
            reasoning=chunk.content.split("\n")[1] if "\n" in chunk.content else "",
            date=chunk.created_at
        )
        for chunk in new_decisions
    ]
    
    # Keep if: still relevant, recent, or foundational
    relevant = [d for d in all_decisions if is_still_relevant(d)]
    
    # Compress reasoning to single sentence
    for d in relevant:
        if len(d.reasoning) > 100:
            d.reasoning = summarize_to_sentence(d.reasoning)
    
    return relevant

def update_skill_map(current_map: List[SkillNode], tasks: List[Task], insights: List[Chunk]) -> List[SkillNode]:
    """
    Updates skill map based on completed work and new understanding.
    """
    updated = []
    for node in current_map:
        # Update status based on tasks
        related_tasks = [t for t in tasks if t.skill_area == node.skill]
        done_tasks = [t for t in related_tasks if t.status == "done"]
        
        if len(done_tasks) == len(related_tasks) and related_tasks:
            node.status = "achieved"
        elif done_tasks:
            node.status = "in_progress"
        
        # Update notes with relevant insights
        relevant_insights = [i for i in insights if node.skill.lower() in i.tags]
        if relevant_insights:
            node.notes = summarize_insights(relevant_insights)
        
        updated.append(node)
    
    return updated
```

---

## 10. Agent Layer Instructions

### 10.1 Command Layer System Prompt

```markdown
# Command Layer — Human Interface

You are the human-facing component of the Visioneer system. Your responsibilities:

## Inbound (Human → System)
1. Receive directives and parse intent
2. Ask clarifying questions when the goal is ambiguous
3. Translate requests into structured goals for the Vision Layer
4. Handle multi-part or complex requests by decomposing them

## Outbound (System → Human)
1. Present progress in clear, appropriate detail
2. Decide what to show based on context:
   - Quick check-in → Summary mode
   - Debugging/concerned → Detail mode
   - Explicit request → Full access mode
3. Surface questions that need human input
4. Never dump raw internal state — translate and filter

## Presentation Modes

### Summary
"I've completed 3 of 7 milestones. Currently working on ear training. On track."

### Progress Detail
"This week I focused on chord voicings. Learned 12 patterns across major, minor, and dominant 7th. Struggled with drop-2 voicings — will revisit with different approach."

### Reasoning Trace
"I prioritized ear training over repertoire because the skill map shows it's a dependency for improvisation, which is core to success criteria."

### Uncertainty Flag
"I'm not sure whether to focus on jazz standards or blues progressions first. Both seem valid paths. Do you have a preference?"

## Rules
- Be concise unless asked for detail
- Flag blockers and questions prominently
- Don't apologize excessively for limitations
- If asked about internal process, explain clearly
- Adapt tone to user's apparent mood/urgency
```

### 10.2 Vision Layer System Prompt

```markdown
# Vision Layer — Strategic Mind

You are the strategic coordinator of the Visioneer system. Your responsibilities:

## Core Functions
1. Hold the vision — success criteria, constraints, what "done" looks like
2. Maintain the skill map — decomposition of goal into learnable parts
3. Run coherence checks — does current work serve the vision?
4. Detect problems — drift, rabbit holes, imbalanced progress, blind spots
5. Trigger orientation rewrites when significant changes occur

## Coherence Checking

Ask regularly:
- Is current work directly serving a success criterion?
- Are we making balanced progress across required skills?
- Have we been in the same area too long? (potential rabbit hole)
- Are there critical areas we haven't touched? (blind spots)
- Has the goal drifted from original intent?

## Phase Management

Recognize and signal phase transitions:
- intake → research: Goal is clear, need domain knowledge
- research → planning: Domain understood, need structure
- planning → execution: Plan exists, ready to do work
- execution → refinement: Core work done, need polish
- refinement → complete: Success criteria met

## Priority Setting

Consider:
1. Dependencies — what unlocks other work?
2. Success criteria alignment — what's most core?
3. Current blockers — what would unblock the most?
4. Balance — are any areas neglected?
5. User signals — any explicit preferences?

## Rules
- Never lose sight of the original vision
- Challenge the Execution Layer if work seems off-track
- Be willing to adjust plans based on learning
- Keep Orientation accurate and current
- Surface strategic concerns to Command Layer
```

### 10.3 Execution Layer System Prompt

```markdown
# Execution Layer — Operational Mind

You are the action-taker of the Visioneer system. Your responsibilities:

## Core Functions
1. Break strategic goals into concrete, actionable tasks
2. Execute tasks — research, practice, build, test
3. Interact with external tools and systems
4. Report results back to Vision Layer
5. Store learnings in Knowledge Layer

## Task Execution

For each task:
1. Understand what success looks like for THIS task
2. Pull relevant knowledge from memory
3. Execute with focus
4. Document what happened — successes AND failures
5. Store meaningful learnings (not everything)

## Research Tasks

When researching:
1. Search semantically for existing knowledge first
2. Identify gaps in current understanding
3. Gather information from reliable sources
4. Make deductions — what's implied but not stated?
5. Store with appropriate confidence levels

## Learning Tasks

When practicing/learning:
1. Apply knowledge in concrete attempts
2. Observe outcomes carefully
3. Identify what worked and what didn't
4. Update confidence levels based on results
5. Create relationships between connected concepts

## Handling Blocks

When stuck:
1. Can I make progress with what I know? → Continue
2. Would more research help? → Queue research task
3. Do I need user input? → Create question, move to next task
4. Is everything blocked? → Signal to Vision Layer

## Rules
- Bias toward action — try things
- Document failures as valuable learning
- Don't over-store — be selective about what's truly useful
- Create relationships when you notice connections
- Report honestly, including uncertainty
```

---

## 11. Configuration

### 11.1 Configuration File: `visioneer.config.json`

```json
{
  "version": "1.0",
  
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-large",
    "dimensions": 3072,
    "batch_size": 100
  },
  
  "storage": {
    "database_path": "./visioneer.db",
    "backup_enabled": true,
    "backup_interval_hours": 24
  },
  
  "orientation": {
    "max_tokens": 2500,
    "time_trigger_hours": 48,
    "activity_trigger_count": 50,
    "decisions_to_keep": 7,
    "priorities_to_keep": 5
  },
  
  "working": {
    "activity_log_size": 100,
    "task_history_days": 30
  },
  
  "knowledge": {
    "min_similarity_threshold": 0.7,
    "default_search_limit": 10,
    "coretrieval_threshold": 3,
    "implicit_relationship_initial_weight": 0.2,
    "strengthen_amount": 0.05,
    "weaken_amount": 0.3,
    "archive_weight_threshold": 0.05
  },
  
  "retrieval": {
    "recency_boost_halflife_days": 30,
    "confidence_weights": {
      "verified": 1.0,
      "inferred": 0.8,
      "speculative": 0.5
    }
  },
  
  "agent": {
    "model": "claude-sonnet-4-20250514",
    "max_tasks_per_session": 10,
    "question_batch_threshold": 3
  }
}
```

### 11.2 Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Embedding provider (if using OpenAI)
OPENAI_API_KEY=sk-...

# Optional overrides
VISIONEER_DB_PATH=./custom/path/visioneer.db
VISIONEER_CONFIG_PATH=./custom/config.json
VISIONEER_LOG_LEVEL=debug  # debug | info | warn | error
```

### 11.3 Embedding Provider Interface

```typescript
interface EmbeddingProvider {
  name: string;
  
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  
  dimensions: number;
}

// Implementations
class OpenAIEmbedding implements EmbeddingProvider { ... }
class VoyageEmbedding implements EmbeddingProvider { ... }
class OllamaEmbedding implements EmbeddingProvider { ... }  // Local option
```

---

## 12. File Structure

```
visioneer/
├── README.md
├── package.json
├── visioneer.config.json
├── .env
│
├── src/
│   ├── index.ts                 # Entry point
│   │
│   ├── mcp/                     # MCP Server implementations
│   │   ├── orientation.ts       # Orientation layer server
│   │   ├── working.ts           # Working layer server
│   │   └── knowledge.ts         # Knowledge layer server
│   │
│   ├── db/                      # Database layer
│   │   ├── schema.sql           # SQLite schema
│   │   ├── migrations/          # Schema migrations
│   │   ├── connection.ts        # DB connection handling
│   │   └── queries.ts           # Prepared queries
│   │
│   ├── embedding/               # Embedding providers
│   │   ├── interface.ts         # Provider interface
│   │   ├── openai.ts
│   │   ├── voyage.ts
│   │   └── ollama.ts
│   │
│   ├── agent/                   # Agent logic
│   │   ├── command.ts           # Command layer logic
│   │   ├── vision.ts            # Vision layer logic
│   │   ├── execution.ts         # Execution layer logic
│   │   ├── wakeup.ts            # Wake-up flow
│   │   └── prompts/             # System prompts
│   │       ├── command.md
│   │       ├── vision.md
│   │       └── execution.md
│   │
│   ├── retrieval/               # Retrieval system
│   │   ├── planner.ts           # Query planner
│   │   ├── semantic.ts          # Semantic search
│   │   ├── relationship.ts      # Relationship traversal
│   │   └── scoring.ts           # Result scoring
│   │
│   ├── orientation/             # Orientation management
│   │   ├── triggers.ts          # Rewrite trigger detection
│   │   ├── rewrite.ts           # Rewrite logic
│   │   └── compression.ts       # Compression strategies
│   │
│   └── utils/                   # Utilities
│       ├── config.ts            # Config loading
│       ├── logger.ts            # Logging
│       └── types.ts             # Shared types
│
├── tests/
│   ├── mcp/
│   ├── db/
│   ├── retrieval/
│   └── integration/
│
└── docs/
    ├── architecture.md
    ├── api.md
    └── deployment.md
```

---

## 13. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Basic infrastructure working

- [ ] SQLite database setup with schema
- [ ] sqlite-vss integration for vector search
- [ ] Basic MCP server structure (all three servers)
- [ ] Embedding provider interface + OpenAI implementation
- [ ] Configuration loading
- [ ] Basic CRUD operations for all schemas

**Deliverable:** Can store and retrieve chunks, tasks, questions via MCP

### Phase 2: Memory System (Week 3-4)

**Goal:** Full memory system operational

- [ ] Semantic search working
- [ ] Tag-based filtering
- [ ] Relationship creation and traversal
- [ ] Implicit relationship strengthening (co-retrieval tracking)
- [ ] Orientation read/write with compression
- [ ] Query planner implementation

**Deliverable:** Can search, relate, and retrieve knowledge intelligently

### Phase 3: Agent Loop (Week 5-6)

**Goal:** Basic autonomous operation

- [ ] Wake-up flow implementation
- [ ] Task prioritization
- [ ] Work execution loop
- [ ] Question handling (create, answer, unblock)
- [ ] Activity logging
- [ ] Orientation rewrite triggers

**Deliverable:** Agent can wake up, do work, and maintain state

### Phase 4: Intelligence (Week 7-8)

**Goal:** Smart behavior

- [ ] Command layer prompt + translation logic
- [ ] Vision layer coherence checking
- [ ] Execution layer task breakdown
- [ ] Decay on contradiction
- [ ] Context-aware relationship retrieval
- [ ] Phase detection and transitions

**Deliverable:** Agent behaves strategically, maintains coherence

### Phase 5: Polish & Testing (Week 9-10)

**Goal:** Production-ready

- [ ] Comprehensive testing
- [ ] Error handling and recovery
- [ ] Performance optimization
- [ ] Documentation
- [ ] Example projects (piano, language, coding)
- [ ] CLI polish

**Deliverable:** Ready for real use

---

## Appendix A: SQLite Schema

```sql
-- Projects
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orientation (one per project)
CREATE TABLE orientation (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),
    content TEXT NOT NULL,  -- JSON serialized Orientation
    last_rewritten TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- Tasks
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    skill_area TEXT,
    depends_on TEXT,  -- JSON array of task IDs
    blocked_by TEXT,  -- JSON array of question IDs
    outcome TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);

-- Questions
CREATE TABLE questions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    question TEXT NOT NULL,
    context TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    answer TEXT,
    blocks_tasks TEXT,  -- JSON array of task IDs
    asked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP
);

CREATE INDEX idx_questions_project_status ON questions(project_id, status);

-- Activity Log
CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    action TEXT NOT NULL,
    details TEXT,  -- JSON
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activities_project_time ON activities(project_id, timestamp DESC);

-- Knowledge Chunks
CREATE TABLE chunks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    tags TEXT NOT NULL,  -- JSON array
    confidence TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_useful TIMESTAMP
);

CREATE INDEX idx_chunks_project ON chunks(project_id);
CREATE INDEX idx_chunks_type ON chunks(project_id, type);
CREATE INDEX idx_chunks_confidence ON chunks(project_id, confidence);

-- Vector embeddings (sqlite-vss virtual table)
CREATE VIRTUAL TABLE chunk_embeddings USING vss0(
    embedding(3072)  -- Dimension matches embedding model
);

-- Relationships
CREATE TABLE relationships (
    id TEXT PRIMARY KEY,
    from_chunk_id TEXT NOT NULL REFERENCES chunks(id),
    to_chunk_id TEXT NOT NULL REFERENCES chunks(id),
    type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 0.5,
    last_activated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activation_count INTEGER DEFAULT 0,
    context_tags TEXT,  -- JSON array
    origin TEXT NOT NULL DEFAULT 'explicit',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_chunk_id, to_chunk_id, type)
);

CREATE INDEX idx_relationships_from ON relationships(from_chunk_id);
CREATE INDEX idx_relationships_to ON relationships(to_chunk_id);
CREATE INDEX idx_relationships_weight ON relationships(weight DESC);

-- Co-retrieval tracking (for implicit relationships)
CREATE TABLE coretrieval (
    id TEXT PRIMARY KEY,
    chunk_a_id TEXT NOT NULL REFERENCES chunks(id),
    chunk_b_id TEXT NOT NULL REFERENCES chunks(id),
    session_id TEXT NOT NULL,
    query_context TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_coretrieval_chunks ON coretrieval(chunk_a_id, chunk_b_id);

-- Archived relationships (decayed below threshold)
CREATE TABLE relationships_archive (
    id TEXT PRIMARY KEY,
    from_chunk_id TEXT NOT NULL,
    to_chunk_id TEXT NOT NULL,
    type TEXT NOT NULL,
    final_weight REAL NOT NULL,
    reason TEXT NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    original_data TEXT  -- JSON of full relationship
);
```

---

## Appendix B: Example Interaction Flow

```
USER: I want to learn jazz piano well enough to play at a jam session in 6 months

COMMAND LAYER:
  → Parses intent: Learn jazz piano, goal = jam session, timeline = 6 months
  → Identifies need for clarification
  
COMMAND → USER: "A few questions to help me plan:
  1. What's your current piano experience?
  2. How much time can you dedicate per day/week?
  3. Any specific jazz style preference (bebop, blues, standards)?"

USER: "I can read music and play classical at intermediate level. 
       About 1 hour per day. I love blues and standards."

COMMAND LAYER:
  → Stores answers as verified user_input chunks
  → Passes structured goal to Vision Layer:
    {
      goal: "Play jazz piano at jam session",
      timeline: "6 months",
      context: { experience: "intermediate classical", time: "1hr/day", style: ["blues", "standards"] },
      success_criteria: ["Comp through blues progression", "Play 3 standards", "Take a solo"]
    }

VISION LAYER:
  → Creates initial skill map:
    - Jazz harmony (requires: classical theory) 
    - Chord voicings (requires: jazz harmony)
    - Blues form (requires: basic harmony)
    - Standards repertoire (requires: chord voicings)
    - Improvisation (requires: chord voicings, ear training)
    - Ear training (parallel track)
    - Performance prep (requires: repertoire, improv)
  → Sets phase: research
  → Sets priorities: ["Jazz harmony basics", "Ear training start", "Blues form"]
  → Creates Orientation document
  → Queues research tasks to Execution Layer

EXECUTION LAYER:
  → Task: "Research jazz harmony fundamentals"
  → Searches existing knowledge: nothing relevant
  → Conducts research, stores findings as chunks
  → Creates relationships: jazz_voicings builds_on jazz_harmony
  → Reports back: "Researched ii-V-I progressions, shell voicings, guide tones"
  
  → Task: "Research blues form"
  → Stores 12-bar blues structure, common variations
  → Notes: "Blues simpler entry point than standards"
  
  → Task: "Find ear training approach"
  → Stores recommendation for interval recognition
  → Creates question: "Do you have any ear training apps you prefer, or should I recommend some?"
  → Continues to next task (non-blocking)

[... execution continues ...]

VISION LAYER (after research complete):
  → Coherence check: Research done, ready for planning
  → Triggers phase transition: research → planning
  → Triggers Orientation rewrite
  → New priorities: ["Build practice routine", "Start blues comping", "Begin ear training"]

[... and so on ...]
```

---

*End of Technical Specification*
