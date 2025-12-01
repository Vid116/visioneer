# Visioneer Memory System: Forgetting Policies
## Concrete Implementation Specification

**Version:** 1.0
**Date:** January 2025
**Purpose:** Define actionable forgetting policies including memory classification, decay mechanisms, promotion criteria, and consolidation triggers for Visioneer's memory system.

---

## Executive Summary

This document specifies concrete forgetting policies for Visioneer's memory system based on synthesized research from cognitive science and AI memory systems. The core principle is that **forgetting is a critical feature, not a failure mode** - it maintains system efficiency, relevance, and focus.

**Key Policy Decisions:**
1. Memory types classified by decay profile (ephemeral, decaying, persistent, immutable)
2. Five-tier storage hierarchy with graceful degradation
3. Multi-factor persistence scoring determining retention priority
4. Consolidation triggers for working-to-long-term memory promotion
5. Scheduled background processes for maintenance

---

## 1. Memory Type Classification

### 1.1 Classification Schema

All memories are classified into four decay profiles based on their nature:

| Classification | Description | Base Decay Rate | Examples |
|----------------|-------------|-----------------|----------|
| **Ephemeral** | Temporary context, expected to fade rapidly | Very High (λ=0.3) | Session context, intermediate reasoning steps, scratch calculations |
| **Decaying** | Standard information with natural relevance decay | Medium (λ=0.05-0.1) | Conversation details, time-bound facts, task context |
| **Persistent** | Important knowledge that should resist decay | Low (λ=0.01-0.02) | Learned procedures, validated facts, user preferences |
| **Immutable** | Core information that must never decay | None (λ=0) | User identity, core goals, system constraints, pinned memories |

### 1.2 Memory Type Definitions

#### Ephemeral Memory (Should Decay Rapidly)

```typescript
interface EphemeralMemory {
  type: 'ephemeral';
  max_lifespan_hours: 24;
  decay_rate: 0.3;  // High decay - ~50% strength in 2 hours

  subtypes: [
    'session_context',      // Current session working memory
    'intermediate_steps',   // Reasoning chain steps
    'temporary_calculations', // Scratch work
    'exploration_context',  // Search/browse context
    'failed_attempts'       // Approaches that didn't work
  ];
}
```

**Policy:** Automatically purge after 24 hours unless promoted by explicit action or retrieval.

#### Decaying Memory (Standard Decay)

```typescript
interface DecayingMemory {
  type: 'decaying';
  default_lifespan_days: 30-90;
  decay_rate: 0.05-0.1;  // Medium decay

  subtypes: [
    'conversation_content',   // What was discussed
    'task_details',          // Specific task parameters
    'time_sensitive_facts',  // Information with expiry
    'external_data',         // Fetched information
    'procedural_steps'       // How specific tasks were done
  ];
}
```

**Policy:** Standard decay with opportunity for reinforcement through retrieval and use.

#### Persistent Memory (Slow Decay/Protected)

```typescript
interface PersistentMemory {
  type: 'persistent';
  min_lifespan_days: 365;
  decay_rate: 0.01-0.02;  // Very slow decay

  subtypes: [
    'validated_knowledge',    // Confirmed correct facts
    'learned_procedures',     // Successful approaches
    'user_preferences',       // Expressed preferences
    'error_corrections',      // Mistakes learned from
    'goal_related',          // Connected to user goals
    'high_connection_density' // Central knowledge graph nodes
  ];
}
```

**Policy:** Protected from normal decay; requires explicit deprecation or contradiction to remove.

#### Immutable Memory (No Decay)

```typescript
interface ImmutableMemory {
  type: 'immutable';
  lifespan: 'forever';
  decay_rate: 0;

  subtypes: [
    'user_identity',         // Core user information
    'core_goals',           // Fundamental objectives
    'system_constraints',    // Safety and behavioral rules
    'user_pinned',          // Explicitly marked "never forget"
    'critical_corrections'   // Safety-critical error fixes
  ];
}
```

