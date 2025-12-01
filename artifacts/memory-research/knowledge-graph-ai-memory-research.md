# Knowledge Graph Architectures for AI Memory Systems

## Executive Summary

This research investigates modern knowledge graph architectures that go beyond simple vector similarity for representing relationships in AI memory systems. Key findings include typed edges, temporal modeling, confidence scores, and hierarchical memory structures that enable more meaningful and queryable memory relationships.

---

## 1. Core Architectural Approaches

### 1.1 Zep/Graphiti Architecture

Zep represents a state-of-the-art temporal knowledge graph architecture for AI agent memory, built on top of Graphiti. It implements a **three-tier hierarchical subgraph structure**:

1. **Episode Subgraph (𝒢ₑ)**: Stores raw input data (messages, text, JSON) non-lossily
2. **Semantic Entity Subgraph (𝒢ₛ)**: Contains extracted entities and their relationships
3. **Community Subgraph (𝒢c)**: High-level abstraction layer with clustered entity summaries

**Key Innovation**: Bi-temporal modeling that tracks both:
- When events actually occurred (Timeline T)
- When data was ingested into the system (Timeline T′)

### 1.2 MemGPT Hierarchical Memory

Inspired by operating system memory management:

- **Main Context**: Analogous to RAM - fixed-length context window
- **External Context**: Analogous to disk storage - out-of-context information
- Agents autonomously manage memory movement between tiers via function calls

### 1.3 H-MEM (Hierarchical Memory)

Four-layer architecture:
- Domain Layer
- Category Layer
- Memory Trace Layer
- Episode Layer

---

## 2. Typed Edges and Semantic Relations

### 2.1 Edge Type Conventions

Modern systems extract facts as typed edges with explicit relation types using:
- All-caps descriptions: `LOVES`, `IS_FRIENDS_WITH`, `WORKS_FOR`
- Hierarchical relationship types: `PART_OF`, `COMPATIBLE_WITH`, `DEPENDS_ON`
- Directional semantics: `parent-of` as inverse of `child-of`

### 2.2 Relationship Categories

| Category | Examples | Use Case |
|----------|----------|----------|
| Hierarchical | `IS_A`, `PART_OF`, `CONTAINS` | Taxonomy modeling |
| Temporal | `PRECEDED_BY`, `FOLLOWED_BY` | Event sequences |
| Associative | `RELATED_TO`, `SIMILAR_TO` | Semantic connections |
| Causal | `CAUSED_BY`, `INFLUENCES`, `DEPENDS_ON` | Reasoning chains |
| Action | `CREATED`, `MODIFIED`, `DELETED` | Agent actions |

### 2.3 Hyper-Edges

Support for multi-entity relationships through hyper-edge implementation, allowing a single edge to connect multiple entities simultaneously.

---

## 3. Temporal Attributes

### 3.1 Bi-Temporal Model (Zep/Graphiti)

Each edge maintains four timestamp fields:

```
t′created   - Transaction creation time
t′expired   - Transaction expiration time
tvalid      - Event validity start
tinvalid    - Event validity end
```

### 3.2 Edge Invalidation

When new information contradicts existing facts:
- System invalidates affected edges by setting `tinvalid` to the `tvalid` of the invalidating edge
- Historical records are maintained while reflecting current understanding
- Enables "point-in-time queries" without graph recomputation

### 3.3 Time-Sensitive vs Time-Insensitive Relations

Some relations are time-insensitive (e.g., "Paris is in France")
Others are highly time-dependent (e.g., "John works at Company X")

---

## 4. Confidence Scores

### 4.1 Representation Approaches

Uncertain knowledge graphs associate each fact with a confidence score:

```
u = (f, sf) where:
  f = (head, relation, tail, [Ts, Te])  -- temporal relation fact
  sf ∈ [0,1]                            -- confidence probability
```

### 4.2 Mathematical Conversion Functions

**Logistic Function**:
```
S(h, r, t)_confidence = 1 / (1 + e^(-wf + b))
```

**Bounded Rectifier**:
```
S(h, r, t)_confidence = min(max(wf + b, 0), 1)
```

### 4.3 Sources of Uncertainty

- Automated extraction introduces noise and conflicts
- Multiple sources with varying reliability
- Inference-based relationships vs. stated facts

---

## 5. Graph Data Models

### 5.1 RDF (Resource Description Framework)

**Structure**: Subject-Predicate-Object triples
**Query Language**: SPARQL
**Strengths**:
- Standardized URIs for unique identification
- Strong semantic expressivity via RDF(S) and OWL
- Excellent for data integration and interchange

**Weaknesses**:
- Relationships not first-class citizens
- More verbose and complex to maintain

### 5.2 Property Graphs (LPG)

