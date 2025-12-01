# Forgetting Strategies and Memory Decay Models
## Comprehensive Research for AI Agent Memory Systems

**Research Date:** January 2025
**Purpose:** Analyze cognitive science and AI approaches to forgetting, memory decay, importance scoring, and consolidation for Visioneer memory system improvements

---

## Executive Summary

This research synthesizes findings from cognitive science (Ebbinghaus curves, interference theory, memory consolidation) and AI systems (selective forgetting, importance scoring, memory tiering) to provide actionable recommendations for implementing intelligent forgetting in AI agent memory. The core insight is that **forgetting is not a failure mode but a critical feature** that enables efficiency, relevance, and focus.

---

## 1. Cognitive Science Foundations

### 1.1 The Ebbinghaus Forgetting Curve

Hermann Ebbinghaus (1885) established the foundational mathematical model of memory decay:

```
R(t) = e^(-t/S)

Where:
  R = Retrievability (probability of recall, 0-1)
  t = Time since learning
  S = Memory stability/strength (higher = slower decay)
```

**Key Findings:**
- ~70% of information forgotten within 24 hours without reinforcement
- ~90% forgotten within a week without active retention effort
- Decay is steepest immediately after learning, then levels off
- The forgetting rate is relatively consistent across individuals

**Factors Affecting Decay Rate:**
| Factor | Effect on Decay |
|--------|----------------|
| Difficulty of material | Harder material decays faster |
| Emotional salience | Emotional memories decay slower |
| Repetition/review | Each review increases stability |
| Sleep quality | Poor sleep accelerates decay |
| Stress levels | High stress accelerates decay |
| Encoding depth | Deeper processing = slower decay |

### 1.2 Power Law of Forgetting (Long-Term)

For long-term memory, the power law model is more empirically accurate:

```
Q(t) = (1 + μt)^(-a)

Where:
  Q = Retention probability
  μ = Time scaling factor
  a = Decay exponent (typically 0.2-0.5)
```

**Key Insight:** Older memories that survive initial decay become proportionally more stable. Survival probability increases with age - memories that persist for years are unlikely to be forgotten.

### 1.3 Interference Theory

Forgetting is not just about decay - **interference** from other memories plays a critical role:

#### Proactive Interference
- **Definition:** Old memories interfere with retrieval of new memories
- **Example:** Old passwords interfering with new password recall
- **Less common** but occurs during post-learning retention

#### Retroactive Interference
- **Definition:** New memories interfere with retrieval of old memories
- **Example:** Learning new phone number makes old one harder to recall
- **Primary cause** of everyday forgetting
- **Greater similarity** between memories = more interference

**Mitigation Strategies:**
1. **Spacing:** Distribute learning over time
2. **Distinctiveness:** Encode information uniquely
3. **Organization:** Use meaningful associations
4. **Context separation:** Encode in different contexts

### 1.4 Memory Consolidation During Sleep

The brain uses sleep for active memory management:

**Systems Consolidation Process:**
1. Hippocampus rapidly encodes new experiences
2. During slow-wave sleep (SWS), memories are "replayed"
3. Key information transfers to neocortex for long-term storage
4. Details fade while gist/schema information is preserved
5. Memories become increasingly schema-based over time

**Key Insight for AI:** Periodic "offline" consolidation processes should:
- Extract gist from episodic memories
- Transform specific experiences into general knowledge
- Strengthen connections between related memories
- Prune weak or redundant connections

---

## 2. AI Memory Forgetting Strategies

### 2.1 The Case for Strategic Forgetting

**Why Perfect Memory is Problematic:**
- Information overload: Everything remembered equally = nothing stands out
- Performance degradation: Unlimited retention causes slower processing
- Relevance decay: Old information clutters retrieval results
- Context pollution: Outdated data influences current decisions

> "The greatest challenge for AI memory systems isn't remembering everything — it's forgetting selectively while maintaining focus on what's important and relevant."

### 2.2 Five Primary Forgetting Strategies

#### Strategy 1: Time-Based Decay (Timestamp Decay)
```python
def time_decay(strength, time_elapsed, decay_rate=0.05):
    """Exponential decay based on time since last access"""
    return strength * math.exp(-decay_rate * time_elapsed)
```

**Characteristics:**
- Memory importance fades naturally over time
- Older memories automatically lose relevance
- Refreshing a memory resets the decay clock
- Simple to implement and understand

**Best For:** General-purpose aging of all memories

#### Strategy 2: Least Recently Used (LRU)
```python
def lru_eviction(memory_store, max_capacity):
    """Remove least recently accessed memories when capacity exceeded"""
    if len(memory_store) > max_capacity:
        sorted_by_access = sorted(memory_store, key=lambda m: m.last_accessed)
        return sorted_by_access[:-max_capacity]  # Remove oldest accessed
```

