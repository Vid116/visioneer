# Forgetting and Memory Consolidation Framework
## For AI Agent Memory Lifecycle Management

**Research Date:** January 2025
**Purpose:** Define actionable rules for what memories persist vs. fade in Visioneer's AI memory system

---

## Executive Summary

This framework synthesizes cognitive science research and AI memory practices into actionable rules for memory lifecycle management. The core insight is that **forgetting is not a bug but a feature**—strategic memory decay prevents cognitive overload and maintains focus on relevant information. The framework defines five persistence factors, three decay functions, and specific consolidation triggers.

---

## 1. Theoretical Foundation

### 1.1 Active vs Passive Forgetting

**Key Insight from Neuroscience**: Forgetting is the brain's default state—active consolidation processes must override it for memories to persist.

| Type | Mechanism | AI Analog |
|------|-----------|-----------|
| **Passive Decay** | Synaptic connections weaken over time | Time-based relevance decay |
| **Active Forgetting** | Dopamine-mediated erasure of unused traces | Explicit memory pruning |
| **Interference** | New learning disrupts similar old memories | Contradiction-based invalidation |
| **Retrieval Failure** | Memory exists but cannot be accessed | Indexing/query degradation |

### 1.2 The Ebbinghaus Forgetting Curve

Mathematical model of natural memory decay:

```
R(t) = e^(-t/S)

Where:
  R = Retrievability (0 to 1)
  t = Time since encoding
  S = Memory stability (higher = slower decay)
```

**Key Finding**: Without reinforcement, ~50% forgotten within 1 hour, ~90% within 30 days.

### 1.3 Power Law of Forgetting (More Accurate for Long-term)

```
Q(t) = (1 + μt)^(-a)

Where:
  Q = Retention probability
  μ = Time scaling factor
  a = Decay exponent (typically 0.2-0.5)
```

**Key Insight**: Older memories decay proportionally slower—survival probability increases with age.

---

## 2. Persistence Factors

### 2.1 Factor Weighting Model

Each memory receives a **Persistence Score (PS)** calculated from five factors:

```
PS = w₁·F + w₂·E + w₃·C + w₄·R + w₅·I

Where:
  F = Frequency of Access (0-1)
  E = Emotional Salience Proxy (0-1)
  C = Connection Density (0-1)
  R = Recency Score (0-1)
  I = Intentional Importance (0-1)

Default weights: w₁=0.25, w₂=0.20, w₃=0.25, w₄=0.15, w₅=0.15
```

### 2.2 Factor Definitions

#### Factor 1: Frequency of Access (F)
**Rationale**: Memories that are retrieved frequently are reinforced through the testing effect.

```
F = 1 - e^(-k·n)

Where:
  n = Number of retrievals
  k = Reinforcement constant (default: 0.3)
```

| Retrieval Count | F Score |
|-----------------|---------|
| 0 | 0.00 |
| 1 | 0.26 |
| 3 | 0.59 |
| 5 | 0.78 |
| 10 | 0.95 |

**Tracking Requirements**:
- Log each retrieval with timestamp
- Track successful vs. failed retrievals (successful = higher weight)
- Monitor which memories are used in reasoning chains

#### Factor 2: Emotional Salience Proxy (E)
**Rationale**: Emotionally significant events are preferentially encoded and consolidated in biological memory.

**Proxy Metrics for AI Systems**:

| Proxy Metric | Weight | Description |
|--------------|--------|-------------|
| User Reaction Intensity | 0.3 | Explicit feedback (strong positive/negative) |
| Conversation Length | 0.15 | Extended discussions indicate importance |
| Error Correction Events | 0.2 | User corrections signal critical information |
| Goal/Preference Statements | 0.25 | Explicit preferences and values |
| Context Switches Prevented | 0.1 | Information that kept conversation on track |

```
E = Σ(metric_i × weight_i) / Σ(weight_i)
```

**Implementation**:
- Track sentiment analysis of user responses
- Log explicit user corrections or emphasis
- Identify goal-setting and preference-expressing statements
- Weight memories associated with strong outcomes (success/failure)

#### Factor 3: Connection Density (C)
**Rationale**: Memories with more connections to other memories (higher graph centrality) are harder to forget and more valuable for reasoning.

```
C = min(1, degree(node) / max_degree × α + pagerank(node) × β)

Where:
  degree = Number of direct edges
  max_degree = Normalization constant
  pagerank = Graph centrality measure
  α = 0.4, β = 0.6 (default weights)
```

**Implementation**:
- Calculate in-degree and out-degree for each memory node
- Run PageRank or similar centrality algorithm periodically
- Higher scores for "hub" memories that connect many concepts
- Consider relationship type diversity (not just count)

