# Contradiction Handling and Belief Revision in Knowledge Systems

## Research Summary for Visioneer Memory System

This document synthesizes research on handling conflicting information, knowledge updates, and truth maintenance in AI agent memory systems.

---

## 1. Foundational Frameworks

### AGM Belief Revision Theory

The AGM framework (Alchourrón, Gärdenfors, Makinson) provides the theoretical foundation for rational belief change:

**Three Core Operations:**
1. **Expansion**: Adding belief without consistency check
2. **Revision**: Adding belief while maintaining consistency (removes contradicting beliefs)
3. **Contraction**: Removing belief without adding new ones

**Six Basic Postulates for Rational Revision:**
1. **Closure**: Result must be logically closed
2. **Success**: New belief must be included
3. **Inclusion**: Outcome stays within expansion bounds
4. **Vacuity**: No change when negation isn't already believed
5. **Consistency**: Result remains consistent if input is consistent
6. **Extensionality**: Logically equivalent sentences receive identical treatment

**Key Insight - Levi Identity**: Revision = Contraction + Expansion
- First contract the negation: `K÷¬p`
- Then expand with new belief: `(K÷¬p)+p`

**Update vs Revision Distinction:**
- **Update**: World has changed, bring KB up to date
- **Revision**: Static world, new information about same reality

### Truth Maintenance Systems (TMS)

TMS work alongside inference engines to:
- Record and maintain reasons for beliefs
- Enable dependency-directed backtracking when contradictions found
- Support assumption-making with subsequent revision

**Two Major Types:**
1. **Single-context TMS**: Maintains consistency among all facts
2. **Multi-context TMS**: Allows consistency relevant to subset of facts (paraconsistency)

---

## 2. Contradiction Detection Strategies

### In Knowledge Graphs

**Three-Pronged Approach:**