**Characteristics:**
- Similar to browser/CPU cache management
- Memories unused for extended periods become removal candidates
- Works well under fixed storage constraints
- Doesn't consider semantic importance

**Best For:** Systems with hard memory limits

#### Strategy 3: Importance/Relevance Scoring
```python
def importance_score(memory):
    """Calculate composite importance score"""
    return (
        0.25 * memory.access_frequency +
        0.30 * memory.semantic_relevance +
        0.20 * memory.recency_score +
        0.15 * memory.user_importance +
        0.10 * memory.connection_density
    )
```

**Characteristics:**
- Each memory scored by multiple factors
- Lowest-scoring memories deleted first when capacity fills
- Preserves most important knowledge
- Requires careful factor weighting

**Best For:** Intelligent selective retention

#### Strategy 4: Sliding Window (Fixed-Length Queue)
```python
def sliding_window(memory_store, window_size):
    """Maintain only N most recent items"""
    return memory_store[-window_size:]  # Keep most recent
```

**Characteristics:**
- Simple rolling-log format
- Automatic discarding of older items
- Fixed memory footprint
- Predictable performance

**Best For:** Conversation history, event logs

#### Strategy 5: Summarization/Compression
```python
def compress_memories(episodic_memories, threshold=10):
    """Convert detailed memories to compressed summaries"""
    if len(episodic_memories) > threshold:
        summary = generate_gist(episodic_memories)
        return summary  # Replace details with summary
    return episodic_memories
```

**Characteristics:**
- Raw details converted to compressed summaries
- Essential knowledge preserved, specifics dropped
- Mimics human gist extraction
- Requires LLM for quality summarization

**Best For:** Long-term retention of episode patterns

### 2.3 Advanced Forgetting Mechanisms

#### Lifespan-Based Decay (Memoria System)
Each memory has a predetermined lifespan that constantly decreases:

```python
class Memory:
    def __init__(self, content, initial_lifespan=100):
        self.content = content
        self.lifespan = initial_lifespan

    def tick(self):
        """Called each timestep"""
        self.lifespan -= 1
        return self.lifespan > 0

    def on_retrieval(self, contribution_score):
        """Extend lifespan based on usefulness"""
        self.lifespan += contribution_score * 10
```

**Key Insight:** Only retrieved memories survive - "forgotten useless and unemployed memories while preserving important ones."

#### Accumulated Attention Scores with Forgetting Factor (A2SF)
For transformer-based systems:

```
score(t) = sum(attention_weights[0:t]) * forgetting_factor^(current_t - t)
```

- Past attention scores are multiplied by forgetting factor repeatedly
- Older tokens receive greater penalty
- Provides fairness among tokens of different ages
- Effective for selecting important tokens in KV cache

---

## 3. Importance Scoring Algorithms

### 3.1 Multi-Factor Scoring Model

Modern AI memory systems use weighted combinations of factors:

#### Recency Score
```python
def recency_score(time_since_access, half_life_days=30):
    """Exponential decay based on time since last access"""
    return math.exp(-time_since_access / half_life_days)
```

| Days Since Access | Score |
|-------------------|-------|
| 0 | 1.00 |
| 7 | 0.79 |
| 30 | 0.37 |
| 60 | 0.14 |
| 90 | 0.05 |

#### Frequency Score
```python
def frequency_score(access_count, k=0.3):
    """Saturating function based on access count"""
    return 1 - math.exp(-k * access_count)
```

| Access Count | Score |
|--------------|-------|
| 1 | 0.26 |
| 3 | 0.59 |
| 5 | 0.78 |
| 10 | 0.95 |

#### Relevance Score
```python
def relevance_score(memory_embedding, query_embedding):
    """Cosine similarity between memory and current context"""
    return cosine_similarity(memory_embedding, query_embedding)
```

#### Importance Score (LLM-Judged)
```python
def importance_score(memory, llm):
    """LLM determines subjective significance"""
    prompt = f"Rate the importance of this memory (0-1): {memory.content}"
    return llm.generate(prompt)
```

### 3.2 Dynamic Weight Learning

Advanced systems like Mix-of-Experts learn optimal weights:

```python
class MemoryRetriever:
    def __init__(self):
        self.recency_weight = nn.Parameter(torch.tensor(0.25))
        self.relevance_weight = nn.Parameter(torch.tensor(0.50))
        self.importance_weight = nn.Parameter(torch.tensor(0.25))

    def score(self, memory, context):
        return (
            self.recency_weight * memory.recency_score +
            self.relevance_weight * memory.relevance_score(context) +
            self.importance_weight * memory.importance_score
        )
```

