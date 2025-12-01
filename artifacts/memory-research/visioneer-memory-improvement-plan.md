# Visioneer Memory System Improvement Plan
## Synthesized Research → Actionable Implementation Roadmap

**Date:** January 2025
**Status:** Research Phase Complete → Ready for Implementation Planning
**Document Type:** Technical Improvement Plan

---

## Executive Summary

This document synthesizes findings from five research areas—knowledge graphs, cognitive science, retrieval strategies, contradiction handling, and forgetting mechanisms—into a concrete improvement roadmap for Visioneer's memory architecture. Changes are prioritized by **impact** (how much they improve memory quality) and **complexity** (implementation effort required).

### Key Strategic Directions

1. **Move beyond simple vector similarity** to typed, semantic relationships
2. **Implement principled forgetting** with decay functions and consolidation
3. **Deploy hybrid retrieval** combining semantic, keyword, and graph traversal
4. **Add explicit contradiction handling** with provenance tracking
5. **Engineer context selection** with adaptive, query-aware strategies

---

## Part 1: Architecture Changes

### 1.1 Three-Tier Memory Architecture

**Current State Assumption:** Flat memory storage with embedding-based retrieval

**Proposed Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKING MEMORY                            │
│  (Active session context, recent interactions)               │
│  - Fast access, limited capacity                             │
│  - Auto-expires after session/24 hours                       │
└─────────────────────────────────────────────────────────────┘
                              ↓ Consolidation
┌─────────────────────────────────────────────────────────────┐
│                    SEMANTIC MEMORY                           │
│  (Extracted facts, entities, relationships)                  │
│  - Knowledge graph structure                                 │
│  - Typed edges with confidence scores                        │
│  - Temporal validity tracking                                │
└─────────────────────────────────────────────────────────────┘
                              ↓ Abstraction
┌─────────────────────────────────────────────────────────────┐
│                    EPISODIC SUMMARIES                        │
│  (Patterns, goals, preferences, insights)                    │
│  - High-level abstractions                                   │
│  - Compressed from multiple episodes                         │
│  - Long-term persistence                                     │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Priority:** HIGH | **Complexity:** MEDIUM

**Rationale:** Mirrors biological complementary learning systems (hippocampus → neocortex). Prevents catastrophic interference from new learning while enabling fast encoding.

---

### 1.2 Memory Node Schema

**Required Fields for Each Memory:**

```typescript
interface VisioneerMemory {
  // Identity
  id: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'preference';
  category: string;  // domain-specific classification

  // Content
  content: any;
  summary: string;  // Compressed representation
  embedding: number[];

  // Temporal Tracking
  created_at: timestamp;
  last_accessed: timestamp;
  access_count: number;
  valid_from: timestamp;     // When knowledge became true
  valid_until: timestamp | null;  // When knowledge expires/expired

  // Strength & Decay
  current_strength: number;      // S(t) - decays over time
  initial_strength: number;      // S₀ - starting strength
  decay_function: 'exponential' | 'linear' | 'gaussian';
  decay_rate: number;            // λ or k parameter

  // Persistence Factors
  frequency_score: number;       // F - access frequency
  salience_score: number;        // E - importance proxy
  connection_density: number;    // C - graph centrality
  importance_marker: number;     // I - explicit importance (0-1)
  persistence_score: number;     // PS - computed composite

  // Provenance
  source: string;                // Where this came from
  source_confidence: number;     // How reliable is source
  extraction_confidence: number; // How confident was extraction
  original_context: string;      // Snippet from which derived

  // State Management
  status: 'active' | 'archived' | 'summarized' | 'tombstone';
  pinned: boolean;

  // Contradiction Tracking
  superseded_by: string | null;
  supersedes: string[];
  conflicts_with: string[];
}
```

**Implementation Priority:** HIGH | **Complexity:** LOW

---

### 1.3 Relationship Types Beyond Similarity

**Standard Relationship Taxonomy:**

| Category | Edge Types | Use Case |
|----------|------------|----------|
| **Hierarchical** | `IS_A`, `PART_OF`, `CONTAINS`, `INSTANCE_OF` | Taxonomy/ontology |
| **Temporal** | `PRECEDED_BY`, `FOLLOWED_BY`, `DURING`, `CAUSED_BY` | Event sequences |
| **Associative** | `RELATED_TO`, `SIMILAR_TO`, `ASSOCIATED_WITH` | Semantic connections |
| **Causal** | `CAUSED_BY`, `ENABLES`, `PREVENTS`, `DEPENDS_ON` | Reasoning chains |
| **Epistemic** | `SUPPORTS`, `CONTRADICTS`, `REFINES`, `QUALIFIES` | Knowledge relationships |
| **Visioneer-Specific** | `LEARNED_FROM`, `APPLIED_IN`, `TASK_REQUIRES`, `GOAL_SUPPORTS` | Learning system |