**Policy:** Never automatically deleted; requires explicit user action to modify.

---

## 2. Decay Functions

### 2.1 Decay Function by Memory Type

| Memory Type | Function | Formula | Parameters |
|-------------|----------|---------|------------|
| Ephemeral | Exponential (steep) | S(t) = S₀ × e^(-0.3t) | t in hours |
| Decaying | Exponential (moderate) | S(t) = S₀ × e^(-λt) | λ = 0.05-0.1, t in days |
| Persistent | Power Law | S(t) = S₀ × (1 + 0.01t)^(-0.3) | t in days |
| Immutable | None | S(t) = S₀ | No decay |

### 2.2 Decay Rate Modifiers

Base decay rates are modified by these factors:

```python
def effective_decay_rate(memory, base_rate):
    """Calculate actual decay rate with modifiers"""
    modifier = 1.0

    # Reduce decay for frequently accessed
    if memory.access_count > 5:
        modifier *= 0.7

    # Reduce decay for highly connected
    if memory.connection_count > 3:
        modifier *= 0.8

    # Reduce decay for goal-related
    if memory.tags.contains('goal_related'):
        modifier *= 0.6

    # Increase decay for superseded info
    if memory.superseded_by is not None:
        modifier *= 2.5

    # Increase decay for isolated memories
    if memory.connection_count == 0 and memory.age_days > 7:
        modifier *= 1.5

    return base_rate * modifier
```

### 2.3 Category-Specific Decay Multipliers

```python
CATEGORY_DECAY_MULTIPLIERS = {
    # Slow decay (multiply base rate by these values)
    'user_identity': 0.0,         # No decay
    'user_preferences': 0.1,      # 10x slower
    'error_corrections': 0.3,     # 3x slower
    'goal_progress': 0.4,         # 2.5x slower

    # Standard decay
    'external_facts': 1.0,        # Base rate
    'procedural_knowledge': 0.8,  # Slightly slower

    # Fast decay (multiply base rate by these values)
    'conversation_details': 1.5,  # 1.5x faster
    'session_context': 2.0,       # 2x faster
    'superseded_info': 3.0,       # 3x faster
    'failed_retrievals': 1.5,     # 1.5x faster
}
```

---

## 3. Persistence Scoring Model

### 3.1 Persistence Score Calculation

Every memory has a Persistence Score (PS) that determines retention priority:

```python
def calculate_persistence_score(memory):
    """
    PS = w₁·F + w₂·S + w₃·C + w₄·R + w₅·I

    Returns value between 0 and 1
    """
    F = frequency_score(memory.access_count)        # 0-1
    S = salience_score(memory)                       # 0-1
    C = connection_density_score(memory)             # 0-1
    R = recency_score(memory.last_accessed)          # 0-1
    I = importance_marker(memory)                    # 0-1

    # Default weights (configurable)
    w1, w2, w3, w4, w5 = 0.25, 0.20, 0.25, 0.15, 0.15

    return w1*F + w2*S + w3*C + w4*R + w5*I
```

### 3.2 Factor Calculations

```python
def frequency_score(access_count, k=0.3):
    """Saturating function - diminishing returns"""
    return 1 - math.exp(-k * access_count)
    # 0 accesses = 0.00
    # 3 accesses = 0.59
    # 5 accesses = 0.78
    # 10 accesses = 0.95

def salience_score(memory):
    """Proxy for emotional significance"""
    score = 0.0
    if memory.has_user_feedback:
        score += 0.3
    if memory.is_error_correction:
        score += 0.2
    if memory.is_preference:
        score += 0.25
    if memory.extended_discussion:
        score += 0.15
    if memory.goal_related:
        score += 0.1
    return min(1.0, score)

def connection_density_score(memory, graph):
    """Based on graph centrality"""
    degree = graph.degree(memory.id)
    max_degree = graph.max_degree()
    pagerank = graph.pagerank(memory.id)

    return min(1.0, 0.4 * (degree/max_degree) + 0.6 * pagerank)

def recency_score(last_accessed, tau_days=30):
    """Exponential decay from last access"""
    days_elapsed = (now() - last_accessed).days
    return math.exp(-days_elapsed / tau_days)
    # 0 days = 1.00
    # 7 days = 0.79
    # 30 days = 0.37
    # 90 days = 0.05

def importance_marker(memory):
    """Explicit importance flags"""
    if memory.pinned:
        return 1.0
    if memory.type == 'immutable':
        return 1.0
    if memory.category == 'user_identity':
        return 0.95
    if memory.is_goal_related:
        return 0.8
    if memory.is_contradiction_resolution:
        return 0.7
    return 0.0  # Default: no explicit importance
```