**Benefits of learned weights:**
- Adapt to specific use cases
- Balance factors based on empirical performance
- Handle context-dependent importance

### 3.3 Connection Density / Graph Centrality

Memories with more connections are harder to forget:

```python
def connection_score(memory, graph):
    """Score based on graph centrality"""
    degree = graph.degree(memory.id)
    pagerank = graph.pagerank(memory.id)
    betweenness = graph.betweenness(memory.id)

    return 0.4 * normalize(degree) + 0.4 * pagerank + 0.2 * betweenness
```

| Centrality Type | Meaning |
|-----------------|---------|
| Degree | Direct connections (immediate relevance) |
| PageRank | Importance through recursive connections |
| Betweenness | Bridge between memory clusters |

---

## 4. Memory Tiering Architecture

### 4.1 Hot/Warm/Cold Classification

Inspired by data storage systems, AI memory can use tiered architecture:

| Tier | Access Pattern | Storage | Retrieval Speed |
|------|---------------|---------|-----------------|
| **Hot** | Frequent, real-time | Fast memory/cache | Instant |
| **Warm** | Regular but not constant | Standard storage | Fast |
| **Cold** | Rarely accessed | Compressed/archived | Slower |

### 4.2 Dynamic Data Movement

```python
class TieredMemory:
    def __init__(self):
        self.hot = {}    # Active working memory
        self.warm = {}   # Recent long-term
        self.cold = {}   # Archived

    def promote(self, memory_id):
        """Move memory to hotter tier on access"""
        if memory_id in self.cold:
            self.warm[memory_id] = self.cold.pop(memory_id)
        elif memory_id in self.warm:
            self.hot[memory_id] = self.warm.pop(memory_id)

    def demote(self, memory_id, time_inactive):
        """Move memory to colder tier after inactivity"""
        if time_inactive > 30 and memory_id in self.hot:
            self.warm[memory_id] = self.hot.pop(memory_id)
        elif time_inactive > 90 and memory_id in self.warm:
            self.cold[memory_id] = self.warm.pop(memory_id)
```

### 4.3 Graceful Degradation States

Instead of binary deletion, implement tiered degradation:

| State | Content | Access | Storage |
|-------|---------|--------|---------|
| **Active** | Full detail | Instant | Full |
| **Archived** | Full detail | Slower | Compressed |
| **Summarized** | Key points | With note | Minimal |
| **Tombstone** | "Was known" marker | Indicator only | Negligible |
| **Deleted** | None | None | None |

---

## 5. Spaced Repetition and Reinforcement

### 5.1 The FSRS Algorithm (State-of-the-Art)

The Free Spaced Repetition Scheduler models memory through three components:

**Retrievability (R):** Probability of recall at a given moment
```
R(t,S) = (1 + factor * t/S)^(-w20)
```

**Stability (S):** Time for R to decrease from 100% to 90%
```
S_new = S_old * e^(w17 * (grade - 3 + w18)) * S^(-w19)
```

**Difficulty (D):** Inherent complexity affecting stability gains

**Key FSRS Principles:**
1. Memory follows exponential forgetting: R(t) = 2^(-t/S)
2. Difficult material = lower stability increases
3. Higher current stability = smaller future gains (diminishing returns)
4. Lower retrievability at review = higher stability boost (desirable difficulty)

### 5.2 Retrieval Strengthening in AI Systems

```python
def on_successful_retrieval(memory):
    """Strengthen memory on successful use"""
    memory.strength = min(1.0, memory.strength + 0.15)
    memory.stability *= 1.2  # Slower future decay
    memory.last_accessed = now()
    memory.access_count += 1
```

### 5.3 Optimal Review Intervals

Based on spaced repetition research:

```
Interval sequence (days): 1 → 3 → 7 → 14 → 30 → 60 → 120 → 365
```

For AI systems, this translates to:
- Frequently accessed memories get reinforced naturally
- Important but rarely accessed memories may need proactive surfacing
- Usage patterns should inform consolidation decisions

---

## 6. Preventing Catastrophic Forgetting

### 6.1 Elastic Weight Consolidation (EWC)

For neural network-based memory systems:

```python
def ewc_loss(model, task_params, fisher_matrix, lambda_ewc=0.5):
    """Penalize changes to important weights"""
    ewc_loss = 0
    for name, param in model.named_parameters():
        if name in fisher_matrix:
            ewc_loss += (fisher_matrix[name] *
                        (param - task_params[name])**2).sum()
    return lambda_ewc * ewc_loss
```