1. **Detection**: Identify problematic components
   - Exact methods (exhaustive but don't scale)
   - Approximate methods (modularization, ML-based)
   - Clash pattern matching

2. **Fixing**: Resolve to restore consistency
   - Deletion-based: Remove erroneous assertions
   - Update-based: Modify values, retain relationships
   - Selection criteria: User input, source reliability, minimality

3. **Tolerant Reasoning**: Derive conclusions despite inconsistencies
   - **AR (ABox Repair)**: Accept only if true in ALL repairs
   - **IAR (Intersection of ABox Repair)**: Use only assertions in every repair
   - **Brave semantics**: Accept from ANY valid repair
   - **Paraconsistent logics**: Third truth value for contradictions

### Conflict Types in Multi-Source Systems

**Granularity Conflicts** (different specificity):
- Vagueness, incompleteness, fuzziness
- Example: "Paris" vs "France" for location

**Contradictory Conflicts** (incompatible knowledge):
- Invalidity, ambiguity, timeliness
- Example: Birth year 1980 vs 1985 from different sources

---

## 3. Temporal Versioning and Confidence Decay

### Key Insight: "Confidence is Not Timeless"

Rule effectiveness and knowledge validity change over time. Static confidence scores are insufficient.

**TempValid Framework Approach:**
- Learnable parameters for temporal confidence evolution
- Time function design for variable predictive power
- Negative sampling strategies (rule-adversarial, time-aware)

### EvoReasoner/EvoKG Approach

**Confidence-Based Contradiction Resolution:**
- Maintains multiple candidates with confidence scores
- Context-sensitive reasoning rather than simple overwrites
- Temporal trend tracking for complete historical evolution

### Knowledge Decay Considerations

- Information validity degrades over time
- "Temporal validity" = external validity where target is in future
- Must account for how quickly knowledge becomes outdated

---

## 4. Source Credibility Weighting

### AI System Approaches

**Credibility Scoring Factors:**
- Relevance to query
- Recency of information
- Authority (institutional markers)
- Publication reputation

**Weighted Resolution:**
- Credibility functions as multiplier in ranking
- Moderately relevant + highly credible > perfect match + questionable source
- Academic journals, government publications rank higher than unverified sources

### Conflict Severity Handling

**Minor discrepancies**: Averaged or generalized responses
**Major contradictions**:
- Preserve integrity of conflicting sources
- More cautious approach
- Don't artificially resolve

### Admiralty Code Framework (Intelligence Analysis)

Two-dimensional evaluation:
1. **Source reliability**: Historical accuracy of source
2. **Information credibility**: Probability information is true

Research finding: Information credibility weighted more heavily than source reliability in likelihood judgments.

---

## 5. LLM-Specific Considerations

### Knowledge Conflict Types in LLMs

1. **Context-Parametric Conflict**: External context contradicts trained knowledge
2. **Inter-Context Conflict**: Contradictions within provided context
3. **Intra-Memory Conflict**: Inconsistent responses to semantically identical queries

### Parametric vs Contextual Knowledge

**Four Interaction Types:**
- Supportive: Context reinforces parametric knowledge
- Complementary: Context adds to parametric knowledge
- Conflicting: Context contradicts parametric knowledge
- Irrelevant: No meaningful relationship

**Key Vulnerability**: LLMs suppress parametric knowledge when context available, even if context is complementary or irrelevant.

### JuICE Method for Conflict Resolution

**Two-Stage Approach:**
1. Identify attention heads with consistent improvements across conflict types
2. Dual-run inference: First capture head outputs, then apply scaled activations

**Advantage**: Flexible control without fine-tuning; can steer toward either parametric or contextual knowledge.

---

## 6. Provenance and Traceability

### Why Provenance Matters

- Essential for quality assessment
- Enables future conflict resolution
- Supports KG updating decisions
- Tracks how wrong values entered system

### PROV-O Ontology Components

Three main elements:
1. Classes
2. Properties
3. Restrictions

### Fact-Level Provenance ("Deep Provenance")

Includes:
- Creation date
- Confidence score of extraction method
- Original text/context from which fact derived

### Multi-Source Aggregation

When facts derived from multiple sources:
- Cannot attribute to single source
- Represents ensemble of evidence
- May include both supporting and conflicting sources

---

## 7. Practical Implementation Strategies for AI Agent Memory

### Contradiction Resolution Approaches

1. **Recency-Based Prioritization**
   - New information supersedes old
   - Previous state marked inactive but preserved
   - Example: Budget $500 → Budget $750 (old marked inactive)

2. **Source Reliability-Based Resolution**
   - Weight by historical accuracy
   - Authoritative sources given precedence

3. **Conditional Reconciliation**
   - Identify conditions explaining apparent inconsistencies
   - Both states can be valid under different conditions
   - Example: Network behaviors valid under different loads

4. **Multi-Agent Consensus**
   - Version control patterns
   - Priority-based resolution (agent roles, recency, confidence)
   - Authority-level determination

### Memory Scoping Best Practices

Clear boundaries prevent over/mis-remembering:
- Session memory
- User memory
- Team memory
- System memory

### Contradiction Check Integration

Before storing:
1. Check against existing facts
2. Check against system instructions
3. Check for internal self-consistency

---

## 8. Actionable Recommendations for Visioneer

### Core Architecture

1. **Implement Multi-Layer Confidence Scoring**
   - Extraction confidence (how sure was the extraction?)
   - Source reliability (how trustworthy is the source?)
   - Temporal validity (how current is this knowledge?)

2. **Design Explicit Contradiction Detection Pipeline**
   - Pre-storage contradiction check
   - Clash pattern matching
   - Semantic similarity detection for near-contradictions

3. **Support Multiple Resolution Strategies**
   - Recency-based (default for most updates)
   - Authority-based (for authoritative corrections)
   - Conditional (when both states can be valid)
   - User-escalation (for high-stakes conflicts)

### Data Model Requirements

4. **Implement Full Provenance Tracking**
   - Source attribution for every fact
   - Timestamp of acquisition
   - Context from which fact derived
   - Confidence at time of acquisition

5. **Version Control for Knowledge**
   - Don't delete on contradiction; mark inactive
   - Preserve full history of belief states
   - Enable rollback if needed

6. **Temporal Metadata**
   - Valid-from / valid-to timestamps
   - Decay function parameters per knowledge type
   - Refresh indicators for time-sensitive facts

### Reasoning Considerations

7. **Paraconsistent Reasoning Support**
   - Allow querying despite local inconsistencies
   - Implement IAR-style conservative inference for high-stakes
   - Support brave semantics for exploratory queries

8. **Context-Sensitive Conflict Resolution**
   - Different resolution strategies for different contexts
   - User preference integration
   - Domain-specific rules (e.g., financial data more authoritative than social media)

### Integration Points

9. **Memory Consolidation Process**
   - Regular contradiction detection sweeps
   - Confidence decay application
   - Stale knowledge identification

10. **User Transparency**
    - Surface conflicts to user when high-stakes
    - Explain provenance of contested facts
    - Allow user override with attribution

---

## Sources

- [Dealing with Inconsistency for Reasoning over Knowledge Graphs: A Survey](https://arxiv.org/html/2502.19023v1)
- [Reason maintenance - Wikipedia](https://en.wikipedia.org/wiki/Reason_maintenance)
- [Logic of Belief Revision - Stanford Encyclopedia of Philosophy](https://plato.stanford.edu/entries/logic-belief-revision/)
- [Confidence is not Timeless: Modeling Temporal Validity](https://aclanthology.org/2024.acl-long.580/)
- [Uncertainty Management in Knowledge Graphs](https://arxiv.org/html/2405.16929v2)
- [Taming Knowledge Conflicts in Language Models](https://arxiv.org/html/2503.10996)
- [How AI Models Rank Conflicting Information](https://www.covert.com.au/how-ai-models-rank-conflicting-information-what-wins-in-a-tie/)
- [Provenance-driven nanopublications](https://link.springer.com/article/10.1007/s00799-025-00431-x)
- [Building smarter AI agents: AgentCore long-term memory](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive/)
- [Why Multi-Agent Systems Need Memory Engineering](https://www.mongodb.com/company/blog/technical/why-multi-agent-systems-need-memory-engineering)
