# Contextual Retrieval Strategies and Timing Mechanisms

## Research Document for Visioneer Memory System

**Date:** December 2024
**Focus:** WHEN to surface context and WHAT context is most relevant
**Document Type:** Research Synthesis

---

## Executive Summary

This document investigates advanced strategies for determining **when to retrieve context** and **what context to surface** for AI agents. The research covers attention mechanisms, query understanding, temporal relevance scoring, and proactive vs reactive retrieval patterns. Key techniques documented include Hypothetical Document Embeddings (HyDE), Self-RAG reflection tokens, query decomposition, and context window optimization.

### Key Findings

1. **Retrieval Timing Should Be Adaptive:** Static "always retrieve" approaches are suboptimal; systems should decide dynamically based on query complexity and confidence
2. **Self-RAG Reflection Tokens** provide a proven mechanism for autonomous retrieval decisions
3. **Temporal Relevance** requires decay functions and recency bias balancing
4. **Proactive Memory** transforms agents from reactive to anticipatory
5. **Context Engineering** is now recognized as a distinct discipline beyond prompt engineering

---

## Part 1: When to Retrieve - Decision Mechanisms

### 1.1 Self-RAG Reflection Token Framework

Self-RAG (Self-Reflective Retrieval-Augmented Generation) introduces a groundbreaking approach where the model itself decides when retrieval is necessary using special **reflection tokens**.

**The Four Reflection Tokens:**

| Token | Purpose | Question Asked | Action if False |
|-------|---------|----------------|-----------------|
| `RETRIEVE` | Determine retrieval necessity | "Do I need external information?" | Skip retrieval entirely |
| `ISREL` | Assess relevance | "Is retrieved passage relevant?" | Discard, try different query |
| `ISSUP` | Verify support | "Does evidence support my answer?" | Flag uncertainty |
| `ISUSE` | Evaluate utility | "Is the overall response useful?" | Refine or regenerate |

**How Self-RAG Makes Retrieval Decisions:**

```
At each generation segment (e.g., sentence):
1. Model predicts RETRIEVE token
2. If RETRIEVE=YES:
   - Retrieve passages from knowledge base
   - For each passage, predict ISREL token
   - Filter to relevant passages only
   - Generate response segment
   - Predict ISSUP (is response supported?)
3. If RETRIEVE=NO:
   - Generate directly from parametric knowledge
4. Finally, predict ISUSE for overall quality
```

**Why This Matters for Visioneer:**
- Reduces unnecessary retrieval overhead
- Prevents "context poisoning" from irrelevant information
- Enables adaptive behavior based on query complexity