---

## 4. Five-Tier Storage Hierarchy

### 4.1 Tier Definitions

```
Tier 1: HOT (Active)
├── Full detail, instant retrieval
├── Recent session context + frequently accessed
└── Storage: In-memory / fast cache

Tier 2: WARM (Ready)
├── Full detail, fast retrieval
├── Recent long-term memories
└── Storage: Primary database

Tier 3: COOL (Archived)
├── Full detail, slower retrieval
├── Older but potentially useful
└── Storage: Compressed storage

Tier 4: COLD (Summarized)
├── Key points only, retrieval with notice
├── Aged memories, consolidated
└── Storage: Minimal storage

Tier 5: FROZEN (Tombstone)
├── Existence marker only
├── "Was known" indicator
└── Storage: Metadata only
```

### 4.2 Tier Transition Rules

```python
TIER_THRESHOLDS = {
    'hot_to_warm': {
        'condition': 'no_access_days > 3 AND PS < 0.7',
        'action': 'demote_to_warm'
    },
    'warm_to_cool': {
        'condition': 'no_access_days > 14 AND PS < 0.5',
        'action': 'compress_and_demote'
    },
    'cool_to_cold': {
        'condition': 'no_access_days > 30 AND PS < 0.3',
        'action': 'summarize_and_demote'
    },
    'cold_to_frozen': {
        'condition': 'no_access_days > 90 AND PS < 0.15',
        'action': 'tombstone_and_demote'
    },
    'frozen_to_deleted': {
        'condition': 'age_days > 180 AND PS = 0 AND NOT pinned',
        'action': 'permanent_delete'
    }
}

# Promotion rules (any access promotes)
PROMOTION_RULES = {
    'on_retrieval': 'promote_one_tier',
    'on_successful_use': 'promote_one_tier + strength_boost',
    'on_user_reinforcement': 'promote_to_hot + mark_persistent'
}
```

### 4.3 Graceful Degradation Process

```python
class GracefulDegradation:
    """Transform memories rather than delete"""

    def compress(self, memory):
        """Tier 2→3: Compress storage but keep full content"""
        return {
            'content': lz4_compress(memory.content),
            'metadata': memory.metadata,
            'tier': 'cool'
        }

    def summarize(self, memory):
        """Tier 3→4: Extract and keep only key points"""
        summary = llm.extract_gist(memory.content)
        return {
            'content': summary,
            'original_length': len(memory.content),
            'summary_date': now(),
            'tier': 'cold'
        }

    def tombstone(self, memory):
        """Tier 4→5: Keep only existence marker"""
        return {
            'id': memory.id,
            'type': memory.type,
            'created_date': memory.created_at,
            'tombstone_date': now(),
            'summary': memory.content[:100] if memory.content else None,
            'tier': 'frozen'
        }
```

---

## 5. Consolidation: Working to Long-Term Memory

### 5.1 Promotion Criteria

Memories are promoted from working (ephemeral/session) to long-term storage when:

```python
CONSOLIDATION_TRIGGERS = {
    # Trigger: Minimum threshold for promotion
    'retrieval_count': 3,           # Successfully retrieved 3+ times
    'connection_count': 2,          # Forms 2+ meaningful connections
    'survival_days': 7,             # Survives 7 days with PS > 0.4
    'user_confirmation': 1,         # User explicitly confirms importance
    'goal_contribution': 1,         # Contributed to goal achievement
    'error_correction': 1           # Corrected a previous error
}

def should_consolidate(memory):
    """Check if memory qualifies for promotion to long-term"""
    if memory.tier != 'working':
        return False

    # Any of these triggers promotion
    if memory.retrieval_count >= 3:
        return True
    if memory.connection_count >= 2:
        return True
    if memory.age_days >= 7 and memory.persistence_score > 0.4:
        return True
    if memory.user_confirmed:
        return True
    if memory.contributed_to_goal:
        return True
    if memory.is_error_correction:
        return True

    return False
```

### 5.2 Consolidation Process

```python
def consolidate_memory(memory, knowledge_graph):
    """Promote working memory to long-term storage"""

    # 1. Extract semantic relationships
    relationships = llm.extract_relationships(memory.content)

    # 2. Link to existing knowledge graph nodes
    for rel in relationships:
        existing_node = knowledge_graph.find_similar(rel.target)
        if existing_node:
            knowledge_graph.add_edge(memory.id, existing_node.id, rel.type)
        else:
            # Create new node if significant
            if rel.importance > 0.5:
                new_node = knowledge_graph.add_node(rel.target)
                knowledge_graph.add_edge(memory.id, new_node.id, rel.type)

    # 3. Update affected nodes' connection density
    for connected_id in memory.connections:
        recalculate_connection_density(connected_id)

    # 4. Set memory type and decay parameters
    memory.type = classify_memory_type(memory)
    memory.decay_rate = get_decay_rate(memory.type)
    memory.tier = 'warm'  # Promote to long-term

    # 5. Set initial strength based on consolidation factors
    memory.strength = calculate_initial_strength(memory)

    return memory
```

### 5.3 Background Consolidation Schedule

```python
CONSOLIDATION_SCHEDULE = {
    'micro_consolidation': {
        'frequency': 'every_hour',
        'actions': [
            'update_recency_scores',
            'check_immediate_promotion_triggers'
        ]
    },
    'mini_consolidation': {
        'frequency': 'every_6_hours',
        'actions': [
            'run_full_consolidation_check',
            'strengthen_co_accessed_memories',
            'extract_patterns_from_clusters'
        ]
    },
    'major_consolidation': {
        'frequency': 'every_24_hours',
        'actions': [
            'recalculate_all_connection_densities',
            'apply_decay_to_all_memories',
            'process_tier_transitions'
        ]
    },
    'deep_consolidation': {
        'frequency': 'every_7_days',
        'actions': [
            'run_forgetting_queue',
            'summarize_low_strength_memories',
            'cleanup_orphaned_connections'
        ]
    }
}
```

---

## 6. Active Forgetting Policies

### 6.1 Forgetting Queue Priority

When storage pressure or maintenance requires forgetting:

```python
FORGETTING_PRIORITY = [
    # Priority 1: Immediate deletion candidates
    {
        'condition': 'strength < 0.05 AND age_days > 30',
        'action': 'immediate_delete'
    },

    # Priority 2: Zero-connection orphans
    {
        'condition': 'connection_count == 0 AND age_days > 14 AND PS < 0.3',
        'action': 'tombstone_or_delete'
    },

    # Priority 3: Superseded information
    {
        'condition': 'superseded_by IS NOT NULL AND age_days > 7',
        'action': 'archive_as_historical'
    },

    # Priority 4: Failed retrievals
    {
        'condition': 'retrieval_failures > 3 AND successful_retrievals == 0',
        'action': 'demote_and_flag'
    },

    # Priority 5: Low PS aged memories
    {
        'condition': 'PS < 0.2 AND age_days > 60',
        'action': 'summarize_or_delete'
    }
]

# Protected from forgetting
PROTECTED_CATEGORIES = [
    'user_identity',
    'user_preferences',
    'system_constraints',
    'pinned_memories',
    'active_goals',
    'recent_memories'  # < 7 days old
]
```

### 6.2 Contradiction-Triggered Forgetting

