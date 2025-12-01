# Context Surfacing Decision Framework
## Practical Framework for AI Agent Memory Context Selection

**Research Date:** January 2025
**Purpose:** Define when, what, and how to surface context for Visioneer's AI memory system
**Document Type:** Decision Framework & Implementation Guide
**Status:** Research Complete - Ready for Implementation

---

## Executive Summary

This framework provides actionable decision logic for determining **what context to surface** and **when to surface it** in an AI agent memory system. It addresses the critical challenge of avoiding both information starvation (too little context) and information overload (too much irrelevant context). The framework defines trigger conditions, relevance scoring criteria, freshness factors, and mechanisms for both **pull** (query-driven) and **push** (proactive) retrieval patterns.

### Key Principles

1. **Right Context, Right Time**: Surface the minimal context that maximizes likelihood of good outcomes
2. **Adaptive Retrieval**: Not all queries need the same retrieval depth or strategy
3. **Cognitive Load Awareness**: Excessive context causes "context confusion" and degrades performance
4. **Proactive Intelligence**: Anticipate needs rather than only reacting to queries
5. **Graceful Degradation**: When unsure, err toward less context with exploration options

---

## Part 1: Decision Architecture Overview

### 1.1 Two-Mode Context Retrieval

The framework operates in two complementary modes:

```
┌─────────────────────────────────────────────────────────────┐
│                   CONTEXT SURFACING ENGINE                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐    ┌────────────────────────┐    │
│  │   PULL MODE (Query)  │    │  PUSH MODE (Proactive) │    │
│  ├──────────────────────┤    ├────────────────────────┤    │
│  │ • User query arrives │    │ • Background monitor   │    │
│  │ • Agent requests info│    │ • Pattern recognition  │    │
│  │ • Task requires data │    │ • Anticipatory fetch   │    │
│  │ • Explicit retrieval │    │ • Event-triggered      │    │
│  └──────────┬───────────┘    └──────────┬─────────────┘    │
│             │                           │                   │
│             └───────────┬───────────────┘                   │
│                         ▼                                   │
│            ┌────────────────────────┐                       │
│            │   RELEVANCE SCORING    │                       │
│            │   & BUDGET ALLOCATION  │                       │
│            └────────────────────────┘                       │
│                         │                                   │
│                         ▼                                   │
│            ┌────────────────────────┐                       │
│            │   CONTEXT ASSEMBLY     │                       │
│            │   & DELIVERY           │                       │
│            └────────────────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Decision Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTEXT SURFACING FLOW                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input (Query/Event)                                        │
│         │                                                   │
│         ▼                                                   │
│  [1. TRIGGER EVALUATION] ── Is retrieval needed? ── No ──► │
│         │                                                   │
│         │ Yes                                               │
│         ▼                                                   │
│  [2. STRATEGY SELECTION] ── What type of retrieval?         │
│         │                                                   │
│         ▼                                                   │
│  [3. CANDIDATE RETRIEVAL] ── Gather potential context       │
│         │                                                   │
│         ▼                                                   │
│  [4. RELEVANCE SCORING] ── Rank by multi-factor score       │
│         │                                                   │
│         ▼                                                   │
│  [5. FRESHNESS FILTERING] ── Apply temporal factors         │
│         │                                                   │
│         ▼                                                   │
│  [6. BUDGET ALLOCATION] ── Fit to context budget            │
│         │                                                   │
│         ▼                                                   │
│  [7. OVERLOAD PREVENTION] ── Final quality check            │
│         │                                                   │
│         ▼                                                   │
│  Output (Assembled Context)                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 2: Trigger Conditions

### 2.1 Pull Triggers (Query-Driven)

These triggers initiate retrieval in response to explicit needs:

| Trigger Type | Condition | Action | Priority |
|--------------|-----------|--------|----------|
| **Explicit Query** | User asks a question | Full retrieval pipeline | HIGH |
| **Entity Reference** | Named entity mentioned | Load entity context | HIGH |
| **Knowledge Gap** | Agent confidence < threshold | Retrieve supporting info | HIGH |
| **Task Requirement** | Task needs specific data | Targeted retrieval | HIGH |
| **Contradiction Signal** | Potential conflict detected | Retrieve for verification | MEDIUM |
| **Clarification Request** | User asks for more detail | Deep retrieval on topic | MEDIUM |
| **Historical Reference** | "Remember when..." pattern | Episodic memory search | MEDIUM |

**Trigger Detection Logic:**

```python
def evaluate_pull_triggers(input_context):
    """Evaluate whether pull retrieval is needed."""

    triggers = {
        'explicit_query': detect_question_pattern(input_context),
        'entity_reference': extract_entities(input_context),
        'knowledge_gap': confidence_score < 0.7,
        'task_requirement': current_task.requires_data,
        'contradiction_signal': check_for_contradictions(input_context),
        'clarification_request': detect_clarification_pattern(input_context),
        'historical_reference': detect_memory_reference(input_context)
    }

    active_triggers = [k for k, v in triggers.items() if v]

    if not active_triggers:
        return {'retrieve': False, 'reason': 'No triggers activated'}

    priority = max([TRIGGER_PRIORITY[t] for t in active_triggers])

    return {
        'retrieve': True,
        'triggers': active_triggers,
        'priority': priority,
        'suggested_strategy': recommend_strategy(active_triggers)
    }