**Edge Properties:**

```typescript
interface VisioneerEdge {
  id: string;
  source: string;        // Source node ID
  target: string;        // Target node ID
  type: string;          // From taxonomy above

  // Confidence
  confidence: number;    // 0-1 score
  confidence_source: 'verified' | 'inferred' | 'speculative';

  // Temporal
  created_at: timestamp;
  valid_from: timestamp;
  valid_until: timestamp | null;

  // Provenance
  derived_from: string;  // Episode/source that created this
}
```

**Implementation Priority:** HIGH | **Complexity:** MEDIUM

---

## Part 2: Retrieval Algorithm Improvements

### 2.1 Hybrid Search Implementation

**Current Limitation:** Pure semantic (embedding) similarity misses exact matches and struggles with domain-specific terminology.

**Proposed Pipeline:**

```
Query → [Parallel Retrieval] → [Fusion] → [Re-ranking] → Results
              │
              ├── Semantic Search (embedding similarity)
              ├── Keyword Search (BM25)
              └── Graph Traversal (relationship-based)
```

**Reciprocal Rank Fusion (RRF):**

```
RRF_score(d) = Σ 1/(k + rank_i(d))

Where:
  k = 60 (standard constant)
  rank_i(d) = rank of document d in retrieval method i
```

**Configurable Weights:**

```python
RETRIEVAL_WEIGHTS = {
    'semantic': 0.4,      # Embedding similarity
    'keyword': 0.3,       # BM25 exact match
    'graph': 0.3,         # Relationship traversal
}

# Query-type specific overrides
QUERY_TYPE_WEIGHTS = {
    'factual': {'semantic': 0.3, 'keyword': 0.5, 'graph': 0.2},
    'exploratory': {'semantic': 0.5, 'keyword': 0.2, 'graph': 0.3},
    'relational': {'semantic': 0.2, 'keyword': 0.2, 'graph': 0.6},
}
```

**Expected Improvement:** 20-30% better retrieval for specific terms, codes, and domain vocabulary.

**Implementation Priority:** HIGH | **Complexity:** MEDIUM

---

### 2.2 Re-Ranking Layer

**Two-Stage Pipeline:**

1. **Stage 1 (Fast):** Retrieve top-100 candidates using hybrid search
2. **Stage 2 (Accurate):** Re-rank to top-10 using cross-encoder

**Recommended Models:**

| Model | Speed | Accuracy | Use Case |
|-------|-------|----------|----------|
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | Medium | High | Default |
| `cross-encoder/ms-marco-TinyBERT-L-6-v2` | Fast | Medium | Latency-critical |

**Expected Improvement:** 15-30% accuracy boost on ranking quality.

**Implementation Priority:** MEDIUM | **Complexity:** LOW

---

### 2.3 Contextual Chunk Enrichment

**Problem:** Isolated chunks lose document-level context, degrading embedding quality.

**Solution:** Prepend contextual headers before embedding.

**Process:**

```
1. For each chunk, generate brief context (50-100 tokens):
   - What document/episode does this come from?
   - What topic area does it belong to?
   - What preceded/follows it?

2. Prepend context to chunk before embedding:
   Original: "The decay rate was set to 0.05..."
   Enriched: "[From: Memory System Research | Topic: Forgetting Parameters] The decay rate was set to 0.05..."

3. Store both original content and enriched embedding
```

**Expected Improvement:** 35-49% reduction in retrieval failures.

**Implementation Priority:** MEDIUM | **Complexity:** LOW

---

### 2.4 Adaptive Retrieval (Self-RAG Pattern)

**Query Router Logic:**

```python
def determine_retrieval_strategy(query, confidence):
    """Select retrieval strategy based on query characteristics."""

    if is_simple_factual(query) and confidence > 0.9:
        return 'no_retrieval'  # Use existing knowledge

    elif is_specific_lookup(query):
        return 'single_shot_rag'  # One retrieval pass

    elif is_complex_multi_hop(query):
        return 'iterative_rag'  # Multiple retrieval passes

    elif is_relationship_query(query):
        return 'graph_rag'  # Graph traversal prioritized

    else:
        return 'hybrid_rag'  # Default balanced approach
```