When new information contradicts existing memory:

```python
def handle_contradiction(old_memory, new_memory, confidence_comparison):
    """Process contradictory information"""

    if new_memory.confidence > old_memory.confidence:
        # New info is more authoritative
        old_memory.status = 'superseded'
        old_memory.superseded_by = new_memory.id
        old_memory.superseded_date = now()
        old_memory.decay_multiplier = 2.5  # Accelerate decay

        new_memory.supersedes = old_memory.id
        new_memory.is_contradiction_resolution = True
        new_memory.importance_boost = 0.2  # More important because it corrected something

    elif old_memory.confidence > new_memory.confidence:
        # Old info is more authoritative
        new_memory.status = 'contested'
        new_memory.conflicts_with = old_memory.id
        new_memory.decay_multiplier = 1.5  # Slightly faster decay

    else:
        # Equal confidence - flag for resolution
        old_memory.status = 'needs_resolution'
        new_memory.status = 'needs_resolution'
        create_resolution_task(old_memory, new_memory)
```

### 6.3 Proactive Forgetting for Stale Information

```python
def identify_stale_information():
    """Find candidates for proactive forgetting"""

    stale_candidates = []

    # Time-sensitive information past its date
    for memory in get_memories_with_expiry():
        if memory.expiry_date < now():
            memory.stale_reason = 'expired'
            stale_candidates.append(memory)

    # External facts older than refresh threshold
    for memory in get_external_facts():
        if memory.last_verified_days > 90:
            memory.stale_reason = 'unverified_external'
            stale_candidates.append(memory)

    # Procedural knowledge about deprecated systems
    for memory in get_procedural_memories():
        if memory.references_deprecated_system():
            memory.stale_reason = 'deprecated_reference'
            stale_candidates.append(memory)

    return stale_candidates
```

---

## 7. Retrieval Strengthening

### 7.1 On Successful Retrieval

```python
def on_successful_retrieval(memory):
    """Reinforce memory when successfully used"""

    # Boost strength
    strength_boost = 0.15 * (1 - memory.strength)  # Diminishing returns
    memory.strength = min(1.0, memory.strength + strength_boost)

    # Increase stability (slower future decay)
    memory.stability_factor *= 1.1

    # Update access tracking
    memory.last_accessed = now()
    memory.access_count += 1
    memory.successful_retrievals += 1

    # Recalculate persistence score
    memory.persistence_score = calculate_persistence_score(memory)

    # Consider tier promotion
    if memory.tier in ['cool', 'cold']:
        promote_tier(memory)
```

### 7.2 On Failed Retrieval

```python
def on_failed_retrieval(memory, failure_type):
    """Handle retrieval failures"""

    memory.retrieval_failures += 1

    if failure_type == 'not_found':
        # Memory exists but wasn't retrieved - indexing issue
        reindex_memory(memory)

    elif failure_type == 'irrelevant':
        # Memory was retrieved but not useful
        memory.relevance_penalty += 0.1
        memory.decay_multiplier *= 1.1

    elif failure_type == 'outdated':
        # Memory was relevant topic but wrong information
        flag_for_update(memory)
        memory.status = 'needs_verification'
```

---

## 8. Configuration Parameters

### 8.1 Tunable Thresholds

```python
FORGETTING_CONFIG = {
    # Persistence Score weights
    'ps_weights': {
        'frequency': 0.25,
        'salience': 0.20,
        'connection': 0.25,
        'recency': 0.15,
        'importance': 0.15
    },

    # Decay parameters
    'decay_rates': {
        'ephemeral_lambda': 0.3,
        'decaying_lambda': 0.05,
        'persistent_lambda': 0.01
    },

    # Time thresholds (days unless noted)
    'time_thresholds': {
        'new_memory_protection': 7,
        'hot_to_warm_inactivity': 3,
        'warm_to_cool_inactivity': 14,
        'cool_to_cold_inactivity': 30,
        'cold_to_frozen_inactivity': 90,
        'frozen_to_deleted': 180,
        'external_fact_stale': 90
    },

    # Strength thresholds
    'strength_thresholds': {
        'consolidation_min': 0.4,
        'archive_trigger': 0.3,
        'summarize_trigger': 0.15,
        'tombstone_trigger': 0.05,
        'delete_trigger': 0.0
    },

    # Connection thresholds
    'connection_thresholds': {
        'consolidation_min': 2,
        'high_centrality': 5,
        'orphan_age_days': 14
    }
}
```