```

### 2.2 Push Triggers (Proactive)

These triggers initiate retrieval without explicit requests:

| Trigger Type | Condition | Action | Timing |
|--------------|-----------|--------|--------|
| **Goal Activation** | New goal mentioned | Pre-fetch goal-related memories | Immediate |
| **Pattern Match** | "User often asks X after Y" | Pre-load anticipated context | Before likely need |
| **Temporal Signal** | Scheduled event approaching | Surface event-related context | Configurable lead time |
| **Topic Drift Detection** | Conversation shifting topic | Pre-fetch new topic context | On detection |
| **Recurring Interest** | Topic mentioned 3+ times | Proactively surface related | After threshold |
| **Context Switch** | Task/mode change detected | Load new context, archive old | On switch |
| **Idle Time Processing** | Agent idle, low priority | Background memory consolidation | During idle |

**Proactive Trigger Engine:**

```python
class ProactiveTriggerEngine:
    """Monitor for conditions that warrant proactive retrieval."""

    def __init__(self):
        self.pattern_history = {}
        self.goal_stack = []
        self.topic_frequency = defaultdict(int)

    def monitor(self, interaction_stream):
        """Continuous monitoring for proactive triggers."""

        triggers_to_fire = []

        # Goal detection
        if goal := detect_goal(interaction_stream):
            triggers_to_fire.append({
                'type': 'goal_activation',
                'target': goal,
                'action': 'prefetch_goal_context',
                'priority': 'high'
            })

        # Pattern recognition (learned behaviors)
        if pattern := self.match_learned_pattern(interaction_stream):
            triggers_to_fire.append({
                'type': 'pattern_match',
                'pattern': pattern,
                'action': 'prefetch_predicted_context',
                'priority': 'medium'
            })

        # Topic interest accumulation
        topics = extract_topics(interaction_stream)
        for topic in topics:
            self.topic_frequency[topic] += 1
            if self.topic_frequency[topic] >= 3:
                triggers_to_fire.append({
                    'type': 'recurring_interest',
                    'topic': topic,
                    'action': 'surface_deep_context',
                    'priority': 'low'
                })

        # Temporal signals
        upcoming = check_temporal_events(lookahead_minutes=30)
        for event in upcoming:
            triggers_to_fire.append({
                'type': 'temporal_signal',
                'event': event,
                'action': 'prefetch_event_context',
                'priority': 'medium'
            })

        return triggers_to_fire
```

### 2.3 No-Retrieval Conditions

Equally important is knowing when NOT to retrieve:

| Condition | Rationale | Alternative Action |
|-----------|-----------|-------------------|
| **Simple factual** | Agent already knows with high confidence | Use parametric knowledge |
| **Continuation** | Context already in working memory | Reference existing context |
| **Conversational** | Greeting, acknowledgment, small talk | No retrieval needed |
| **Too broad** | Query would return everything | Ask for clarification first |
| **Recent repetition** | Same query within short window | Return cached result |
| **Budget exhausted** | Exploration budget depleted | Synthesize from existing |

**Skip-Retrieval Check:**

```python
def should_skip_retrieval(query, context):
    """Determine if retrieval should be skipped."""

    # High confidence + simple query
    if is_simple_factual(query) and agent_confidence(query) > 0.9:
        return True, "High confidence factual"

    # Context continuity
    if is_continuation_query(query, context.recent_turns):
        return True, "Continuation of current topic"

    # Conversational (no information need)
    if is_conversational_only(query):
        return True, "Conversational exchange"

    # Too vague
    if specificity_score(query) < 0.2:
        return True, "Query too vague - need clarification"

    # Recent duplicate
    if is_recent_duplicate(query, context.query_cache, window=300):
        return True, "Recent duplicate query"

    return False, None
```

---

## Part 3: Relevance Scoring System

### 3.1 Multi-Factor Relevance Score

Each candidate context item receives a composite relevance score:

```
Relevance_Score =
    α × Semantic_Similarity +
    β × Keyword_Match +
    γ × Entity_Overlap +
    δ × Relationship_Proximity +
    ε × Source_Authority +
    ζ × Freshness_Factor

Default weights: α=0.25, β=0.15, γ=0.20, δ=0.15, ε=0.10, ζ=0.15
```

### 3.2 Scoring Component Definitions

#### Semantic Similarity (α = 0.25)
Traditional vector similarity between query and context embeddings.

```python
def semantic_similarity(query_embedding, context_embedding):
    """Cosine similarity of embeddings."""
    return cosine_similarity(query_embedding, context_embedding)
```

#### Keyword Match (β = 0.15)
BM25-style keyword matching for exact terminology.

```python
def keyword_match_score(query_terms, context_text):
    """BM25 or similar lexical match score."""
    return bm25_score(query_terms, context_text, k1=1.2, b=0.75)
```

#### Entity Overlap (γ = 0.20)
Shared entities between query and context.

```python
def entity_overlap_score(query_entities, context_entities):
    """Jaccard similarity of entity sets."""
    if not query_entities:
        return 0.5  # Neutral if no entities in query

    intersection = query_entities & context_entities
    union = query_entities | context_entities

    return len(intersection) / len(union) if union else 0
```

#### Relationship Proximity (δ = 0.15)
Graph distance in the knowledge graph from query entities.

```python
def relationship_proximity_score(query_entities, context_node, max_hops=3):
    """How close is context to query entities in knowledge graph."""

    if not query_entities:
        return 0.5

    min_distance = float('inf')
    for entity in query_entities:
        distance = graph_distance(entity, context_node)
        min_distance = min(min_distance, distance)

    if min_distance == 0:
        return 1.0
    elif min_distance > max_hops:
        return 0.0
    else:
        return 1.0 - (min_distance / (max_hops + 1))
```

#### Source Authority (ε = 0.10)
Trustworthiness of the context source.

```python
def source_authority_score(context_item):
    """Authority weight based on source type."""

    AUTHORITY_WEIGHTS = {
        'user_stated': 1.0,        # User explicitly said this
        'verified_external': 0.9,  # Verified external source
        'system_derived': 0.7,     # System inference
        'inferred': 0.5,           # Statistical inference
        'speculative': 0.3         # Low confidence inference
    }

    return AUTHORITY_WEIGHTS.get(context_item.source_type, 0.5)