**Key Idea:** Protect weights important for previous tasks while learning new ones.

### 6.2 Replay-Based Methods

```python
class ReplayBuffer:
    def __init__(self, capacity=1000):
        self.buffer = []
        self.capacity = capacity

    def add(self, experience):
        if len(self.buffer) >= self.capacity:
            self.buffer.pop(0)  # Remove oldest
        self.buffer.append(experience)

    def sample(self, batch_size):
        """Sample from past experiences for replay"""
        return random.sample(self.buffer, min(batch_size, len(self.buffer)))
```

---

## 7. Consolidation Strategies

### 7.1 Gist Extraction

Human memory consolidation extracts "gist" - the essential meaning:

```python
def extract_gist(episodic_memories, llm):
    """Extract common patterns and essential meaning"""
    prompt = f"""
    Analyze these related memories and extract:
    1. Common patterns or themes
    2. Key facts that appear repeatedly
    3. Essential meaning (gist) that should be preserved

    Memories: {episodic_memories}
    """
    return llm.generate(prompt)
```

### 7.2 Background Consolidation Process

```python
def consolidation_job():
    """Periodic background consolidation (like sleep)"""

    # 1. Select candidates for consolidation
    candidates = get_memories_above_threshold(threshold=0.4)

    # 2. Extract patterns from episodic clusters
    clusters = cluster_by_similarity(candidates)
    for cluster in clusters:
        if len(cluster) > 3:
            gist = extract_gist(cluster)
            create_semantic_memory(gist)

    # 3. Strengthen frequently co-accessed memories
    strengthen_co_occurring_connections()

    # 4. Prune weak connections
    prune_connections_below_threshold(threshold=0.1)

    # 5. Decay all memory strengths
    apply_time_decay_to_all()
```

### 7.3 Consolidation Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| Retrieval threshold | ≥3 successful retrievals | Promote to long-term |
| Connection formation | ≥2 meaningful connections | Increase stability |
| Time survival | Survives 7 days, PS > 0.3 | Mark as consolidated |
| User reinforcement | Explicit confirmation | Immediate consolidation |
| Goal achievement | Contributed to goal | High-priority consolidation |

---

## 8. What Should Persist vs. Fade

### 8.1 Persistence Criteria

**Should Persist (High Decay Resistance):**
| Category | Rationale | Decay Multiplier |
|----------|-----------|-----------------|
| User identity | Core to personalization | 0.05x |
| User preferences | Guide all interactions | 0.1x |
| Error corrections | Prevents repeated mistakes | 0.3x |
| Goal-related | Active task relevance | 0.4x |
| Frequently accessed | Demonstrated importance | Based on frequency |
| Highly connected | Central to knowledge graph | Based on centrality |
| User-pinned | Explicit importance | 0x (no decay) |

**Should Fade (High Decay Rate):**
| Category | Rationale | Decay Multiplier |
|----------|-----------|-----------------|
| Conversation details | Temporary context | 2.0x |
| One-time events | Low reuse probability | 1.5x |
| Superseded information | Replaced by newer | 3.0x |
| Zero-connection memories | Isolated, unused | 2.0x |
| Failed retrievals | Not successfully used | 1.5x |

### 8.2 Protection Rules

```python
PROTECTED_CATEGORIES = {
    'user_identity',
    'user_preferences',
    'system_critical',
    'user_pinned',
    'active_goals'
}

def is_protected(memory):
    """Check if memory should be protected from forgetting"""
    if memory.category in PROTECTED_CATEGORIES:
        return True
    if memory.importance_marker >= 0.8:
        return True
    if memory.age_days < 7:  # Recently created
        return True
    return False
```

---

## 9. KV Cache Eviction (Transformer-Specific)

### 9.1 The Challenge

KV cache grows linearly with sequence length, creating memory bottlenecks. Naive eviction can cause:
- Loss of system prompt memory (safety risks)
- Hallucinations
- Context discontinuity

### 9.2 Eviction Strategies

**StreamingLLM Approach:**
- Preserves "attention sink" tokens (initial tokens receiving disproportionate attention)
- Combines with recent context window
- Maintains model stability

**NACL Framework:**
- Combines attention-based selection with random eviction
- Reduces attention bias
- Maintains pivotal tokens
- Achieves 50% cache reduction with 95% performance

**Attention-Gate:**
- Dynamic token importance identification
- Context-aware eviction decisions
- Integrates with pre-trained models

### 9.3 Key Insight

> "Not all cached tokens contribute equally to downstream predictions. Methods leverage attention-based scoring, temporal locality, redundancy analysis, or future usage forecasts to guide retention decisions."