**Reflection Tokens (Self-RAG):**

| Token | Question | Action if False |
|-------|----------|-----------------|
| `RETRIEVE` | Should I retrieve? | Skip retrieval |
| `ISREL` | Is retrieved info relevant? | Discard, try again |
| `ISSUP` | Does it support my answer? | Flag uncertainty |
| `ISUSE` | Is response useful? | Refine/regenerate |

**Implementation Priority:** MEDIUM | **Complexity:** HIGH

---

### 2.5 Query Decomposition

**For Complex Queries:**

```python
def decompose_query(query):
    """Break complex queries into sub-queries."""

    # Example decomposition
    # Original: "Compare Visioneer's current forgetting mechanism
    #            with human memory decay and suggest improvements"

    sub_queries = [
        "Current Visioneer forgetting mechanism implementation",
        "Human memory decay models (Ebbinghaus curve, power law)",
        "Differences between AI and human memory decay",
        "Best practices for AI memory forgetting"
    ]

    return sub_queries

# Execution pattern
async def multi_query_retrieval(query):
    sub_queries = decompose_query(query)

    # Parallel retrieval for independent sub-queries
    results = await asyncio.gather(
        *[retrieve(sq) for sq in sub_queries]
    )

    # Merge and deduplicate
    return merge_results(results)
```

**Implementation Priority:** LOW | **Complexity:** MEDIUM

---

## Part 3: Forgetting & Decay System

### 3.1 Persistence Score Calculation

**Formula:**

```
PS = w₁·F + w₂·E + w₃·C + w₄·R + w₅·I

Where:
  F = Frequency of Access (0-1)
  E = Emotional/Importance Salience Proxy (0-1)
  C = Connection Density (0-1)
  R = Recency Score (0-1)
  I = Intentional Importance Marker (0-1)

Default weights: w₁=0.25, w₂=0.20, w₃=0.25, w₄=0.15, w₅=0.15
```

**Factor Calculations:**

```python
# Frequency (F) - reinforcement through access
F = 1 - exp(-0.3 * access_count)

# Salience (E) - importance indicators
E = (user_emphasis * 0.3 + error_correction * 0.2 +
     goal_related * 0.25 + conversation_length * 0.15 +
     explicit_feedback * 0.1)

# Connection Density (C) - graph centrality
C = min(1, (degree/max_degree * 0.4) + (pagerank * 0.6))

# Recency (R) - time since last access
R = exp(-days_since_access / 30)

# Importance (I) - explicit markers
I = 1.0 if pinned else (0.8 if goal_related else 0.0)
```

**Implementation Priority:** HIGH | **Complexity:** LOW

---

### 3.2 Decay Functions by Memory Type

| Memory Type | Function | Parameters | Rationale |
|-------------|----------|------------|-----------|
| **Episodic** | Exponential | λ = 0.05-0.15 | Quick initial decay, preserves gist |
| **Semantic** | Linear | k = 0.001-0.01 | Steady decay, facts remain relevant |
| **Procedural** | Gaussian | μ=90, σ=30 | Stable until obsolete |
| **Preference** | None/Minimal | - | Core preferences persist |

**Decay Formulas:**

```python
# Exponential (episodic)
S(t) = S₀ × exp(-λ × t)

# Linear (semantic)
S(t) = max(0, S₀ - k × t)

# Gaussian (procedural)
S(t) = S₀ × exp(-(t - μ)² / (2σ²))
```

**Category Decay Multipliers:**

```python
CATEGORY_DECAY_MULTIPLIERS = {
    'user_preference': 0.1,      # Very slow decay
    'user_identity': 0.05,       # Almost no decay
    'task_procedure': 0.5,       # Moderate decay
    'conversation_detail': 2.0,  # Fast decay
    'error_correction': 0.3,     # Slow (learn from mistakes)
    'goal_progress': 0.4,        # Moderate-slow
    'external_fact': 1.0,        # Standard
    'research_finding': 0.8,     # Slightly slower
}
```

**Implementation Priority:** HIGH | **Complexity:** LOW

---

### 3.3 Graceful Degradation Tiers

Instead of binary deletion, implement tiered degradation:

| Level | State | Access | Storage | Transition Trigger |
|-------|-------|--------|---------|-------------------|
| 1 | **Active** | Instant | Full | Default state |
| 2 | **Archived** | Slower | Compressed | S(t) < 0.3 for 7 days |
| 3 | **Summarized** | With note | Minimal | S(t) < 0.15 for 30 days |
| 4 | **Tombstone** | "Was known" marker | Negligible | S(t) < 0.05 for 90 days |
| 5 | **Deleted** | None | None | S(t) = 0 for 180 days |

**Transition Logic:**

```python
def update_memory_tier(memory):
    if memory.status == 'active' and memory.strength < 0.3:
        if days_below_threshold(memory, 0.3) >= 7:
            archive_memory(memory)

    elif memory.status == 'archived' and memory.strength < 0.15:
        if days_below_threshold(memory, 0.15) >= 30:
            summarize_memory(memory)

    elif memory.status == 'summarized' and memory.strength < 0.05:
        if days_below_threshold(memory, 0.05) >= 90:
            tombstone_memory(memory)

    elif memory.status == 'tombstone' and memory.strength == 0:
        if days_at_zero(memory) >= 180:
            delete_memory(memory)
```

**Implementation Priority:** MEDIUM | **Complexity:** MEDIUM

---

### 3.4 Consolidation Process

**Triggers:**

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Retrieval Count | ≥ 3 successful | Promote to long-term |
| Connection Formation | ≥ 2 meaningful edges | Increase stability |
| Time Survival | 7 days with PS > 0.3 | Mark consolidated |
| User Reinforcement | Explicit confirmation | Immediate consolidation |
| Goal Achievement | Memory helped goal | High-priority consolidation |

**Background Consolidation Job:**

```python
# Run every 6 hours
async def consolidation_job():
    # 1. Score working memories
    working_memories = get_working_memories()
    scored = [(m, calculate_ps(m)) for m in working_memories]

    # 2. Select for consolidation
    to_consolidate = [m for m, ps in scored if ps > 0.4]

    # 3. Process each
    for memory in to_consolidate:
        # Extract semantic relationships
        relationships = extract_relationships(memory)

        # Link to existing graph
        for rel in relationships:
            create_or_strengthen_edge(rel)

        # Update connection density
        update_centrality_scores()

        # Check for similar memories to merge
        similar = find_similar_memories(memory)
        if similar:
            merged = merge_memories(memory, similar)
            store_long_term(merged)
        else:
            store_long_term(memory)

    # 4. Prune weak connections
    prune_edges_below_threshold(0.1)
```

**Implementation Priority:** MEDIUM | **Complexity:** HIGH

---

### 3.5 Retrieval Strengthening (Spaced Repetition)

**On Successful Retrieval:**

```python
def on_successful_retrieval(memory):
    # Strength boost
    memory.current_strength = min(1.0, memory.current_strength + 0.15)

    # Slow future decay (increase stability)
    memory.decay_rate *= 0.8  # 20% slower decay

    # Update access tracking
    memory.access_count += 1
    memory.last_accessed = now()

    # Recalculate persistence score
    memory.persistence_score = calculate_ps(memory)
```

**Optimal Review Intervals (for important unused memories):**

```
1 → 3 → 7 → 14 → 30 → 60 → 120 → 365 days
```

**Implementation Priority:** LOW | **Complexity:** LOW

---

## Part 4: Contradiction Handling

### 4.1 Detection Pipeline

**Pre-Storage Check:**

```python
async def check_for_contradictions(new_memory):
    # 1. Semantic similarity check
    similar_memories = semantic_search(new_memory, threshold=0.85)

    # 2. Entity overlap check
    entities = extract_entities(new_memory)
    related_memories = find_memories_about(entities)

    # 3. Contradiction detection
    contradictions = []
    for existing in similar_memories + related_memories:
        if is_contradictory(new_memory, existing):
            contradictions.append({
                'existing': existing,
                'conflict_type': classify_conflict(new_memory, existing),
                'severity': calculate_conflict_severity(new_memory, existing)
            })

    return contradictions
```

**Conflict Types:**

| Type | Description | Example |
|------|-------------|---------|
| **Direct Contradiction** | Opposite assertions | "X is true" vs "X is false" |
| **Value Conflict** | Different values for same attribute | "Budget: $500" vs "Budget: $750" |
| **Temporal Conflict** | Different states at same time | Both "active" and "completed" |
| **Granularity Conflict** | Different specificity levels | "Paris" vs "France" |