```

#### Freshness Factor (ζ = 0.15)
See detailed freshness factors in Part 4.

### 3.3 Query-Type Adaptive Weights

Different query types shift the weight distribution:

```python
QUERY_TYPE_WEIGHTS = {
    'factual_lookup': {
        'semantic': 0.20, 'keyword': 0.30, 'entity': 0.25,
        'relationship': 0.10, 'authority': 0.10, 'freshness': 0.05
    },
    'exploratory': {
        'semantic': 0.35, 'keyword': 0.10, 'entity': 0.15,
        'relationship': 0.20, 'authority': 0.05, 'freshness': 0.15
    },
    'temporal': {
        'semantic': 0.15, 'keyword': 0.15, 'entity': 0.15,
        'relationship': 0.10, 'authority': 0.05, 'freshness': 0.40
    },
    'relational': {
        'semantic': 0.15, 'keyword': 0.10, 'entity': 0.25,
        'relationship': 0.35, 'authority': 0.05, 'freshness': 0.10
    },
    'preference': {
        'semantic': 0.25, 'keyword': 0.15, 'entity': 0.20,
        'relationship': 0.10, 'authority': 0.20, 'freshness': 0.10
    }
}

def get_weights_for_query(query):
    """Select weight profile based on query classification."""
    query_type = classify_query_type(query)
    return QUERY_TYPE_WEIGHTS.get(query_type, QUERY_TYPE_WEIGHTS['exploratory'])
```

### 3.4 Re-Ranking with Cross-Encoder

After initial scoring, apply cross-encoder re-ranking for final ordering:

```python
def rerank_with_cross_encoder(query, candidates, top_k=10):
    """Two-stage retrieval: initial score → cross-encoder re-rank."""

    # Stage 1: Get top candidates by composite score
    top_candidates = sorted(candidates, key=lambda c: c.score, reverse=True)[:100]

    # Stage 2: Cross-encoder re-ranking
    cross_encoder = load_cross_encoder('ms-marco-MiniLM-L-6-v2')

    pairs = [(query, c.content) for c in top_candidates]
    cross_scores = cross_encoder.predict(pairs)

    for candidate, score in zip(top_candidates, cross_scores):
        candidate.final_score = 0.4 * candidate.score + 0.6 * score

    # Return top-k by final score
    return sorted(top_candidates, key=lambda c: c.final_score, reverse=True)[:top_k]
```

---

## Part 4: Context Freshness Factors

### 4.1 Temporal Relevance Model

Freshness is query-dependent - some queries need recent info, others need historical:

```python
def calculate_freshness_score(context_item, query_temporal_mode):
    """Calculate freshness based on query's temporal requirements."""

    age_days = (now() - context_item.last_accessed).days
    content_age_days = (now() - context_item.created_at).days

    if query_temporal_mode == 'current':
        # Strongly prefer recent - exponential decay
        return math.exp(-age_days / 7)  # 7-day half-life

    elif query_temporal_mode == 'historical':
        # Prefer older, established knowledge
        if content_age_days > 30:
            return 0.8 + 0.2 * min(1, content_age_days / 365)
        else:
            return 0.5  # Recent items less preferred

    elif query_temporal_mode == 'neutral':
        # Mild recency preference
        return 0.7 + 0.3 * math.exp(-age_days / 30)  # 30-day half-life

    elif query_temporal_mode == 'evolution':
        # Need both old and new to show change
        # Score higher for extremes (very old OR very new)
        if age_days < 7 or content_age_days > 180:
            return 0.9
        else:
            return 0.5

    return 0.5  # Default neutral
```

### 4.2 Query Temporal Mode Detection

```python
def detect_temporal_mode(query):
    """Determine what temporal relevance the query needs."""

    CURRENT_INDICATORS = [
        'current', 'now', 'today', 'latest', 'recent',
        'what is', 'what are', 'presently'
    ]

    HISTORICAL_INDICATORS = [
        'originally', 'initially', 'first', 'started',
        'was', 'were', 'used to', 'back when', 'history'
    ]

    EVOLUTION_INDICATORS = [
        'how has', 'changed', 'evolved', 'over time',
        'compared to before', 'progress', 'trend'
    ]

    query_lower = query.lower()

    if any(ind in query_lower for ind in EVOLUTION_INDICATORS):
        return 'evolution'
    elif any(ind in query_lower for ind in CURRENT_INDICATORS):
        return 'current'
    elif any(ind in query_lower for ind in HISTORICAL_INDICATORS):
        return 'historical'
    else:
        return 'neutral'
```

### 4.3 Memory Type-Specific Freshness

Different memory types have different freshness characteristics:

| Memory Type | Freshness Approach | Rationale |
|-------------|-------------------|-----------|
| **Episodic** | Strong recency bias | Recent events more likely relevant |
| **Semantic** | Weak recency bias | Facts change slowly |
| **Procedural** | Update-based freshness | Valid until superseded |
| **Preference** | Last-stated preference | Most recent statement of preference |
| **Goal** | Active > Completed > Abandoned | Active goals most relevant |

```python
MEMORY_TYPE_FRESHNESS_CONFIG = {
    'episodic': {
        'decay_rate': 0.10,       # Fast decay
        'half_life_days': 7,      # ~1 week relevance
        'minimum_score': 0.1      # Always some relevance
    },
    'semantic': {
        'decay_rate': 0.01,       # Slow decay
        'half_life_days': 90,     # ~3 months relevance
        'minimum_score': 0.3      # Facts remain relevant
    },
    'procedural': {
        'decay_rate': 0.0,        # No time decay
        'superseded_penalty': 0.8, # Penalty if superseded
        'minimum_score': 0.2
    },
    'preference': {
        'decay_rate': 0.02,       # Very slow decay
        'latest_bonus': 0.3,      # Bonus for most recent
        'minimum_score': 0.4      # Preferences persist
    },
    'goal': {
        'active_bonus': 1.0,      # Active goals fully relevant
        'completed_penalty': 0.3, # Completed less relevant
        'abandoned_penalty': 0.7  # Abandoned much less relevant
    }
}
```

### 4.4 Temporal Validity Windows

Context items may have explicit validity windows:

```python
def apply_temporal_validity(context_item, query_time):
    """Check if context is temporally valid for the query."""

    # Context has explicit validity window
    if context_item.valid_from and context_item.valid_until:
        if context_item.valid_from <= query_time <= context_item.valid_until:
            return 1.0  # Fully valid
        elif query_time < context_item.valid_from:
            return 0.2  # Future validity - flag as upcoming
        else:
            return 0.3  # Expired - may still be historically relevant

    # No explicit validity - use creation time heuristics
    return calculate_freshness_score(context_item, 'neutral')