---

## 10. Recommendations for Visioneer

### 10.1 Core Architecture

1. **Implement Three-Tier Memory:**
   - Hot: Current session context (immediate access)
   - Warm: Recent long-term memories (fast retrieval)
   - Cold: Archived/summarized (compressed storage)

2. **Multi-Factor Importance Scoring:**
   ```python
   PS = 0.25*frequency + 0.20*salience + 0.25*connections +
        0.15*recency + 0.15*explicit_importance
   ```

3. **Graduated Forgetting:**
   - Active → Archived → Summarized → Tombstone → Deleted
   - Not binary deletion but graceful degradation

### 10.2 Decay Functions by Memory Type

| Memory Type | Function | Parameters |
|-------------|----------|------------|
| Episodic | Exponential | λ = 0.01-0.15 based on importance |
| Semantic | Linear | k = 0.001-0.05 based on volatility |
| Procedural | Gaussian | μ = expected lifespan, σ = decay steepness |
| Preferences | None/Minimal | Protected category |

### 10.3 Consolidation Schedule

```
Every 1 hour: Update recency scores
Every 6 hours: Run consolidation process
Every 24 hours: Recalculate connection density
Every 24 hours: Apply decay to all memories
Every 7 days: Process forgetting queue
Every 30 days: Archive/summarize low-strength memories
```

### 10.4 Key Thresholds

```python
THRESHOLDS = {
    'consolidation_min': 0.4,      # Min PS to consolidate
    'archive_threshold': 0.3,      # Below = archive
    'summarize_threshold': 0.15,   # Below = summarize
    'tombstone_threshold': 0.05,   # Below = tombstone
    'delete_threshold': 0.0,       # At zero for 180 days
    'no_access_timeout': 90,       # Days without access
    'protection_age': 7,           # New memories protected
}
```

---

## 11. Sources and References

### Cognitive Science
- [Ebbinghaus Forgetting Curve - Wikipedia](https://en.wikipedia.org/wiki/Forgetting_curve)
- [Interference Theory - Wikipedia](https://en.wikipedia.org/wiki/Interference_theory)
- [Proactive & Retroactive Interference - Simply Psychology](https://www.simplypsychology.org/proactive-and-retroactive-interference.html)
- [Sleep's Role in Memory - Yale School of Medicine](https://medicine.yale.edu/news-article/sleeps-crucial-role-in-preserving-memory/)
- [Memory Consolidation During Sleep - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3278619/)
- [Gist Memory and Consolidation - eLife](https://elifesciences.org/articles/65588)

### AI Memory Systems
- [Forgetting and Aging Strategies in AI Memory - DEV](https://dev.to/rijultp/forgetting-and-aging-strategies-in-ai-memory-jin)
- [Forgetting in Machine Learning Survey - arXiv](https://arxiv.org/html/2405.20620v1)
- [MemoryBank: LLMs with Long-Term Memory - arXiv](https://arxiv.org/abs/2305.10250)
- [Memoria: Human-Inspired Memory Architecture - arXiv](https://arxiv.org/html/2310.03052v3)
- [Cognitive Memory in LLMs - arXiv](https://arxiv.org/html/2504.02441v1)

### Spaced Repetition
- [FSRS Algorithm Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)
- [FSRS Technical Explanation](https://expertium.github.io/Algorithm.html)
- [Spaced Repetition Optimization - PNAS](https://pmc.ncbi.nlm.nih.gov/articles/PMC6410796/)

### Continual Learning
- [Elastic Weight Consolidation - PNAS](https://www.pnas.org/doi/10.1073/pnas.1611835114)
- [Catastrophic Forgetting - Wikipedia](https://en.wikipedia.org/wiki/Catastrophic_interference)
- [Controlled Forgetting Challenge - Unite.AI](https://www.unite.ai/controlled-forgetting-the-next-big-challenge-in-ais-memory/)

### Memory Tiering
- [KV Cache Eviction Survey - arXiv](https://arxiv.org/html/2412.19442v3)
- [Memory Tiering Systems - arXiv](https://arxiv.org/html/2508.04417v1)
- [Data Tiering for Hot/Cold Data - Apache Doris](https://doris.apache.org/blog/Tiered-Storage-for-Hot-and-Cold-Data-What-Why-and-How/)

### Implementation References
- [Memory Mechanisms in LLM Agents - Emergent Mind](https://www.emergentmind.com/topics/memory-mechanisms-in-llm-based-agents)
- [AWS AgentCore Long-Term Memory](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive/)
- [Mem0 AI Memory Layer](https://mem0.ai/blog/introducing-mem0/)