**Implementation Priority:** HIGH | **Complexity:** HIGH

---

### 4.2 Resolution Strategies

**Strategy Selection:**

```python
def resolve_contradiction(new_memory, existing_memory, conflict):
    strategy = select_resolution_strategy(conflict)

    if strategy == 'recency':
        # New supersedes old (default for updates)
        existing_memory.status = 'superseded'
        existing_memory.superseded_by = new_memory.id
        existing_memory.strength *= 0.5
        new_memory.supersedes.append(existing_memory.id)

    elif strategy == 'authority':
        # Higher authority source wins
        if new_memory.source_confidence > existing_memory.source_confidence:
            # New wins
            existing_memory.status = 'superseded'
        else:
            # Existing wins, mark new as contested
            new_memory.status = 'contested'
            new_memory.conflicts_with.append(existing_memory.id)

    elif strategy == 'conditional':
        # Both valid under different conditions
        create_conditional_edge(new_memory, existing_memory)
        # E.g., "Budget: $500 (before approval)" vs "Budget: $750 (after approval)"

    elif strategy == 'escalate':
        # High-stakes conflict, surface to user
        create_conflict_notice(new_memory, existing_memory)
        new_memory.status = 'pending_resolution'
```

**Strategy Selection Logic:**

```python
def select_resolution_strategy(conflict):
    if conflict.severity == 'minor':
        return 'recency'  # Simple overwrites

    elif conflict.type == 'value_conflict':
        if is_time_sensitive(conflict.attribute):
            return 'recency'
        else:
            return 'authority'

    elif conflict.severity == 'major':
        if confidence_gap(conflict) > 0.3:
            return 'authority'
        else:
            return 'escalate'

    elif can_be_conditional(conflict):
        return 'conditional'

    else:
        return 'escalate'
```

**Implementation Priority:** HIGH | **Complexity:** HIGH

---

### 4.3 Provenance Tracking

**Required for Every Fact:**

```typescript
interface Provenance {
  source_type: 'user_stated' | 'inferred' | 'external' | 'system';
  source_id: string;           // Reference to source
  timestamp: timestamp;        // When acquired
  extraction_method: string;   // How extracted
  extraction_confidence: number;
  original_context: string;    // Snippet from which derived
  supporting_evidence: string[];
}
```

**Benefits:**
- Enables future conflict resolution
- Supports rollback if needed
- Tracks how errors entered system
- Enables user transparency

**Implementation Priority:** MEDIUM | **Complexity:** LOW

---

## Part 5: Context Selection Heuristics

### 5.1 Query-Aware Context Assembly

**Context Budget Allocation:**

```python
CONTEXT_BUDGET = 8000  # tokens

BUDGET_ALLOCATION = {
    'system_instructions': 0.15,    # 1200 tokens
    'user_preferences': 0.10,       # 800 tokens
    'current_task_context': 0.25,   # 2000 tokens
    'retrieved_memories': 0.35,     # 2800 tokens
    'recent_conversation': 0.15,    # 1200 tokens
}
```

**Assembly Logic:**

```python
def assemble_context(query, budget=8000):
    context = {}

    # 1. Fixed allocations (always included)
    context['system'] = get_system_instructions(
        max_tokens=budget * 0.15
    )
    context['preferences'] = get_user_preferences(
        max_tokens=budget * 0.10
    )

    # 2. Task-specific retrieval
    relevant_memories = hybrid_retrieve(query, top_k=20)
    reranked = cross_encoder_rerank(query, relevant_memories, top_k=10)
    context['memories'] = compress_to_budget(
        reranked,
        max_tokens=budget * 0.35
    )

    # 3. Recent conversation (adaptive)
    conversation_budget = budget * 0.15
    context['conversation'] = summarize_recent_turns(
        max_tokens=conversation_budget
    )

    # 4. Current task context
    task_budget = budget * 0.25
    context['task'] = get_active_task_context(
        max_tokens=task_budget
    )

    return format_context(context)
```

**Implementation Priority:** HIGH | **Complexity:** MEDIUM

---

### 5.2 Progressive Disclosure Pattern

**Principle:** Allow agent to discover context through exploration rather than pre-loading everything.

**Implementation:**