```

---

## Part 5: Overload Prevention Mechanisms

### 5.1 Context Budget System

Prevent overwhelming the agent with a strict token budget:

```python
CONTEXT_BUDGET_CONFIG = {
    'total_tokens': 8000,

    'allocations': {
        'system_instructions': 0.15,   # 1200 tokens - fixed
        'user_preferences': 0.08,      # 640 tokens - always included
        'active_task': 0.20,           # 1600 tokens - current task context
        'retrieved_memories': 0.35,    # 2800 tokens - retrieved content
        'conversation_history': 0.15,  # 1200 tokens - recent turns
        'exploration_reserve': 0.07    # 560 tokens - for agent discovery
    },

    'overflow_strategy': 'compress_oldest'  # or 'drop_lowest_score'
}

class ContextBudgetManager:
    """Manage context token budget allocation."""

    def __init__(self, config=CONTEXT_BUDGET_CONFIG):
        self.total = config['total_tokens']
        self.allocations = config['allocations']
        self.used = defaultdict(int)

    def can_add(self, category, content):
        """Check if content fits in category budget."""
        tokens = count_tokens(content)
        budget = int(self.total * self.allocations[category])
        return self.used[category] + tokens <= budget

    def add(self, category, content):
        """Add content to a category, respecting budget."""
        tokens = count_tokens(content)
        budget = int(self.total * self.allocations[category])

        if self.used[category] + tokens <= budget:
            self.used[category] += tokens
            return content
        else:
            # Compress or truncate to fit
            available = budget - self.used[category]
            if available > 100:  # Minimum useful size
                compressed = compress_to_tokens(content, available)
                self.used[category] += count_tokens(compressed)
                return compressed
            else:
                return None  # Can't fit

    def remaining(self, category):
        """Get remaining budget for a category."""
        budget = int(self.total * self.allocations[category])
        return budget - self.used[category]
```

### 5.2 Quality Gates

Apply quality gates to prevent low-value context from consuming budget:

```python
QUALITY_GATES = {
    'minimum_relevance_score': 0.3,      # Below this, don't include
    'minimum_information_density': 0.2,   # Content must be substantive
    'maximum_redundancy': 0.7,            # Don't include near-duplicates
    'minimum_source_confidence': 0.4      # Source must be reasonably reliable
}

def apply_quality_gates(candidates, existing_context):
    """Filter candidates through quality gates."""

    filtered = []
    existing_embeddings = [embed(c) for c in existing_context]

    for candidate in candidates:
        # Gate 1: Minimum relevance
        if candidate.relevance_score < QUALITY_GATES['minimum_relevance_score']:
            continue

        # Gate 2: Information density
        info_density = calculate_information_density(candidate.content)
        if info_density < QUALITY_GATES['minimum_information_density']:
            continue

        # Gate 3: Redundancy check
        candidate_embedding = embed(candidate.content)
        max_similarity = max(
            [cosine_similarity(candidate_embedding, e) for e in existing_embeddings],
            default=0
        )
        if max_similarity > QUALITY_GATES['maximum_redundancy']:
            continue  # Too similar to existing context

        # Gate 4: Source confidence
        if candidate.source_confidence < QUALITY_GATES['minimum_source_confidence']:
            continue

        filtered.append(candidate)
        existing_embeddings.append(candidate_embedding)

    return filtered
```

### 5.3 Relevance Decay for Long Context

As context grows, apply diminishing returns:

```python
def calculate_marginal_value(new_item, current_context_size):
    """Diminishing returns as context grows."""

    # Base value from relevance score
    base_value = new_item.relevance_score

    # Diminishing returns factor
    # At 0 tokens: full value
    # At 4000 tokens: ~75% value
    # At 8000 tokens: ~50% value
    diminishing_factor = 1.0 / (1 + current_context_size / 8000)

    # Uniqueness bonus - higher if adds new information
    uniqueness = calculate_uniqueness(new_item, current_context)
    uniqueness_bonus = uniqueness * 0.2

    return base_value * diminishing_factor + uniqueness_bonus
```

### 5.4 Cognitive Load Indicators

Monitor for signs of context overload:

```python
class CognitiveLoadMonitor:
    """Detect and respond to context overload signals."""

    def __init__(self):
        self.overload_indicators = []

    def check_overload(self, context, response_history):
        """Check for signs of context confusion."""

        indicators = {
            'contradictory_statements': self.detect_contradictions(context),
            'irrelevant_tangents': self.detect_tangents(response_history),
            'missed_context_usage': self.detect_unused_context(context, response_history),
            'repetitive_questions': self.detect_repetition(response_history),
            'low_coherence': self.calculate_coherence(response_history)
        }

        overload_score = sum(indicators.values()) / len(indicators)

        if overload_score > 0.5:
            return {
                'overloaded': True,
                'indicators': indicators,
                'recommendation': self.get_recommendation(indicators)
            }

        return {'overloaded': False}

    def get_recommendation(self, indicators):
        """Suggest remediation based on indicators."""

        if indicators['contradictory_statements'] > 0.5:
            return 'resolve_contradictions'
        elif indicators['missed_context_usage'] > 0.5:
            return 'reduce_context_volume'
        elif indicators['irrelevant_tangents'] > 0.5:
            return 'improve_relevance_filtering'
        else:
            return 'general_context_reduction'
