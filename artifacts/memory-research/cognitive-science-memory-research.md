# Cognitive Science Models of Human Memory and Learning
## Research Findings for AI Memory System Design

**Research Date:** January 2025
**Purpose:** Extract principles from human memory research to inform AI agent memory design

---

## 1. Memory Type Classifications

### Episodic vs Semantic Memory (Tulving, 1972)
Human long-term memory is fundamentally divided into two systems:

- **Episodic Memory**: Memory of individual experiences and events, bound to specific times and contexts
- **Semantic Memory**: General knowledge and facts about the world, abstracted from specific experiences

**Key Insight for AI**: These systems are not discrete - there's "transitional gradation" where episodic memories gradually become semanticized during consolidation. Memories start as rich episodic traces and evolve into abstract semantic knowledge over time.

### The Reconstructive Nature of Memory (Bartlett, 1932)
Memories are not stored like files - they are **reconstructed** at recall time using:
- Schema (cognitive frameworks from prior knowledge)
- Current context and goals
- Semantic associations

**Key Insight for AI**: Memory retrieval should be seen as generative reconstruction, not exact retrieval. This explains why memories can be distorted but also allows for flexible application of past knowledge.

---

## 2. Memory Consolidation

### Two-Stage Consolidation Process

1. **Synaptic Consolidation** (hours): Stabilizes memory traces at synaptic level through protein synthesis
2. **Systems Consolidation** (weeks-years): Transfers memories from hippocampus to neocortex

### Complementary Learning Systems Theory (McClelland et al., 1995)
The brain uses two complementary memory systems:

| System | Learning Speed | Decay | Purpose |
|--------|----------------|-------|---------|
| Hippocampus | Fast | Fast | Rapid encoding of specific experiences |
| Neocortex | Slow | Slow | Gradual integration into structured knowledge |

**Key Mechanisms:**
- Hippocampus encodes quickly but decays fast (prevents catastrophic interference)
- Neocortex learns slowly through "interleaved training" from hippocampal replay
- Sleep enables offline consolidation through neural replay

**Key Insight for AI**: A two-tier memory architecture is biologically optimal - fast learning working memory that gradually consolidates important information into stable long-term storage. This prevents new learning from catastrophically interfering with existing knowledge.

### Sleep and Memory Replay
- During slow-wave sleep, hippocampal memories are replayed to neocortex
- This transforms episodic memories into schema-integrated semantic memories
- Replay strengthens important connections while allowing others to decay

**Key Insight for AI**: Periodic "offline" consolidation processes (background jobs) could strengthen important memories and integrate them into knowledge structures.

---

## 3. Forgetting: Models and Functions

### The Forgetting Curve (Ebbinghaus, 1885)
Memory retention decays over time following a predictable pattern:
- 50% forgotten within 30 minutes
- 70-80% forgotten within 24 hours
- Decay is steepest immediately after learning

### Mathematical Models of Forgetting

**Power Law Model (most empirically supported):**
```
P(recall) = m(1 + ht)^(-f)
```
Where:
- m = initial learning strength
- h = time scaling factor
- f = decay exponent

**Key Finding**: While individual memories decay exponentially, aggregate forgetting follows a power law (older memories are proportionally more stable).

**Exponential Model:**
```
R = exp(-t/S)
```
Where R = retrievability, t = time, S = stability

### Why We Forget
1. **Passive Decay**: Memory traces weaken over time without reinforcement
2. **Proactive Interference**: Old memories block new learning
3. **Retroactive Interference**: New learning disrupts old memories
4. **Retrieval Failure**: Information exists but cannot be accessed

**Key Insight for AI**: Forgetting is not a bug - it's a feature. Strategic forgetting prevents cognitive overload and keeps memory systems focused on relevant information. AI systems should implement principled forgetting mechanisms.

---

## 4. Interference Theory

### Types of Interference

**Proactive Interference**: Old information interferes with new learning
- Example: Old passwords interfering with recalling new ones
- Emerges during post-learning waking retention

**Retroactive Interference**: New information interferes with old memories
- More common and more problematic
- Develops during new learning itself