### 8.2 Emergency Overrides

```python
EMERGENCY_OVERRIDES = {
    'storage_pressure_threshold': 0.9,  # 90% storage usage
    'aggressive_forgetting_mode': {
        'decay_multiplier': 2.0,
        'ps_threshold_adjustment': +0.1,
        'skip_graceful_degradation': False
    },
    'critical_storage_mode': {
        'decay_multiplier': 5.0,
        'immediate_delete_ps_below': 0.3,
        'skip_graceful_degradation': True
    }
}
```

---

## 9. Metrics and Monitoring

### 9.1 Key Performance Indicators

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Memory growth rate | < 5% daily | > 10% daily |
| Retrieval success rate | > 85% | < 75% |
| False positive forgetting | < 3% | > 5% |
| Storage efficiency (active %) | > 70% | < 50% |
| Orphan memory rate | < 10% | > 20% |
| Consolidation rate | 10-20% of working | < 5% |
| Average PS of retained | > 0.5 | < 0.35 |

### 9.2 Monitoring Queries

```sql
-- Daily forgetting summary
SELECT
    date,
    COUNT(*) as memories_deleted,
    AVG(age_days) as avg_age_at_deletion,
    AVG(persistence_score) as avg_ps_at_deletion
FROM forgetting_log
GROUP BY date;

-- Memories recreated after deletion (false positives)
SELECT original_memory_id, recreation_date, days_since_deletion
FROM memory_recreations
WHERE days_since_deletion < 30;

-- Tier distribution health check
SELECT tier, COUNT(*), AVG(persistence_score), AVG(age_days)
FROM memories
GROUP BY tier;
```

---

## 10. Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Implement memory classification system
- [ ] Add persistence score calculation
- [ ] Create five-tier storage hierarchy
- [ ] Build decay function engine

### Phase 2: Consolidation
- [ ] Implement consolidation triggers
- [ ] Build background consolidation scheduler
- [ ] Add working→long-term promotion logic
- [ ] Create gist extraction for summarization

### Phase 3: Active Forgetting
- [ ] Implement forgetting queue
- [ ] Add graceful degradation pipeline
- [ ] Build contradiction handling
- [ ] Create stale information detection

### Phase 4: Monitoring
- [ ] Deploy KPI dashboards
- [ ] Set up alerting for thresholds
- [ ] Create false positive tracking
- [ ] Build configuration tuning interface

---

## References

### Research Sources
- [Redis AI Agent Memory Management](https://redis.io/blog/build-smarter-ai-agents-manage-short-term-and-long-term-memory-with-redis/)
- [Rethinking Memory in AI: Taxonomy and Operations](https://arxiv.org/html/2505.00675v1)
- [Memory Consolidation Neuroscience](https://pmc.ncbi.nlm.nih.gov/articles/PMC4526749/)
- [Dynamic Human-Like Memory in LLM Agents](https://arxiv.org/html/2404.00573v1)
- [A-Mem: Agentic Memory](https://arxiv.org/html/2502.12110v1)
- [Ebbinghaus Forgetting Curve](https://en.wikipedia.org/wiki/Forgetting_curve)
- [Machine Unlearning Overview](https://gradientflow.com/unlearning-unpacked/)
- [Memory Optimization Strategies](https://medium.com/@nirdiamant21/memory-optimization-strategies-in-ai-agents-1f75f8180d54)
- [Spaced Repetition Language Learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC7334729/)
- [Memory Mechanisms in LLM Agents](https://www.emergentmind.com/topics/memory-mechanisms-in-llm-based-agents)