```

---

## Part 6: Pull Retrieval Patterns

### 6.1 Query-Driven Retrieval Strategies

Different strategies for different query types:

| Strategy | When to Use | Process |
|----------|-------------|---------|
| **No Retrieval** | Simple factual, high confidence | Use parametric knowledge |
| **Single-Shot** | Specific lookup, bounded topic | One retrieval pass |
| **Iterative** | Multi-hop, complex reasoning | Multiple retrieval rounds |
| **Graph-First** | Relationship questions | Start with graph traversal |
| **Hybrid** | General queries | Combine semantic + keyword + graph |

**Strategy Selection Logic:**

```python
def select_retrieval_strategy(query, context):
    """Choose optimal retrieval strategy for query."""

    # Feature extraction
    features = {
        'query_complexity': assess_complexity(query),
        'entity_count': len(extract_entities(query)),
        'relationship_keywords': has_relationship_keywords(query),
        'temporal_keywords': has_temporal_keywords(query),
        'confidence': estimate_confidence(query, context),
        'specificity': measure_specificity(query)
    }

    # Decision tree
    if features['confidence'] > 0.9 and features['query_complexity'] == 'simple':
        return 'no_retrieval'

    elif features['relationship_keywords'] and features['entity_count'] >= 2:
        return 'graph_first'

    elif features['query_complexity'] == 'multi_hop' or features['entity_count'] > 3:
        return 'iterative'

    elif features['specificity'] > 0.8:
        return 'single_shot'

    else:
        return 'hybrid'
```

### 6.2 Single-Shot Retrieval

For focused, specific queries:

```python
async def single_shot_retrieval(query, config):
    """One-pass retrieval for specific lookups."""

    # 1. Prepare query
    query_embedding = embed(query)
    query_terms = extract_keywords(query)
    query_entities = extract_entities(query)

    # 2. Parallel retrieval
    results = await asyncio.gather(
        semantic_search(query_embedding, top_k=50),
        keyword_search(query_terms, top_k=50),
        entity_lookup(query_entities)
    )

    # 3. Merge and score
    candidates = merge_results(*results)
    scored = score_candidates(candidates, query)

    # 4. Re-rank and return
    final = rerank_with_cross_encoder(query, scored, top_k=config.max_results)

    return final
```

### 6.3 Iterative Retrieval

For complex, multi-step queries:

```python
async def iterative_retrieval(query, context, max_iterations=3):
    """Multi-pass retrieval for complex reasoning."""

    accumulated_context = []
    current_query = query

    for iteration in range(max_iterations):
        # 1. Retrieve for current query
        results = await single_shot_retrieval(current_query, config)

        # 2. Add to accumulated context
        new_items = filter_already_retrieved(results, accumulated_context)
        accumulated_context.extend(new_items)

        # 3. Check if sufficient
        if is_sufficient(query, accumulated_context):
            break

        # 4. Reformulate query based on what we learned
        current_query = reformulate_query(
            original_query=query,
            retrieved_context=accumulated_context,
            gaps=identify_gaps(query, accumulated_context)
        )

    return accumulated_context
```

### 6.4 Graph-First Retrieval

For relationship-focused queries:

```python
async def graph_first_retrieval(query, config):
    """Start with knowledge graph, then enrich with vector search."""

    # 1. Extract entities from query
    entities = extract_entities(query)

    # 2. Graph traversal
    graph_results = []
    for entity in entities:
        # Direct connections
        neighbors = get_neighbors(entity, max_hops=2)
        graph_results.extend(neighbors)

        # Relationship-specific queries
        if relationship := extract_relationship_type(query):
            related = find_by_relationship(entity, relationship)
            graph_results.extend(related)

    # 3. Enrich with semantic search for context
    enrichment = await semantic_search(
        embed(query),
        top_k=20,
        exclude=graph_results
    )

    # 4. Combine and score
    all_candidates = graph_results + enrichment
    scored = score_candidates(all_candidates, query)

    return scored[:config.max_results]
```

---

## Part 7: Push Retrieval Patterns

### 7.1 Proactive Surfacing Strategies

Anticipate and pre-fetch relevant context:

| Pattern | Trigger | Action | Latency |
|---------|---------|--------|---------|
| **Goal Pre-fetch** | Goal mentioned | Load goal context + related memories | Immediate |
| **Predictive Pre-load** | Pattern match | Fetch predicted next topic | Before need |
| **Temporal Pre-load** | Event approaching | Load event-related context | Configurable |
| **Interest Deepening** | Repeated topic | Surface deeper related content | Gradual |
| **Context Warming** | Session start | Pre-load user preferences + recent | Session init |

### 7.2 Goal-Based Pre-fetching

```python
class GoalBasedPrefetcher:
    """Pre-fetch context when goals are detected."""

    def __init__(self, memory_store):
        self.memory = memory_store
        self.prefetch_cache = {}

    async def on_goal_detected(self, goal):
        """Pre-fetch context when a goal is mentioned."""

        if goal.id in self.prefetch_cache:
            return self.prefetch_cache[goal.id]

        # Parallel pre-fetch
        prefetched = await asyncio.gather(
            # Previous attempts at this goal
            self.memory.get_by_goal(goal.id),

            # Prerequisites and dependencies
            self.memory.get_prerequisites(goal.id),

            # Related successful patterns
            self.memory.get_successful_patterns(goal.type),

            # User preferences for this domain
            self.memory.get_preferences(goal.domain),

            # Recent related conversations
            self.memory.get_recent_related(goal.keywords, days=30)
        )

        # Assemble and cache
        context = assemble_prefetched_context(prefetched)
        self.prefetch_cache[goal.id] = context

        return context