**Graph Centrality Interpretation**:
| Centrality Type | Meaning for Memory |
|-----------------|-------------------|
| Degree | Direct connections (immediate relevance) |
| Betweenness | Bridge between memory clusters |
| PageRank | Importance through recursive connections |
| Closeness | Average distance to all other memories |

#### Factor 4: Recency Score (R)
**Rationale**: Recent memories are more likely to be relevant to current context.

```
R = e^(-t/τ)

Where:
  t = Time since last access (days)
  τ = Time constant (default: 30 days)
```

| Days Since Access | R Score |
|-------------------|---------|
| 0 | 1.00 |
| 7 | 0.79 |
| 30 | 0.37 |
| 60 | 0.14 |
| 90 | 0.05 |

**Note**: This is recency of access, not creation. A 1-year-old memory accessed yesterday gets R=1.0.

#### Factor 5: Intentional Importance (I)
**Rationale**: Some memories should persist regardless of usage patterns due to explicit importance marking.

**Importance Markers**:

| Marker Type | I Value | Description |
|-------------|---------|-------------|
| User-Pinned | 1.0 | Explicit "remember this" instruction |
| System-Critical | 1.0 | Core preferences, identity, safety constraints |
| Goal-Related | 0.8 | Connected to active or recurring goals |
| Contradiction Resolution | 0.7 | Resolution of prior conflicts |
| Default | 0.0 | No explicit importance assigned |

**Implementation**:
- Parse for explicit "remember", "important", "always" keywords
- Flag memories related to user preferences and core goals
- System can mark critical information during consolidation
- Allow user to "pin" specific memories through interaction

---

## 3. Decay Functions

### 3.1 Function Selection by Memory Type

| Memory Type | Recommended Function | Rationale |
|-------------|---------------------|-----------|
| Episodic (Events) | Exponential | Quick initial decay, preserves gist |
| Semantic (Facts) | Linear | Steady decay, facts remain relevant longer |
| Procedural (How-to) | Gaussian | Stable unless significantly outdated |
| Preference (User) | None/Minimal | Core preferences should persist |

### 3.2 Exponential Decay

Best for episodic memories where details fade but essence persists.

```
S(t) = S₀ × e^(-λt)

Where:
  S(t) = Strength at time t
  S₀ = Initial strength (from PS score)
  λ = Decay rate constant

Default λ values:
  - High salience: 0.01 (slow decay)
  - Medium salience: 0.05 (moderate decay)
  - Low salience: 0.15 (fast decay)
```

### 3.3 Linear Decay

Best for factual information with steady relevance decrease.

```
S(t) = max(0, S₀ - k×t)

Where:
  k = Decay rate per time unit

Default k values:
  - Stable facts: 0.001 per day
  - Time-sensitive info: 0.02 per day
  - Contextual details: 0.05 per day
```

### 3.4 Gaussian Decay

Best for information that remains stable until a "cliff" point.

```
S(t) = S₀ × e^(-(t-μ)²/(2σ²))

Where:
  μ = Center point (expected useful lifespan)
  σ = Standard deviation (decay steepness)
```

**Use Case**: Procedural knowledge that's either fully valid or obsolete (e.g., API methods, workflow steps).

### 3.5 Decay Function Parameters

```python
# Suggested parameter ranges
DECAY_PARAMS = {
    'exponential': {
        'high_importance': {'lambda': 0.01},    # Half-life: ~69 days
        'medium_importance': {'lambda': 0.05},  # Half-life: ~14 days
        'low_importance': {'lambda': 0.15}      # Half-life: ~5 days
    },
    'linear': {
        'stable': {'k': 0.001},      # Full decay: 1000 days
        'moderate': {'k': 0.01},     # Full decay: 100 days
        'volatile': {'k': 0.05}      # Full decay: 20 days
    },
    'gaussian': {
        'long_term': {'mu': 365, 'sigma': 100},
        'medium_term': {'mu': 90, 'sigma': 30},
        'short_term': {'mu': 14, 'sigma': 5}
    }
}
```

---

## 4. Consolidation Rules

### 4.1 Consolidation Triggers

Memories should consolidate from working/short-term to long-term storage when:

| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Retrieval Count** | ≥ 3 successful retrievals | Promote to long-term |
| **Connection Formation** | ≥ 2 meaningful connections | Increase stability |
| **Time Survival** | Survives 7 days with PS > 0.3 | Mark as consolidated |
| **User Reinforcement** | Explicit confirmation | Immediate consolidation |
| **Goal Achievement** | Memory contributed to goal completion | High-priority consolidation |

### 4.2 Consolidation Process