```python
class ProgressiveContextManager:
    def __init__(self, initial_context):
        self.core_context = initial_context  # Always available
        self.discovered_context = []         # Found during exploration
        self.exploration_budget = 3          # Max exploration steps

    def explore(self, query):
        """Agent-initiated context discovery."""
        if self.exploration_budget <= 0:
            return None

        self.exploration_budget -= 1

        # Search for relevant context
        results = hybrid_retrieve(query, top_k=5)

        # Add to discovered context
        self.discovered_context.extend(results)

        return results

    def get_current_context(self):
        """Return assembled context."""
        return self.core_context + self.discovered_context
```

**Benefits:**
- Avoids context window bloat
- Agent finds what it actually needs
- Supports unknown-unknowns discovery

**Implementation Priority:** LOW | **Complexity:** MEDIUM

---

### 5.3 Context Compaction Strategies

**For Long Conversations:**

```python
def compact_conversation(turns, target_tokens):
    """Compress conversation history to fit budget."""

    # Strategy 1: Keep first + last + high-value middles
    important_turns = []

    # Always keep first turn (establishes context)
    important_turns.append(turns[0])

    # Always keep last N turns (recent context)
    important_turns.extend(turns[-3:])

    # Score middle turns by importance
    middle_turns = turns[1:-3]
    for turn in middle_turns:
        turn.importance = calculate_turn_importance(turn)

    # Add high-importance middle turns
    sorted_middle = sorted(middle_turns, key=lambda t: t.importance, reverse=True)

    current_tokens = count_tokens(important_turns)
    for turn in sorted_middle:
        if current_tokens + count_tokens(turn) <= target_tokens:
            important_turns.append(turn)
            current_tokens += count_tokens(turn)

    # Sort by original order
    important_turns.sort(key=lambda t: t.index)

    return important_turns
```

**Turn Importance Factors:**
- Contains user corrections
- Contains explicit decisions
- Contains goal statements
- Contains error information
- Referenced later in conversation

**Implementation Priority:** MEDIUM | **Complexity:** LOW

---

## Part 6: Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**HIGH Priority, LOW-MEDIUM Complexity**

| Task | Priority | Complexity | Duration |
|------|----------|------------|----------|
| Implement memory node schema | HIGH | LOW | 1 week |
| Add basic decay functions | HIGH | LOW | 1 week |
| Implement persistence score calculation | HIGH | LOW | 1 week |
| Add BM25 keyword search | HIGH | LOW | 1 week |

**Deliverables:**
- Extended memory schema with all required fields
- Three decay function implementations
- Persistence score calculator
- Hybrid search (semantic + BM25)

---

### Phase 2: Core Improvements (Weeks 5-8)

**HIGH Priority, MEDIUM Complexity**

| Task | Priority | Complexity | Duration |
|------|----------|------------|----------|
| Implement typed edge taxonomy | HIGH | MEDIUM | 2 weeks |
| Add contradiction detection | HIGH | HIGH | 2 weeks |
| Build context assembly pipeline | HIGH | MEDIUM | 1 week |
| Implement graceful degradation tiers | MEDIUM | MEDIUM | 1 week |

**Deliverables:**
- Knowledge graph with typed relationships
- Pre-storage contradiction checking
- Budget-aware context assembly
- Tiered memory degradation

---

### Phase 3: Advanced Features (Weeks 9-12)

**MEDIUM Priority, HIGH Complexity**

| Task | Priority | Complexity | Duration |
|------|----------|------------|----------|
| Build consolidation job | MEDIUM | HIGH | 2 weeks |
| Add re-ranking layer | MEDIUM | LOW | 1 week |
| Implement adaptive retrieval | MEDIUM | HIGH | 2 weeks |
| Add contextual chunk enrichment | MEDIUM | LOW | 1 week |

**Deliverables:**
- Background consolidation process
- Cross-encoder re-ranking
- Query routing for retrieval strategies
- Enriched embeddings with context

---

### Phase 4: Optimization (Weeks 13-16)

**LOW-MEDIUM Priority, MEDIUM Complexity**

| Task | Priority | Complexity | Duration |
|------|----------|------------|----------|
| Progressive disclosure | LOW | MEDIUM | 2 weeks |
| Query decomposition | LOW | MEDIUM | 1 week |
| Spaced repetition for memory maintenance | LOW | LOW | 1 week |
| Metrics and monitoring | MEDIUM | MEDIUM | 2 weeks |