```

### 7.3 Predictive Pattern Matching

```python
class PredictiveRetrieval:
    """Learn and predict context needs from interaction patterns."""

    def __init__(self):
        self.transition_model = {}  # topic -> likely_next_topic
        self.action_sequences = {}  # action -> likely_next_actions

    def learn_pattern(self, interaction_history):
        """Learn from interaction sequences."""

        for i in range(len(interaction_history) - 1):
            current = interaction_history[i]
            next_item = interaction_history[i + 1]

            # Topic transitions
            if current.topic and next_item.topic:
                key = current.topic
                if key not in self.transition_model:
                    self.transition_model[key] = defaultdict(int)
                self.transition_model[key][next_item.topic] += 1

    def predict_next_context(self, current_state):
        """Predict what context will be needed next."""

        predictions = []

        # Topic prediction
        if current_state.topic in self.transition_model:
            transitions = self.transition_model[current_state.topic]
            total = sum(transitions.values())

            for next_topic, count in transitions.items():
                probability = count / total
                if probability > 0.2:  # Threshold
                    predictions.append({
                        'type': 'topic',
                        'value': next_topic,
                        'probability': probability
                    })

        return predictions

    async def prefetch_predicted(self, predictions, memory):
        """Pre-fetch context for predicted needs."""

        prefetched = []

        for prediction in predictions:
            if prediction['probability'] > 0.3:  # Only high-probability
                if prediction['type'] == 'topic':
                    context = await memory.get_by_topic(
                        prediction['value'],
                        limit=5
                    )
                    prefetched.extend(context)

        return prefetched
```

### 7.4 Temporal Event Pre-loading

```python
class TemporalPrefetcher:
    """Pre-load context for upcoming temporal events."""

    def __init__(self, memory_store, calendar_service):
        self.memory = memory_store
        self.calendar = calendar_service
        self.prefetch_lead_time = {
            'meeting': timedelta(minutes=15),
            'deadline': timedelta(hours=2),
            'scheduled_task': timedelta(minutes=30),
            'recurring': timedelta(minutes=10)
        }

    async def check_and_prefetch(self):
        """Periodic check for upcoming events needing context."""

        prefetched = {}

        for event_type, lead_time in self.prefetch_lead_time.items():
            upcoming = await self.calendar.get_upcoming(
                event_type=event_type,
                within=lead_time
            )

            for event in upcoming:
                if event.id not in prefetched:
                    context = await self.prefetch_for_event(event)
                    prefetched[event.id] = context

        return prefetched

    async def prefetch_for_event(self, event):
        """Gather relevant context for an event."""

        return await asyncio.gather(
            # Previous instances of this event
            self.memory.get_event_history(event.recurring_id),

            # Related entities (people, projects, etc.)
            self.memory.get_entity_context(event.participants),

            # Notes and action items from last occurrence
            self.memory.get_action_items(event.id),

            # Relevant documents
            self.memory.get_related_documents(event.topic)
        )
```

### 7.5 Background Context Maintenance

```python
class BackgroundContextMaintenance:
    """Maintain and optimize context during idle periods."""

    async def idle_maintenance(self, current_session):
        """Run during idle periods to optimize context."""

        tasks = [
            # Consolidate episodic to semantic memories
            self.consolidate_memories(),

            # Update connection density scores
            self.update_graph_centrality(),

            # Pre-compute likely needed embeddings
            self.cache_frequent_embeddings(),

            # Identify and flag stale context
            self.mark_stale_context(),

            # Prepare summary of session so far
            self.generate_session_summary(current_session)
        ]

        await asyncio.gather(*tasks)

    async def consolidate_memories(self):
        """Promote frequently-accessed working memories."""

        working_memories = await self.memory.get_working_memories()

        for memory in working_memories:
            if memory.access_count >= 3 and memory.persistence_score > 0.4:
                # Promote to long-term
                await self.memory.consolidate(memory)

                # Extract and store relationships
                relationships = extract_relationships(memory)
                for rel in relationships:
                    await self.memory.add_relationship(rel)
```

---

## Part 8: Implementation Specifications

### 8.1 Complete Context Surfacing Pipeline

```python
class ContextSurfacingEngine:
    """Main engine for context surfacing decisions."""

    def __init__(self, config):
        self.config = config
        self.memory = MemoryStore()
        self.budget_manager = ContextBudgetManager()
        self.load_monitor = CognitiveLoadMonitor()
        self.proactive_engine = ProactiveTriggerEngine()

    async def surface_context(self, input_data, mode='pull'):
        """Main entry point for context surfacing."""

        if mode == 'pull':
            return await self.pull_context(input_data)
        else:
            return await self.push_context(input_data)

    async def pull_context(self, query):
        """Query-driven context retrieval."""

        # 1. Evaluate triggers
        trigger_result = evaluate_pull_triggers(query)

        if not trigger_result['retrieve']:
            return {'context': [], 'reason': trigger_result['reason']}

        # 2. Select strategy
        strategy = select_retrieval_strategy(query, self.current_context)

        # 3. Execute retrieval
        if strategy == 'no_retrieval':
            candidates = []
        elif strategy == 'single_shot':
            candidates = await single_shot_retrieval(query, self.config)
        elif strategy == 'iterative':
            candidates = await iterative_retrieval(query, self.current_context)
        elif strategy == 'graph_first':
            candidates = await graph_first_retrieval(query, self.config)
        else:  # hybrid
            candidates = await hybrid_retrieval(query, self.config)

        # 4. Score and filter
        scored = self.score_candidates(candidates, query)
        filtered = apply_quality_gates(scored, self.current_context)

        # 5. Apply budget
        final = self.budget_manager.allocate(filtered, 'retrieved_memories')

        # 6. Check for overload
        overload = self.load_monitor.check_overload(final, self.response_history)
        if overload['overloaded']:
            final = self.reduce_context(final, overload['recommendation'])

        return {'context': final, 'strategy': strategy, 'count': len(final)}

    async def push_context(self, current_state):
        """Proactive context surfacing."""

        # 1. Check proactive triggers
        triggers = self.proactive_engine.monitor(current_state)

        if not triggers:
            return {'context': [], 'reason': 'No proactive triggers'}

        # 2. Execute prefetch for each trigger
        prefetched = []
        for trigger in triggers:
            if trigger['type'] == 'goal_activation':
                context = await self.goal_prefetcher.on_goal_detected(trigger['target'])
                prefetched.extend(context)
            elif trigger['type'] == 'pattern_match':
                context = await self.predictive.prefetch_predicted(trigger['pattern'])
                prefetched.extend(context)
            elif trigger['type'] == 'temporal_signal':
                context = await self.temporal_prefetcher.prefetch_for_event(trigger['event'])
                prefetched.extend(context)

        # 3. Deduplicate and score
        unique = deduplicate(prefetched)
        scored = self.score_candidates(unique, current_state.implicit_query)

        # 4. Apply budget from exploration reserve
        final = self.budget_manager.allocate(scored, 'exploration_reserve')

        return {'context': final, 'triggers': triggers, 'count': len(final)}

    def score_candidates(self, candidates, query):
        """Apply multi-factor relevance scoring."""

        weights = get_weights_for_query(query)
        temporal_mode = detect_temporal_mode(query)

        for candidate in candidates:
            candidate.relevance_score = (
                weights['semantic'] * semantic_similarity(query, candidate) +
                weights['keyword'] * keyword_match_score(query, candidate) +
                weights['entity'] * entity_overlap_score(query, candidate) +
                weights['relationship'] * relationship_proximity_score(query, candidate) +
                weights['authority'] * source_authority_score(candidate) +
                weights['freshness'] * calculate_freshness_score(candidate, temporal_mode)
            )

        return sorted(candidates, key=lambda c: c.relevance_score, reverse=True)