### Factors Affecting Interference
1. **Similarity**: Similar information creates more interference
2. **Timing**: Learning events close together create more interference
3. **Shared neural circuits**: Using same mechanisms increases interference

**Key Insight for AI**: When storing new information that contradicts old information, the system must explicitly handle this conflict rather than letting it create hidden interference. Temporal separation and distinct encoding can reduce interference.

---

## 5. Retrieval: Context and Cues

### Encoding Specificity Principle (Tulving & Thomson, 1973)
Memory retrieval is most effective when retrieval context matches encoding context.

**Types of Context-Dependent Memory:**
- **Environmental context**: Physical surroundings during learning
- **State-dependent**: Physiological/emotional state
- **Cognitive context**: Mental state, language, task context

**Classic Example**: Scuba divers recalled underwater-learned words better when tested underwater (Godden & Baddeley, 1975).

### Retrieval Cues
Context provides cues that reactivate neural patterns similar to encoding patterns.

**The Outshining Hypothesis**: Stronger cues can "outshine" weaker ones - good semantic cues can override environmental context cues.

**Key Insight for AI**: Memory retrieval should leverage multiple types of context - semantic similarity, temporal proximity, task context, and state information. The richest retrieval combines multiple cue types.

---

## 6. Learning Optimization Strategies

### Spaced Repetition (Ebbinghaus → Leitner → Modern)

**Core Principle**: Reviewing at optimal intervals flattens the forgetting curve and promotes long-term retention.

**The Leitner System (1972)**:
- Cards sorted into boxes based on performance
- Correct answers → longer interval (next box)
- Incorrect answers → reset to daily review (first box)
- Natural prioritization of difficult material

**MEMORIZE Algorithm (Optimal Spaced Repetition)**:
```
u*(t) = q^(-1/2)(1 - m(t))
```
Where:
- u*(t) = optimal review intensity
- m(t) = current recall probability
- q = trade-off parameter

**Key Insight for AI**: Memory importance/strength should decay over time, but can be reinforced through successful retrieval. Systems should track retrieval success and schedule re-exposure accordingly.

### The Testing Effect (Retrieval Practice)
Testing/retrieval is not just measurement - it's a powerful learning mechanism.

**Key Findings:**
- Retrieval practice produces stronger retention than restudying
- Effect increases with spacing and delay
- Forward effect: Testing on A improves learning of B
- Works best with effortful production (not just recognition)

**Key Insight for AI**: Actively retrieving and using memories strengthens them more than passive storage. Memories used for reasoning/decisions should be reinforced.

### Levels of Processing (Craik & Lockhart, 1972)

**Depth of Processing Hierarchy:**
1. **Shallow**: Physical/sensory features
2. **Intermediate**: Phonetic/structural features
3. **Deep**: Semantic meaning, connections to existing knowledge

**The Role of Elaboration:**
- Rich semantic processing creates more retrieval routes
- Connecting new information to existing knowledge aids retention
- Distinctive encoding creates memorable traces

**Key Insight for AI**: Information processed for meaning and connected to existing knowledge is retained better. Simple vector similarity is shallow processing; semantic relationship extraction is deep processing.

---

## 7. Cognitive Load and Working Memory

### Cognitive Load Theory (Sweller, 1988)

**Three Types of Cognitive Load:**
1. **Intrinsic Load**: Inherent complexity of material
2. **Extraneous Load**: Poorly designed presentation (reducible)
3. **Germane Load**: Effort to build mental schemas (desirable)

**Working Memory Constraints:**
- Capacity: 5-9 items
- Duration: ~20 seconds without rehearsal
- Processing limitation: Fewer items when combining/manipulating

**Key Insight for AI**: Memory retrieval should minimize irrelevant information (extraneous load) while maximizing relevant context (germane load). Chunking related memories together reduces cognitive burden.

### The Expertise Reversal Effect
- Strategies optimal for novices can be suboptimal for experts
- Scaffolding becomes redundant/harmful as knowledge grows

**Key Insight for AI**: Memory retrieval strategies should adapt to the agent's accumulated knowledge in a domain.

---

## 8. Schema Theory and Knowledge Integration