**Structure**: Nodes and edges with key-value properties
**Query Languages**: Cypher, Gremlin, GQL (new ISO standard)
**Strengths**:
- Index-free adjacency for fast traversals
- Properties on both nodes and edges
- Simpler and quicker to set up

**Weaknesses**:
- No standard ontology support
- Less semantic interoperability

### 5.3 Hybrid Approaches

Large enterprises often combine both:
- RDF for logical reasoning and semantic inference
- LPG for ML tasks and traversal-based algorithms

---

## 6. Retrieval and Querying Patterns

### 6.1 Hybrid Search (Graphiti)

Three search methods combined:
1. **Cosine Similarity**: Semantic embedding search
2. **BM25**: Full-text keyword search
3. **Breadth-First Graph Traversal**: Relationship exploration

**Performance**: P95 latency of 300ms with near-constant time access regardless of graph size.

### 6.2 Query Function Composition

```
f(query) = χ(ρ(φ(query)))

Where:
  φ = Search function (cosine, BM25, BFS)
  ρ = Reranker (RRF, MMR, or cross-encoder)
  χ = Constructor (formats results into context)
```

### 6.3 Graph Traversal Patterns

- **Depth Configuration**: 1-5 hops (default: 2)
- **Relation Filtering**: Follow specific types (INFLUENCES, DEPENDS_ON, IMPLEMENTS)
- **Multi-hop Reasoning**: Connect facts across 2-3 hops

### 6.4 Cypher Example Patterns

```cypher
// Find related entities 2 hops away
MATCH (e:Entity {name: $name})-[r1]->(m)-[r2]->(target)
WHERE r1.confidence > 0.7 AND r2.confidence > 0.7
RETURN target, type(r1), type(r2)

// Temporal query - valid at specific time
MATCH (a)-[r {valid_at: $timestamp}]->(b)
WHERE r.t_invalid IS NULL OR r.t_invalid > $timestamp
RETURN a, r, b
```

---

## 7. Memory Types for AI Agents

### 7.1 Episodic Memory
- Stores remembered experiences and event details
- Contains past agent actions
- Used for few-shot prompting

### 7.2 Semantic Memory
- Facts about the world and users
- User preferences, names, relationships
- Document collections for RAG

### 7.3 Procedural Memory
- Steps for decision-making
- Problem-solving procedures

### 7.4 Factual Memory
- Persistent facts about users/environment
- Communication style preferences
- Personalization data

---

## 8. Implementation Recommendations

### 8.1 For Visioneer Memory System

**Recommended Architecture Elements**:

1. **Typed Edges**: Use consistent naming convention (ALL_CAPS)
   - `LEARNED_FROM`, `RELATED_TO`, `CONTRADICTS`, `SUPPORTS`
   - `PRECEDED_BY`, `TRIGGERED_BY`, `DEPENDS_ON`

2. **Temporal Tracking**: Implement bi-temporal model
   - `created_at`: When memory was stored
   - `valid_from`, `valid_until`: When knowledge was/is true

3. **Confidence Scores**: Attach to all relationships
   - `verified`: Source-confirmed facts
   - `inferred`: Reasoning-derived connections
   - `speculative`: Hypotheses

4. **Hierarchical Structure**:
   - Raw episodes (conversations, tasks)
   - Extracted entities and relationships
   - Community summaries and patterns

### 8.2 Query Optimization

- Combine embedding search with graph traversal
- Use BM25 for keyword matching
- Index frequently-traversed relationship types
- Configure traversal depth based on query type

### 8.3 Schema Design Principles

- Start with established ontologies (schema.org, etc.)
- Design for specific business questions first
- Start small and iterate
- Maintain provenance metadata

---

## 9. Key Tools and Frameworks

| Tool | Type | Key Feature |
|------|------|-------------|
| Graphiti/Zep | Framework | Temporal knowledge graph with bi-temporal model |
| Neo4j | Database | Native graph DB with Cypher query language |
| Microsoft GraphRAG | Framework | Modular graph-based RAG system |
| MemGPT/Letta | Framework | OS-inspired hierarchical memory management |
| FalkorDB | Database | Graph DB optimized for AI agent memory |

---

## 10. References

- [Zep: A Temporal Knowledge Graph Architecture](https://arxiv.org/html/2501.13956v1)
- [Graphiti GitHub Repository](https://github.com/getzep/graphiti)
- [Neo4j: Modeling Agent Memory](https://neo4j.com/blog/developer/modeling-agent-memory/)
- [Microsoft GraphRAG](https://github.com/microsoft/graphrag)
- [RDF vs Property Graphs (Neo4j)](https://neo4j.com/blog/knowledge-graph/rdf-vs-property-graphs-knowledge-graphs/)
- [Enterprise Knowledge Graph Best Practices](https://enterprise-knowledge.com/best-practices-for-enterprise-knowledge-graph-design/)
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560)