```

### 8.2 Configuration Reference

```python
CONTEXT_SURFACING_CONFIG = {
    # Trigger thresholds
    'triggers': {
        'confidence_threshold': 0.7,        # Below this, retrieve
        'pattern_match_probability': 0.3,   # Minimum for predictive prefetch
        'entity_relevance_threshold': 0.5,  # Entity must be this relevant
        'topic_repeat_threshold': 3         # Mentions before deep fetch
    },

    # Relevance scoring weights (query-adaptive)
    'scoring': {
        'default_weights': {
            'semantic': 0.25,
            'keyword': 0.15,
            'entity': 0.20,
            'relationship': 0.15,
            'authority': 0.10,
            'freshness': 0.15
        },
        'cross_encoder_weight': 0.6,        # Weight for re-ranking
        'initial_retrieval_k': 100,         # Candidates for re-ranking
        'final_k': 10                       # Final results
    },

    # Freshness parameters
    'freshness': {
        'current_half_life_days': 7,
        'neutral_half_life_days': 30,
        'minimum_freshness': 0.1
    },

    # Budget allocation
    'budget': {
        'total_tokens': 8000,
        'system_ratio': 0.15,
        'preferences_ratio': 0.08,
        'task_ratio': 0.20,
        'memories_ratio': 0.35,
        'conversation_ratio': 0.15,
        'exploration_ratio': 0.07
    },

    # Quality gates
    'quality': {
        'minimum_relevance': 0.3,
        'minimum_info_density': 0.2,
        'maximum_redundancy': 0.7,
        'minimum_source_confidence': 0.4
    },

    # Overload prevention
    'overload': {
        'max_context_items': 15,
        'coherence_threshold': 0.6,
        'redundancy_check_window': 10
    },

    # Proactive settings
    'proactive': {
        'goal_prefetch_enabled': True,
        'predictive_enabled': True,
        'temporal_prefetch_enabled': True,
        'prefetch_cache_ttl_minutes': 30,
        'idle_maintenance_interval_seconds': 300
    }
}
```

### 8.3 Metrics and Monitoring

```python
CONTEXT_SURFACING_METRICS = {
    # Retrieval quality
    'retrieval_precision_at_10': {
        'target': 0.70,
        'description': 'Relevant results in top 10'
    },
    'retrieval_recall_at_10': {
        'target': 0.60,
        'description': 'Coverage of relevant information'
    },
    'context_utilization_rate': {
        'target': 0.60,
        'description': 'Portion of context actually used in response'
    },

    # Trigger accuracy
    'trigger_precision': {
        'target': 0.80,
        'description': 'Retrievals that added value'
    },
    'skip_accuracy': {
        'target': 0.90,
        'description': 'Correct decisions to skip retrieval'
    },

    # Overload prevention
    'overload_incidents': {
        'target': '<5%',
        'description': 'Responses showing context confusion'
    },
    'budget_utilization': {
        'target': '70-90%',
        'description': 'Context budget usage (too low=missing, too high=overload)'
    },

    # Latency
    'average_retrieval_latency_ms': {
        'target': '<500',
        'description': 'Time to complete retrieval'
    },
    'prefetch_hit_rate': {
        'target': '>30%',
        'description': 'Proactive prefetch used in actual queries'
    },

    # Freshness
    'temporal_accuracy': {
        'target': 0.85,
        'description': 'Correct temporal mode applied'
    },
    'stale_context_rate': {
        'target': '<10%',
        'description': 'Outdated context in responses'
    }
}
```

---

## Part 9: Decision Flowcharts

### 9.1 Master Decision Flow

```
                    ┌─────────────────────┐
                    │   INPUT RECEIVED    │
                    │  (query or event)   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Is this a query    │
                    │  or proactive       │
                    │  event?             │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
       ┌──────────────┐                 ┌──────────────┐
       │    QUERY     │                 │   EVENT      │
       │  (Pull Mode) │                 │ (Push Mode)  │
       └──────┬───────┘                 └──────┬───────┘
              │                                 │
              ▼                                 ▼
       ┌──────────────┐                 ┌──────────────┐
       │ Check skip   │                 │ Evaluate     │
       │ conditions   │                 │ proactive    │
       │              │                 │ triggers     │
       └──────┬───────┘                 └──────┬───────┘
              │                                 │
    ┌─────────┴─────────┐             ┌─────────┴─────────┐
    │                   │             │                   │
    ▼                   ▼             ▼                   ▼
 ┌──────┐          ┌──────┐      ┌──────┐          ┌──────┐
 │ Skip │          │Proceed│      │ None │          │Active│
 │      │          │      │      │      │          │      │
 └──┬───┘          └──┬───┘      └──┬───┘          └──┬───┘
    │                 │             │                  │
    ▼                 ▼             ▼                  ▼
 Return            Select        Return            Execute
 empty             strategy      empty             prefetch
 context                         context