**Source:** [Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection](https://arxiv.org/abs/2310.11511)

---

### 1.2 Query Complexity Classification

**Three-Tier Query Classification:**

| Tier | Query Type | Retrieval Strategy | Example |
|------|------------|-------------------|---------|
| 1 | Simple/Factual | No retrieval or minimal | "What is 2+2?" |
| 2 | Specific Lookup | Single-shot RAG | "What is Visioneer's current version?" |
| 3 | Complex/Multi-hop | Iterative/Graph RAG | "Compare our forgetting mechanism with human memory decay" |

**Query Routing Decision Logic:**

```python
def determine_retrieval_strategy(query, confidence):
    """Select optimal retrieval strategy based on query characteristics."""

    # High confidence + simple query = skip retrieval
    if is_simple_factual(query) and confidence > 0.9:
        return 'no_retrieval'

    # Specific entity/fact lookup = single pass
    elif is_specific_lookup(query):
        return 'single_shot_rag'

    # Multiple entities or reasoning steps required
    elif is_complex_multi_hop(query):
        return 'iterative_rag'

    # Relationship or connection queries
    elif is_relationship_query(query):
        return 'graph_rag'

    # Default balanced approach
    else:
        return 'hybrid_rag'
```

**Source:** [Agentic RAG Survey](https://arxiv.org/html/2501.09136v2)

---

### 1.3 Adaptive Retrieval Triggers

**When to Trigger Additional Retrieval:**

| Trigger Condition | Action | Rationale |
|-------------------|--------|-----------|
| Low confidence in initial response | Retrieve more | Need external validation |
| Entity/concept not in working memory | Retrieve | Missing information |
| Contradiction detected | Retrieve recent sources | Resolve with authoritative source |
| Multi-hop query detected | Iterative retrieval | Build understanding progressively |
| User expresses confusion | Retrieve clarifying context | Need different angle |
| Time-sensitive topic | Retrieve with recency bias | Need current information |

**Corrective RAG (CRAG) Pattern:**

```
1. Relevance Evaluation Agent assesses retrieved documents
2. If relevance < threshold:
   a. Query Refinement Agent optimizes search terms
   b. Retry retrieval with improved query
3. If insufficient after retry:
   a. External Knowledge Agent searches web
4. Feedback loop enables continuous improvement
```

---

## Part 2: What Context to Surface - Selection Strategies

### 2.1 Hypothetical Document Embeddings (HyDE)

**Core Innovation:** Bridge the semantic gap between short queries and long documents by generating a hypothetical answer first.

**The HyDE Process:**

```
1. Query: "What causes database deadlocks?"

2. Generate Hypothetical Document (via LLM):
   "Database deadlocks occur when two or more transactions
   permanently block each other by holding locks on resources
   the other needs. Common causes include circular wait
   conditions, improper lock ordering, and long-running
   transactions..."

3. Embed the hypothetical document

4. Search for REAL documents similar to this hypothetical

5. Return matched documents (not the hypothetical)
```

**Why HyDE Works:**
- **Document-to-document comparison** vs question-to-document
- Hypothetical document uses similar vocabulary/structure to real documents
- Zero-shot - no training required
- Works even if hypothetical contains inaccuracies

**When to Use HyDE:**
- Complex conceptual queries
- Domain-specific searches where LLM has some knowledge
- When traditional embedding search underperforms

**Limitations:**
- Adds latency (requires LLM generation before search)
- Can amplify hallucinations if LLM generates wrong direction
- Less effective for simple factual lookups

**Source:** [Zilliz - Better RAG with HyDE](https://zilliz.com/learn/improve-rag-and-information-retrieval-with-hyde-hypothetical-document-embeddings)

---

### 2.2 Query Expansion Techniques

**Multi-Query Expansion:**

```python
def expand_query(original_query):
    """Generate multiple query variations to improve recall."""

    expanded = [original_query]

    # Synonym expansion
    expanded.append(replace_with_synonyms(original_query))

    # Perspective reframing
    expanded.append(rephrase_as_different_perspective(original_query))

    # Specific-to-general
    expanded.append(generalize_query(original_query))

    # General-to-specific
    expanded.append(specialize_query(original_query))

    return expanded

# Retrieve for all variations, merge results
results = []
for query in expand_query(original):
    results.extend(retrieve(query))
return deduplicate_and_rerank(results)
```

**Question Decomposition for Multi-Hop:**

```
Original: "How does Visioneer's memory system compare to
          human episodic memory in terms of consolidation?"

Decomposed Sub-Queries:
1. "Visioneer memory system consolidation mechanism"
2. "Human episodic memory consolidation process"
3. "Memory consolidation similarities AI vs human"
4. "Differences between artificial and biological memory encoding"
```

**Source:** [Question Decomposition for RAG](https://arxiv.org/html/2507.00355v1)

---

### 2.3 Attention-Based Context Selection

**AttentionRAG Approach:**

```
Core Idea: Use attention scores to identify which context
is most relevant, then prune low-attention content.

Process:
1. Retrieve initial set of documents
2. Transform RAG query into next-token prediction format
3. Analyze attention patterns across retrieved context
4. Prune content with low attention focus
5. Result: 6.3x context compression with maintained performance
```

**Lost-in-the-Middle Problem:**

Research shows LLMs exhibit a U-shaped attention pattern:
- **Beginning:** High attention (recency/primacy effect)
- **Middle:** Lowest attention (information gets "lost")
- **End:** Moderate attention uptick

**Mitigation Strategies:**

| Strategy | Implementation |
|----------|----------------|
| Position most relevant first | Re-rank before context assembly |
| Repeat critical information | Echo key facts at end of context |
| Chunk strategically | Keep related information together |
| Summarize middle content | Compress less-attended sections |

**Source:** [AttentionRAG](https://arxiv.org/html/2503.10720v1)

---

### 2.4 Temporal Relevance Scoring

**The Temporal Relevance Formula:**

```
final_score = similarity_score * time_factor

time_factor = (1 - recency_bias) + recency_bias * decay_value

decay_value = 1.0 - (age_of_datapoint / total_time_span)
```

**Configurable Recency Bias:**

| recency_bias Value | Behavior |
|--------------------|----------|
| 0.0 | Only similarity matters (ignore time) |
| 0.3 (default) | 70% weight to similarity, 30% to recency |
| 0.7 | Strong recency preference |
| 1.0 | Ranking dominated by recency |

**Re3 Framework - Balancing Relevance & Recency:**

```
Problem: Static recency bias doesn't work for all queries.

Solution: Query-aware gating mechanism that dynamically
adjusts temporal vs semantic weighting.

- Some queries need latest info: "current stock price"
- Some need historical: "original design philosophy"
- Some need both: "how has approach evolved"

The gate increases temporal influence when helpful but
avoids overwhelming semantic relevance.
```

**Recency Bias in LLMs:**

Research finding: All tested LLMs (GPT-3.5, GPT-4, LLaMA, Qwen) systematically promote newer content, pushing average publication year forward by up to 4.78 years.

**Implication:** Systems must actively compensate for inherent LLM recency bias when temporal neutrality is desired.

**Sources:**
- [Temporal Relevance - Airweave](https://airweave.ai/blog/temporal-relevance-explained)
- [Re3: Balancing Relevance & Recency](https://arxiv.org/abs/2509.01306)

---

## Part 3: Proactive vs Reactive Retrieval

### 3.1 Reactive Retrieval (Traditional)

**Pattern:** User asks → System retrieves → System responds

**Characteristics:**
- Responds only to explicit requests
- No anticipation of information needs
- Simple but limited

**When Appropriate:**
- Well-defined single-turn queries
- Low-latency requirements
- Simple factual lookups

---

### 3.2 Proactive Retrieval (Advanced)

**Pattern:** System anticipates → Pre-fetches relevant context → Ready when needed

**Proactive Triggers:**

| Trigger | Anticipatory Action |
|---------|---------------------|
| Goal detection | Pre-fetch resources related to goal |
| Pattern recognition | "User often asks about X after Y" |
| Temporal signals | "Daily standup approaching" |
| Conversation flow | "Discussion moving toward topic Z" |
| Entity mention | Pre-load related entity information |

**Implementation Formula:**

```
Proactivity = Memory + Structured State + Trigger Mechanisms
```

**Key Components:**

1. **Memory Layer:** What the system knows about user/context
2. **State Management:** Current goals, active tasks, preferences
3. **Trigger System:** Rules/patterns that initiate proactive retrieval

---

### 3.3 Hybrid Proactive-Reactive Pattern

**Recommended Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    CONTEXT MANAGER                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐    ┌─────────────────┐            │
│  │ PROACTIVE LAYER │    │ REACTIVE LAYER  │            │
│  ├─────────────────┤    ├─────────────────┤            │
│  │ • Goal-based    │    │ • Query-driven  │            │
│  │ • Pattern-based │    │ • On-demand     │            │
│  │ • Temporal      │    │ • User-initiated│            │
│  │ • Anticipatory  │    │                 │            │
│  └────────┬────────┘    └────────┬────────┘            │
│           │                      │                      │
│           └──────────┬───────────┘                      │
│                      ▼                                  │
│           ┌─────────────────────┐                       │
│           │  CONTEXT ASSEMBLY   │                       │
│           │  • Merge & dedupe   │                       │
│           │  • Priority ranking │                       │
│           │  • Budget allocation│                       │
│           └─────────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

**Source:** [Designing Proactive AI - Medium](https://medium.com/@SreePotluri/designing-proactive-ai-the-power-of-memory-in-agentic-systems-14ee2552cee3)

---

## Part 4: Context Window Optimization

### 4.1 Just-in-Time vs Pre-Loading Strategies

**Comparison:**

| Aspect | Pre-Loading | Just-in-Time | Hybrid |
|--------|-------------|--------------|--------|
| Latency | Lower (ready) | Higher (fetch on demand) | Balanced |
| Relevance | May include unnecessary | Highly targeted | Optimized |
| Complexity | Simple | Complex | Medium |
| Use Case | Static, bounded info | Large, dynamic datasets | Agent tasks |

**Just-in-Time Implementation:**

```python
class JustInTimeContextManager:
    """Load context on demand rather than pre-populating."""

    def __init__(self):
        # Maintain lightweight references, not full content
        self.file_paths = []
        self.stored_queries = []
        self.web_links = []

    def load_on_demand(self, identifier):
        """Dynamically load content when actually needed."""
        if identifier in self.file_paths:
            return read_file(identifier)
        elif identifier in self.stored_queries:
            return execute_query(identifier)
        elif identifier in self.web_links:
            return fetch_url(identifier)
```

**Source:** [Anthropic - Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

---

### 4.2 Progressive Disclosure Pattern

**Core Principle:** Allow agents to discover context through exploration rather than pre-loading everything.

**Implementation:**

```python
class ProgressiveContextDiscovery:
    """Agent-initiated context exploration."""

    def __init__(self, initial_context, exploration_budget=3):
        self.core = initial_context      # Always available
        self.discovered = []             # Found during exploration
        self.budget = exploration_budget # Max exploration steps

    def explore(self, query):
        """Agent decides to explore for more context."""
        if self.budget <= 0:
            return "Exploration budget exhausted"

        self.budget -= 1
        results = hybrid_retrieve(query, top_k=5)
        self.discovered.extend(results)
        return results

    def get_context(self):
        return self.core + self.discovered
```

**Benefits:**
- Avoids context window bloat
- Agent finds what it actually needs
- Supports discovery of "unknown unknowns"

---

### 4.3 Context Compaction Techniques

**For Long Conversations:**

```python
def compact_conversation(turns, target_tokens):
    """Intelligently compress conversation history."""

    important = []

    # Always keep: first turn (establishes context)
    important.append(turns[0])

    # Always keep: last 3 turns (recent context)
    important.extend(turns[-3:])

    # Score middle turns
    middle = turns[1:-3]
    for turn in middle:
        turn.score = calculate_importance(turn)

    # Add high-importance middle turns until budget reached
    middle.sort(key=lambda t: t.score, reverse=True)

    tokens_used = count_tokens(important)
    for turn in middle:
        if tokens_used + count_tokens(turn) <= target_tokens:
            important.append(turn)
            tokens_used += count_tokens(turn)

    # Restore chronological order
    important.sort(key=lambda t: t.index)

    return important
```

**Turn Importance Factors:**

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Contains user correction | High | Learning moments |
| Contains explicit decision | High | Key commitments |
| Contains goal statement | High | Direction setting |
| Contains error info | High | Debugging context |
| Referenced later | Medium | Proved important |
| Long/detailed | Low | May be verbose |

---

## Part 5: Memory Integration Patterns

### 5.1 Episodic to Semantic Consolidation

**Human-Inspired Pattern:**

```
Working Memory (Episodic)
    │
    │ Consolidation triggers:
    │ • Retrieval frequency
    │ • Connection formation
    │ • Time survival
    │ • Explicit reinforcement
    │
    ▼
Semantic Memory (Facts/Relationships)
    │
    │ Abstraction triggers:
    │ • Pattern recognition
    │ • Cross-episode themes
    │ • Goal relevance
    │
    ▼
Procedural/Schema Memory (Patterns/Skills)
```

**Consolidation Criteria for Retrieval Timing:**

| Memory State | Retrieval Priority | Rationale |
|--------------|-------------------|-----------|
| Recently consolidated | High | Still fresh, well-connected |
| Frequently accessed | High | Proven useful |
| Goal-related | High | Currently relevant |
| Dormant but connected | Medium | May become relevant |
| Isolated, old | Low | Likely not needed |

---

### 5.2 Associative Retrieval via Context Cues

**Cognitive Science Insight:**

> "When events are represented in memory, contextual information is stored along with memory targets; the context can therefore cue memories containing that contextual information."

**Implementation for AI Agents:**

```python
def associative_retrieve(current_context):
    """Retrieve memories associated with current context cues."""

    # Extract context cues
    cues = {
        'entities': extract_entities(current_context),
        'topics': extract_topics(current_context),
        'temporal': extract_time_references(current_context),
        'goals': extract_goals(current_context),
        'emotional': extract_salience_markers(current_context)
    }

    # Retrieve memories matching cues
    memories = []
    for cue_type, cue_values in cues.items():
        for cue in cue_values:
            matches = memory_store.get_by_cue(cue_type, cue)
            memories.extend(matches)

    # Rank by cue overlap and recency
    return rank_by_relevance(memories, cues)
```

**Source:** [Context-Dependent Memory - Wikipedia](https://en.wikipedia.org/wiki/Context-dependent_memory)

---

## Part 6: Visioneer Implementation Recommendations

### 6.1 Immediate Actions (High Impact, Low Effort)

1. **Implement Query Complexity Classification**
   ```python
   # Add to retrieval pipeline
   def classify_query(query):
       if is_simple_factual(query):
           return SKIP_RETRIEVAL
       elif is_single_entity_lookup(query):
           return SINGLE_SHOT
       else:
           return FULL_RAG
   ```

2. **Add Temporal Relevance Scoring**
   ```python
   # Modify retrieval scoring
   final_score = semantic_score * (0.7 + 0.3 * recency_decay)
   ```

3. **Implement Basic Proactive Triggers**
   - Goal mention → Pre-fetch goal-related memories
   - Entity reference → Load entity context

### 6.2 Medium-Term Enhancements

4. **Self-RAG Reflection Tokens**
   - Add RETRIEVE decision point before each retrieval
   - Implement ISREL filtering after retrieval
   - Track and optimize retrieval decisions

5. **HyDE for Complex Queries**
   - Detect complex conceptual queries
   - Generate hypothetical document
   - Use for retrieval, not as answer

6. **Progressive Disclosure**
   - Implement exploration budget
   - Agent-initiated deep dives
   - Track discovered vs core context

### 6.3 Advanced Features

7. **Multi-Hop Query Decomposition**
   - Detect multi-entity/multi-step queries
   - Decompose into sub-queries
   - Parallel retrieve, merge results

8. **Attention-Based Pruning**
   - Track what context gets used
   - Prune low-attention content
   - Optimize context window usage

9. **Adaptive Recency Bias**
   - Query-aware temporal weighting
   - Override for time-sensitive topics
   - Balance semantic vs temporal

---

## Part 7: Key Metrics for Context Retrieval

### 7.1 Retrieval Timing Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Retrieval Decision Accuracy | >85% | Did we correctly decide to retrieve/skip? |
| Unnecessary Retrieval Rate | <15% | Retrievals that added no value |
| Missed Retrieval Rate | <10% | Queries that needed retrieval but didn't get it |

### 7.2 Context Selection Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Context Relevance Score | >0.8 | Retrieved context relevance to query |
| Context Utilization | >60% | Portion of context actually used in response |
| Context Sufficiency | >90% | Queries where context was sufficient |

### 7.3 Temporal Relevance Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Temporal Accuracy | >85% | Time-sensitive queries get fresh data |
| Recency Bias Detection | Monitor | Track if system over-favors recent |
| Historical Query Coverage | >80% | Historical queries get appropriate old data |

---

## References

### Primary Sources
- [Self-RAG - Learning to Retrieve, Generate, and Critique](https://arxiv.org/abs/2310.11511)
- [Anthropic - Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Agentic RAG Survey](https://arxiv.org/html/2501.09136v2)
- [HyDE - Hypothetical Document Embeddings](https://zilliz.com/learn/improve-rag-and-information-retrieval-with-hyde-hypothetical-document-embeddings)

### Supporting Research
- [AttentionRAG - Context Pruning](https://arxiv.org/html/2503.10720v1)
- [Re3 - Balancing Relevance & Recency](https://arxiv.org/abs/2509.01306)
- [Question Decomposition for RAG](https://arxiv.org/html/2507.00355v1)
- [Multi-Hop RAG](https://github.com/yixuantt/MultiHop-RAG)
- [Temporal Relevance in AI](https://airweave.ai/blog/temporal-relevance-explained)
- [Proactive AI Memory](https://medium.com/@SreePotluri/designing-proactive-ai-the-power-of-memory-in-agentic-systems-14ee2552cee3)
- [Context-Dependent Memory](https://en.wikipedia.org/wiki/Context-dependent_memory)

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Status: Research Complete*