```
1. SELECTION: Score all working memories by PS
2. FILTER: Select memories where PS > consolidation_threshold (default: 0.4)
3. INTEGRATE:
   a. Extract semantic relationships
   b. Link to existing knowledge graph nodes
   c. Update affected nodes' connection density
4. COMPRESS:
   a. Merge similar episodic memories into summaries
   b. Abstract patterns from repeated experiences
5. STORE:
   a. Update long-term memory store
   b. Set initial stability based on consolidation strength
```

### 4.3 Background Consolidation (Sleep-Inspired)

Run periodic consolidation jobs:

```
CONSOLIDATION_SCHEDULE:
  - Frequency: Every 6 hours (or after significant activity bursts)
  - Duration: Limited processing time budget

CONSOLIDATION_ACTIONS:
  1. Replay recent episodes, strengthening connections used
  2. Identify pattern repetitions across episodes
  3. Create/update summary nodes for repeated patterns
  4. Prune connections below strength threshold
  5. Update connection density scores for affected nodes
```

---

## 5. Forgetting Rules

### 5.1 Forgetting Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| **Strength Below Threshold** | S(t) < 0.1 | Queue for deletion |
| **No Access Timeout** | No access for 90 days AND PS < 0.3 | Queue for deletion |
| **Contradiction Resolution** | Superseded by newer, verified information | Mark as historical |
| **Explicit Removal** | User requests removal | Immediate deletion |
| **Storage Pressure** | Memory usage > threshold | Evict lowest PS memories |

### 5.2 Forgetting Priority Queue

When storage pressure requires forgetting:

```
Priority for deletion (highest first):
1. Memories with S(t) < 0.1
2. Zero connection density memories older than 30 days
3. Superseded/contradicted memories (unless historically valuable)
4. Low PS memories exceeding age threshold
5. High-volume episodic details (keep summaries)

Protected from deletion:
- User-pinned memories (I = 1.0)
- System-critical information
- Memories with I > 0.8
- Recently created memories (< 7 days old)
```

### 5.3 Graceful Degradation vs Hard Deletion

Instead of binary deletion, implement tiered degradation:

| Level | State | Access | Storage |
|-------|-------|--------|---------|
| **Active** | Full detail | Instant retrieval | Full storage |
| **Archived** | Full detail | Slower retrieval | Compressed storage |
| **Summarized** | Key points only | Retrieval with note | Minimal storage |
| **Tombstone** | Existence marker | Indicates "was known" | Negligible |
| **Deleted** | Gone | None | None |

**Transition Rules**:
```
Active → Archived: S(t) < 0.3 for 7 days
Archived → Summarized: S(t) < 0.15 for 30 days OR storage pressure
Summarized → Tombstone: S(t) < 0.05 for 90 days
Tombstone → Deleted: S(t) = 0 for 180 days OR explicit deletion
```

---

## 6. Spaced Repetition for Memory Maintenance

### 6.1 Retrieval Strengthening

Each successful retrieval resets decay and increases stability:

```
On successful retrieval:
  S = min(1.0, S + Δ)  # Strength boost
  τ = τ × (1 + boost_factor)  # Slower future decay

Where:
  Δ = Base boost (default: 0.15)
  boost_factor = 0.2 (cumulative with diminishing returns)
```

### 6.2 Optimal Review Intervals

Based on expanded spaced repetition principles:

```
Interval sequence (days):
  1 → 3 → 7 → 14 → 30 → 60 → 120 → 365

For important memories not naturally accessed:
  - System can proactively surface for "review"
  - Or include in periodic consolidation process
```

---

## 7. Special Cases

### 7.1 Contradiction-Triggered Updates

When new information contradicts existing memory:

```
IF contradiction_detected:
    IF new_confidence > old_confidence:
        old_memory.status = "superseded"
        old_memory.superseded_by = new_memory.id
        old_memory.S = old_memory.S × 0.5
    ELSE:
        new_memory.status = "contested"
        new_memory.conflicts_with = old_memory.id
        # Hold for resolution
```

### 7.2 Synaptic Tag-and-Capture (Proximity Rescue)

**Principle**: Weak memories can be strengthened if they occur near salient events.

```
When HIGH_SALIENCE event occurs:
    time_window = 2 hours (before and after)
    nearby_memories = get_memories_in_window(time_window)

    FOR memory IN nearby_memories:
        IF memory.PS < 0.5:
            # Rescue weak memories near important events
            memory.PS = memory.PS × (1 + proximity_boost)
            # proximity_boost decreases with temporal distance
```

### 7.3 Category-Selective Persistence

Different memory categories have different baseline decay rates:

```python
CATEGORY_DECAY_MULTIPLIERS = {
    'user_preference': 0.1,      # Very slow decay
    'user_identity': 0.05,       # Almost no decay
    'task_procedure': 0.5,       # Moderate decay
    'conversation_detail': 2.0,  # Fast decay
    'error_correction': 0.3,     # Slow decay (learn from mistakes)
    'goal_progress': 0.4,        # Moderate-slow decay
    'external_fact': 1.0,        # Standard decay
}

effective_decay = base_decay × category_multiplier
```

---

## 8. Implementation Recommendations

### 8.1 Required Data Fields

Each memory node should track:

```typescript
interface MemoryNode {
    id: string;
    content: any;

    // Temporal tracking
    created_at: timestamp;
    last_accessed: timestamp;
    access_count: number;

    // Persistence factors
    frequency_score: number;         // F
    salience_score: number;          // E
    connection_density: number;      // C
    recency_score: number;           // R (computed)
    importance_marker: number;       // I
    persistence_score: number;       // PS (computed)

    // Decay tracking
    current_strength: number;        // S(t)
    initial_strength: number;        // S₀
    decay_function: 'exponential' | 'linear' | 'gaussian';
    decay_params: object;

    // State management
    status: 'active' | 'archived' | 'summarized' | 'tombstone';
    category: string;
    pinned: boolean;

    // Relationship tracking
    superseded_by?: string;
    supersedes?: string[];
}
```

### 8.2 Periodic Maintenance Jobs

```
MAINTENANCE_SCHEDULE:
  1. [Every 1 hour] Update recency scores for recently accessed
  2. [Every 6 hours] Run consolidation process
  3. [Every 24 hours] Recalculate connection density scores
  4. [Every 24 hours] Decay strength values
  5. [Every 7 days] Run forgetting queue processor
  6. [Every 30 days] Archive/summarize low-strength memories
```

### 8.3 Key Thresholds (Configurable)

```python
THRESHOLDS = {
    'consolidation_ps_min': 0.4,      # Min PS to consolidate
    'forgetting_strength_min': 0.1,   # Below this = queue for deletion
    'archive_strength': 0.3,          # Below this = archive
    'summarize_strength': 0.15,       # Below this = summarize
    'tombstone_strength': 0.05,       # Below this = tombstone
    'no_access_timeout_days': 90,     # Days without access
    'protected_age_days': 7,          # New memories protected
    'proximity_window_hours': 2,      # Tag-and-capture window
}
```

---

## 9. Testing and Validation

### 9.1 Metrics to Monitor

| Metric | Target | Description |
|--------|--------|-------------|
| Memory Growth Rate | < 5% daily | Forgetting keeping pace with creation |
| Retrieval Success Rate | > 80% | Important memories being retained |
| False Positive Forgetting | < 5% | Rarely need to recreate deleted memories |
| Storage Efficiency | > 70% active | Most storage is active memories |
| Contradiction Resolution Time | < 24 hours | Conflicts resolved promptly |

### 9.2 Validation Approaches

1. **Retrospective Analysis**: Review deleted memories, check if later recreated
2. **User Satisfaction Surveys**: Does the system remember what users expect?
3. **A/B Testing**: Compare decay rates against memory usefulness
4. **Synthetic Load Testing**: Simulate long-term usage patterns

---

## 10. Sources and References

### Cognitive Science Foundations
- [The Biology of Forgetting - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5657245/) - Active forgetting mechanisms
- [Memory Consolidation - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4526749/) - Two-stage consolidation
- [Ebbinghaus' Forgetting Curve Replication](https://pmc.ncbi.nlm.nih.gov/articles/PMC4492928/) - Mathematical models
- [Synaptic Tag and Capture](https://pmc.ncbi.nlm.nih.gov/articles/PMC9378568/) - Proximity-based memory rescue
- [Emotional Salience and Memory](https://pmc.ncbi.nlm.nih.gov/articles/PMC11295988/) - How emotion affects retention

### AI Memory Systems
- [Forgetting and Aging Strategies in AI Memory](https://dev.to/rijultp/forgetting-and-aging-strategies-in-ai-memory-jin) - Practical AI approaches
- [Memory in AI: Taxonomy and Operations](https://arxiv.org/html/2505.00675v2) - Comprehensive survey
- [Qdrant Decay Functions](https://qdrant.tech/blog/decay-functions/) - Mathematical decay implementations
- [IBM: AI Agent Memory](https://www.ibm.com/think/topics/ai-agent-memory) - Industry perspective

### Memory Retention and Learning
- [Forgetting Curve - Wikipedia](https://en.wikipedia.org/wiki/Forgetting_curve) - Overview and formulas
- [Memory Retention - ScienceDirect](https://www.sciencedirect.com/topics/psychology/memory-retention) - Psychological factors
- [Memory Encoding, Storage, Retrieval - Noba](https://nobaproject.com/modules/memory-encoding-storage-retrieval) - Comprehensive overview