```

### 9.2 Relevance Scoring Decision

```
┌─────────────────────────────────────────────────────────────┐
│              RELEVANCE SCORING DECISION                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Classify query type                                     │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────┐          │
│  │ factual? → boost keyword weight              │          │
│  │ exploratory? → boost semantic weight         │          │
│  │ temporal? → boost freshness weight           │          │
│  │ relational? → boost relationship weight      │          │
│  └──────────────────────────────────────────────┘          │
│         │                                                   │
│         ▼                                                   │
│  2. Detect temporal mode                                    │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────┐          │
│  │ current? → strong recency preference         │          │
│  │ historical? → prefer older established       │          │
│  │ evolution? → need both old and new           │          │
│  │ neutral? → mild recency bias                 │          │
│  └──────────────────────────────────────────────┘          │
│         │                                                   │
│         ▼                                                   │
│  3. Calculate composite score                               │
│         │                                                   │
│         ▼                                                   │
│  4. Apply cross-encoder re-ranking                          │
│         │                                                   │
│         ▼                                                   │
│  5. Apply quality gates                                     │
│         │                                                   │
│         ▼                                                   │
│  6. Budget allocation                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 10: Summary and Key Takeaways

### 10.1 Core Framework Components

| Component | Purpose | Key Mechanism |
|-----------|---------|---------------|
| **Trigger System** | Decide IF to retrieve | Pull triggers + Push triggers + Skip conditions |
| **Strategy Selection** | Decide HOW to retrieve | Query classification → Strategy mapping |
| **Relevance Scoring** | Decide WHAT is relevant | Multi-factor scoring with query-adaptive weights |
| **Freshness Factors** | Handle temporal relevance | Query-dependent freshness modes |
| **Overload Prevention** | Avoid context confusion | Budget system + Quality gates + Load monitoring |
| **Pull Retrieval** | Respond to explicit needs | Single-shot, Iterative, Graph-first, Hybrid |
| **Push Retrieval** | Anticipate future needs | Goal-based, Predictive, Temporal prefetching |

### 10.2 Implementation Priority

| Priority | Component | Rationale |
|----------|-----------|-----------|
| **1 (HIGH)** | Basic trigger system | Foundation for all retrieval |
| **2 (HIGH)** | Multi-factor relevance scoring | Core quality improvement |
| **3 (HIGH)** | Context budget management | Prevents overload |
| **4 (MEDIUM)** | Strategy selection | Optimizes retrieval efficiency |
| **5 (MEDIUM)** | Quality gates | Filters low-value context |
| **6 (MEDIUM)** | Freshness factors | Temporal relevance |
| **7 (LOW)** | Proactive prefetching | Performance optimization |
| **8 (LOW)** | Predictive patterns | Advanced anticipation |

### 10.3 Success Metrics Summary

- **Retrieval Precision@10 > 70%**: Most retrieved context is relevant
- **Context Utilization > 60%**: Retrieved context is actually used
- **Overload Incidents < 5%**: Rarely overwhelm the agent
- **Budget Utilization 70-90%**: Efficient use of context window
- **Retrieval Latency < 500ms**: Fast response times
- **Prefetch Hit Rate > 30%**: Proactive retrieval adds value

---

## References

### Research Sources
- [Retrieval Augmented Decision-Making](https://arxiv.org/html/2505.18483v1) - Multi-criteria decision framework
- [Anthropic - Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) - Just-in-time context strategies
- [Reasoning Agentic RAG Survey](https://arxiv.org/html/2506.10408v1) - Adaptive retrieval systems
- [Agentic Information Retrieval](https://arxiv.org/abs/2410.09713) - Dynamic information states
- [IBM - Agentic Reasoning](https://www.ibm.com/think/topics/agentic-reasoning) - Context-aware decision making

### AI Memory Systems
- [Letta - Agent Memory](https://www.letta.com/blog/agent-memory) - Push vs pull retrieval
- [AI-Native Memory](https://ajithp.com/2025/06/30/ai-native-memory-persistent-agents-second-me/) - Proactive context surfacing
- [AWS AgentCore Memory](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive/) - Temporal decay mechanisms
- [Mem0 Architecture](https://arxiv.org/pdf/2504.19413) - Memory filtering and decay

### Cognitive Science & Information Overload
- [OECD - AI and Cognitive Capacity](https://oecd.ai/en/wonk/can-ai-combat-the-cognitive-capacity-issues-related-to-information-overload) - Cognitive augmentation
- [PMC - Information Overload Review](https://pmc.ncbi.nlm.nih.gov/articles/PMC10322198/) - Filtering mechanisms
- [Cognitive Load and AI](https://medium.com/@johnpetty_71672/cognitive-bandwidth-managing-information-overload-in-the-age-of-ai-8df5905d532d) - Managing cognitive burden

### RAG and Retrieval
- [RAG Techniques Repository](https://github.com/NirDiamant/RAG_Techniques) - Advanced RAG patterns
- [Microsoft - Contextual Retrieval](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/building-a-contextual-retrieval-system-for-improving-rag-accuracy/4271924) - Improving retrieval accuracy
- [Self-RAG](https://selfrag.github.io/) - Adaptive retrieval decisions
- [LlamaIndex - Relevancy Evaluation](https://docs.llamaindex.ai/en/stable/examples/evaluation/answer_and_context_relevancy/) - Context relevancy metrics

---

*Document Version: 1.0*
*Last Updated: January 2025*
*Status: Research Complete - Ready for Implementation*