**Deliverables:**
- Agent-initiated context discovery
- Multi-query retrieval for complex questions
- Memory reinforcement system
- Dashboard for memory system health

---

## Part 7: Evaluation Framework

### 7.1 Metrics to Track

| Category | Metric | Target | Description |
|----------|--------|--------|-------------|
| **Retrieval** | Precision@10 | > 0.7 | Relevant results in top 10 |
| **Retrieval** | Recall@10 | > 0.6 | Coverage of relevant info |
| **Retrieval** | MRR | > 0.5 | Position of first good result |
| **Memory** | Growth Rate | < 5%/day | Forgetting keeping pace |
| **Memory** | False Positive Forget | < 5% | Rarely recreate deleted |
| **Memory** | Storage Efficiency | > 70% active | Most storage is useful |
| **Contradiction** | Detection Rate | > 80% | Conflicts caught pre-storage |
| **Contradiction** | Resolution Time | < 24 hours | Conflicts resolved quickly |
| **Context** | Relevancy Score | > 0.8 | Retrieved context is relevant |
| **Context** | Faithfulness | > 0.9 | Responses match context |

### 7.2 Validation Approaches

1. **Retrospective Analysis:** Review deleted memories, check if later recreated
2. **A/B Testing:** Compare retrieval strategies on same queries
3. **User Feedback:** Does system remember what users expect?
4. **Synthetic Testing:** Simulate long-term usage patterns
5. **Contradiction Injection:** Test detection with known conflicts

---

## Part 8: Configuration Reference

### 8.1 Default Parameters

```python
VISIONEER_MEMORY_CONFIG = {
    # Persistence Score Weights
    'ps_weights': {
        'frequency': 0.25,
        'salience': 0.20,
        'connection': 0.25,
        'recency': 0.15,
        'importance': 0.15,
    },

    # Decay Parameters
    'decay': {
        'exponential_high': {'lambda': 0.01},    # ~69 day half-life
        'exponential_medium': {'lambda': 0.05},  # ~14 day half-life
        'exponential_low': {'lambda': 0.15},     # ~5 day half-life
        'linear_stable': {'k': 0.001},
        'linear_volatile': {'k': 0.05},
        'gaussian_medium': {'mu': 90, 'sigma': 30},
    },

    # Thresholds
    'thresholds': {
        'consolidation_ps_min': 0.4,
        'forgetting_strength_min': 0.1,
        'archive_strength': 0.3,
        'summarize_strength': 0.15,
        'tombstone_strength': 0.05,
        'no_access_timeout_days': 90,
        'protected_age_days': 7,
        'contradiction_similarity_threshold': 0.85,
    },

    # Retrieval
    'retrieval': {
        'hybrid_weights': {
            'semantic': 0.4,
            'keyword': 0.3,
            'graph': 0.3,
        },
        'initial_candidates': 100,
        'final_results': 10,
        'rrf_k': 60,
    },

    # Context Budget
    'context': {
        'total_budget': 8000,
        'system_ratio': 0.15,
        'preferences_ratio': 0.10,
        'task_ratio': 0.25,
        'memories_ratio': 0.35,
        'conversation_ratio': 0.15,
    },

    # Maintenance Schedule
    'maintenance': {
        'recency_update_hours': 1,
        'consolidation_hours': 6,
        'centrality_update_hours': 24,
        'decay_application_hours': 24,
        'forgetting_days': 7,
        'archive_days': 30,
    },
}
```

---

## Sources and References

### Research Documents Synthesized
- Knowledge Graph Architectures Research
- Cognitive Science Memory Models Research
- RAG Limitations and Advanced Retrieval Research
- Contradiction Handling Research
- Forgetting and Memory Consolidation Framework

### External Sources
- [Mem0 - Memory in AI Agents](https://mem0.ai/blog/memory-in-agents-what-why-and-how)
- [IBM - AI Agent Memory](https://www.ibm.com/think/topics/ai-agent-memory)
- [Anthropic - Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Redis - AI Agent Memory Management](https://redis.io/blog/build-smarter-ai-agents-manage-short-term-and-long-term-memory-with-redis/)
- [AWS - AgentCore Long-Term Memory](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive/)
- [Memory as Action Research](https://arxiv.org/html/2510.12635)
- [Context Engineering for Agents](https://rlancemartin.github.io/2025/06/23/context_engineering/)

---

*Document Version: 1.0*
*Last Updated: January 2025*
*Status: Ready for Implementation Planning Phase*