### How Schemas Work (Bartlett, 1932)
- Schemas are cognitive structures organizing knowledge
- New information is assimilated into existing schemas
- Gaps are filled through schema-based inference
- Recall is reconstruction using schemas, not exact retrieval

### Schema-Based Memory Distortions
- Unfamiliar content is transformed to fit existing schemas
- Details inconsistent with schemas are forgotten
- Schema-consistent details may be falsely "remembered"

**Key Insight for AI**: Knowledge graph structures serve as schemas. New information should be integrated into existing structures, but the system must track what is original vs. inferred.

---

## 9. Practical Implications for AI Memory Design

### Architecture Recommendations

1. **Two-Tier Memory System**
   - Fast working memory for recent context
   - Slower consolidation to long-term storage
   - Background consolidation processes (like sleep replay)

2. **Context-Rich Encoding**
   - Store not just content but temporal, semantic, and task context
   - Enable multiple retrieval paths

3. **Principled Forgetting**
   - Decay function for unused memories
   - Interference-aware storage (detect conflicts)
   - Importance scoring for persistence decisions

4. **Active Retrieval Strengthening**
   - Memories used successfully get reinforced
   - Track retrieval history for spaced repetition
   - Usage patterns inform consolidation decisions

5. **Schema-Based Integration**
   - New information linked to existing knowledge structures
   - Semantic relationship extraction (deep processing)
   - Track original vs. inferred information

### Key Mathematical Models to Consider

| Process | Model | Key Parameters |
|---------|-------|----------------|
| Forgetting | Power Law | Initial strength, decay rate |
| Spaced Repetition | MEMORIZE | Recall probability, review intensity |
| Interference | Circuit-based | Timing, similarity, mechanism overlap |
| Consolidation | Two-stage | Encoding strength, replay frequency |

---

## 10. Sources and References

### Memory Systems
- [Tulving's Episodic/Semantic Distinction](https://royalsocietypublishing.org/doi/10.1098/rstb.2023.0407)
- [Machine with Human-Like Memory Systems](https://arxiv.org/abs/2212.02098)
- [Generative Model of Memory Construction](https://www.nature.com/articles/s41562-023-01799-z)

### Consolidation and Sleep
- [Sleep-Dependent Memory Consolidation](https://pmc.ncbi.nlm.nih.gov/articles/PMC2680680/)
- [Mechanisms of Systems Memory Consolidation](https://www.nature.com/articles/s41593-019-0467-3)
- [Complementary Learning Systems](https://stanford.edu/~jlmcc/papers/McCMcNaughtonOReilly95.pdf)

### Forgetting and Spaced Repetition
- [Forgetting Curve](https://en.wikipedia.org/wiki/Forgetting_curve)
- [MEMORIZE Algorithm - Spaced Repetition Optimization](https://pmc.ncbi.nlm.nih.gov/articles/PMC6410796/)
- [Leitner System](https://en.wikipedia.org/wiki/Leitner_system)
- [Power Law of Forgetting](https://memory.psych.upenn.edu/files/pubs/KahaAdle02.pdf)

### Retrieval and Context
- [Context-Dependent Memory](https://en.wikipedia.org/wiki/Context-dependent_memory)
- [Encoding Specificity Principle](https://en.wikipedia.org/wiki/Encoding_specificity_principle)
- [Testing Effect](https://en.wikipedia.org/wiki/Testing_effect)

### Interference
- [Proactive vs Retroactive Interference](https://www.simplypsychology.org/proactive-and-retroactive-interference.html)
- [Interference Theory](https://en.wikipedia.org/wiki/Interference_theory)

### Cognitive Load and Processing
- [Cognitive Load Theory](https://www.sciencedirect.com/science/article/abs/pii/B9780123876911000028)
- [Levels of Processing](https://www.simplypsychology.org/levelsofprocessing.html)
- [Schema Theory](https://www.ebsco.com/research-starters/psychology/schema-theory)

### AI Memory Implementation
- [Graphiti Knowledge Graph Memory](https://github.com/getzep/graphiti)
- [Zep Temporal Knowledge Graph](https://arxiv.org/abs/2501.13956)
- [AI Agents Memory Systems](https://www.falkordb.com/blog/ai-agents-memory-systems/)
