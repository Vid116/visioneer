# RAG System Limitations and Advanced Retrieval Strategies

## Executive Summary

This research analyzes the current state of RAG (Retrieval Augmented Generation) systems, identifying key failure modes and documenting advanced retrieval strategies for surfacing the RIGHT context at the RIGHT time. The findings are actionable for improving Visioneer's memory system.

---

## Part 1: Seven Failure Points in RAG Systems

Based on comprehensive research ([arxiv.org/html/2401.05856v1](https://arxiv.org/html/2401.05856v1)), RAG systems exhibit seven distinct failure modes:

### FP1: Missing Content
**Problem:** Questions are asked that cannot be answered from available documents. The system generates plausible responses even when source material doesn't exist.

**Solution:** Implement semantic caching to prepopulate frequently asked questions; add confidence scoring for retrieval results.

### FP2: Missed Top-Ranked Documents
**Problem:** The answer exists in the knowledge base but doesn't rank highly enough to be retrieved.

**Solution:** Add metadata enrichment (filename, chunk number, timestamps); implement hybrid retrieval combining semantic + keyword search.

### FP3: Not in Context (Consolidation Failure)
**Problem:** Relevant documents are retrieved but don't make it into the final context due to consolidation/truncation.

**Solution:** Implement configurable consolidation strategies; use re-ranking to ensure most relevant chunks appear first.

### FP4: Not Extracted
**Problem:** The answer is present in context, but the LLM fails to extract it due to noise or contradictory information.

**Solution:** Use larger context windows (8K+ tokens); implement contextual compression to reduce noise.

### FP5: Wrong Format
**Problem:** LLMs ignore formatting instructions when generating responses.

**Solution:** Implement prompt calibration and runtime monitoring for format compliance.

### FP6: Incorrect Specificity
**Problem:** Responses are either too general or too specific for user needs.

**Solution:** Design domain-specific prompts; establish feedback loops during testing.

### FP7: Incomplete
**Problem:** Responses omit relevant details available in context.

**Solution:** Implement multi-query retrieval for complex questions; use chain-of-verification approaches.

---

## Part 2: Why Similarity Search Fails

### The Semantic Gap Problem
Traditional RAG relies on embedding similarity between queries and documents. This fails when:

1. **Vocabulary Mismatch:** User queries use different terminology than documents
2. **Short vs Long Text:** Brief queries don't capture enough semantic signal
3. **Exact Match Requirements:** Codes, error messages, SKUs, and abbreviations require precise keyword matching
4. **Multi-hop Reasoning:** Single retrieval can't connect information across multiple documents
5. **Temporal Context:** Static embeddings don't capture time-sensitive relevance

### Context Loss During Chunking
When documents are split into chunks:
- Individual chunks lose their broader context
- A chunk saying "Its more than 3.85 million inhabitants" loses reference to which city
- Embedding quality degrades without contextual anchoring

---

## Part 3: Advanced Retrieval Strategies

### 3.1 Hybrid Search

**Definition:** Combines vector/semantic search with keyword/lexical search (BM25).

**How It Works:**
```
Hybrid Score = (1-α)×Keyword_Score + α×Vector_Score
```
- α = 0: Pure keyword search
- α = 1: Pure vector search
- α = 0.5: Balanced hybrid

**Reciprocal Rank Fusion (RRF):**
```
RRF(d) = Σ 1/(k + r(d))
```
Combines rankings from multiple retrieval methods without requiring score normalization.

**Performance Impact:**
- Better retrieval of specific terms (names, codes, abbreviations)
- Improved contextual accuracy for location/entity queries
- Superior code search combining exact matches with semantic relevance

**Sources:** [superlinked.com](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking), [analyticsvidhya.com](https://www.analyticsvidhya.com/blog/2024/12/contextual-rag-systems-with-hybrid-search-and-reranking/)

---

### 3.2 Re-Ranking with Cross-Encoders

**Architecture Comparison:**

| Aspect | Bi-Encoder | Cross-Encoder |
|--------|------------|---------------|
| Input | Query and passage encoded separately | Query and passage together |
| Speed | Fast (parallelizable) | Slow (sequential) |
| Accuracy | Lower | Higher |
| Scalability | Excellent | Limited |
| Best Use | Initial retrieval | Re-ranking top-K |

**Two-Stage Pipeline:**
1. Bi-encoder retrieves top-100 candidates (fast)
2. Cross-encoder re-ranks to top-K (accurate)

**Performance Gains:**
- Re-ranking can boost retrieval accuracy by 15-30%
- Cross-encoders capture fine-grained query-document interactions
- Essential for domain-specific relevance rules

**Recommended Models:**
- `cross-encoder/ms-marco-MiniLM-L-6-v2` (balanced)
- `cross-encoder/ms-marco-TinyBERT-L-6-v2` (faster inference)

**Source:** [OpenAI Cookbook](https://cookbook.openai.com/examples/search_reranking_with_cross-encoders)

---

### 3.3 Contextual Retrieval (Anthropic Method)

**Core Innovation:** Prepend chunk-specific context before embedding.

**Process:**
1. For each chunk, use LLM to generate explanatory context
2. Prepend context (50-100 tokens) to chunk
3. Create embeddings from contextualized chunks
4. Apply both to embeddings AND BM25 index

**Example:**
```
Original: "The company reported Q3 revenue of $4.2B..."
Contextualized: "[This chunk is from Acme Corp's 2024 Q3 earnings report] The company reported Q3 revenue of $4.2B..."
```

**Performance Results:**
- Contextual Embeddings alone: 35% reduction in retrieval failures
- Combined with BM25: 49% reduction
- With re-ranking: 67% reduction

**Cost:** ~$1.02 per million document tokens using prompt caching

**Source:** [Anthropic Engineering](https://www.anthropic.com/engineering/contextual-retrieval)

---

### 3.4 Query Decomposition

**Problem:** Complex queries require information from multiple sources or reasoning steps.

**Solution:** Break complex queries into simpler sub-queries.

**Approaches:**
1. **Sequential Decomposition:** Each sub-query builds on previous results
2. **Parallel Decomposition:** Independent sub-queries run simultaneously
3. **Hierarchical Decomposition:** Tree-structured query breakdown

**Example:**
```
Original: "Compare the revenue growth of Apple and Microsoft over the last 3 years and explain market factors"

Decomposed:
1. "Apple revenue 2021-2024"
2. "Microsoft revenue 2021-2024"
3. "Tech market factors affecting revenue 2021-2024"
```

**Implementation:** Use LLM to determine if decomposition is needed before running any searches.

---

### 3.5 HyDE (Hypothetical Document Embeddings)

**Core Idea:** Generate a hypothetical answer, then search for documents similar to that answer.

**Process:**
1. Query arrives: "What causes inflation?"
2. LLM generates hypothetical answer (even if imperfect)
3. Embed the hypothetical answer
4. Search for real documents similar to this hypothetical

**Why It Works:**
- Bridges semantic gap between short queries and long documents
- Document-to-document comparison vs question-to-document
- Zero-shot (no training required)

**Limitations:**
- Works best when LLM has some domain knowledge
- Can introduce hallucinations if LLM generates incorrect hypotheticals

**Source:** [zilliz.com](https://zilliz.com/learn/improve-rag-and-information-retrieval-with-hyde-hypothetical-document-embeddings)

---

### 3.6 Self-RAG and Adaptive Retrieval

**Core Innovation:** Model decides WHEN and HOW MUCH to retrieve.

**Reflection Tokens:**
- **Retrieve:** Should I retrieve information?
- **ISREL:** Is retrieved passage relevant?
- **ISSUP:** Does passage support my answer?
- **ISUSE:** Is overall response useful?

**Adaptive Retrieval Strategies:**
| Query Type | Strategy |
|------------|----------|
| Simple factual | No retrieval (use LLM knowledge) |
| Specific lookup | Single-shot RAG |
| Complex multi-hop | Iterative RAG |

**Benefits:**
- Reduces unnecessary retrieval calls
- Improves response quality by self-correction
- Adapts to diverse query requirements

**Source:** [selfrag.github.io](https://selfrag.github.io/)

---

### 3.7 Chain-of-Retrieval (CoRAG)

**Process:**
1. Initial retrieval based on query
2. Generate reasoning step
3. Reformulate query based on reasoning
4. Retrieve additional information
5. Continue until answer is complete

**Key Insight:** Queries should evolve based on what's been learned, not remain static.

**Source:** [arxiv.org/html/2501.14342v1](https://arxiv.org/html/2501.14342v1)

---

### 3.8 Query Routing

**Definition:** Direct queries to appropriate retrieval strategies based on query characteristics.

**Routing Options:**
- **No retrieval:** For simple questions LLM can answer directly
- **Single RAG:** For straightforward factual lookups
- **Multi-hop RAG:** For complex reasoning chains
- **Graph RAG:** For relationship-based queries
- **Specific index:** Route to domain-specific knowledge bases

**Implementation Approaches:**
1. **Rule-based:** Pattern matching on query structure
2. **Confidence-based:** Route based on LLM certainty
3. **Classifier-based:** Train model to predict optimal strategy

**Source:** [arxiv.org/html/2506.10408v1](https://arxiv.org/html/2506.10408v1)

---

## Part 4: Context Engineering for AI Agents

### Core Principle
> "Context engineering is the art and science of filling the context window with just the right information for the next step."

### Just-in-Time vs Pre-Loading

| Approach | When to Use | Example |
|----------|-------------|---------|
| Pre-loading | Static, bounded information | Legal documents, config files |
| Just-in-time | Dynamic, large datasets | Codebase navigation, web search |
| Hybrid | Complex agent tasks | Load essentials + explore as needed |

### Key Strategies

1. **Compaction:** Summarize conversation history, preserve decisions and bugs, discard redundant outputs

2. **Structured Note-Taking:** Agents maintain persistent notes outside context window

3. **Multi-Agent Delegation:** Sub-agents explore deeply, return condensed summaries (1,000-2,000 tokens)

4. **Few-Shot Examples:** Diverse, canonical examples > exhaustive edge cases

5. **Progressive Disclosure:** Allow agents to discover context through exploration

### Critical Insight
> "Most agent failures are not model failures anymore, they are context failures."

**Source:** [Anthropic Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

---

## Part 5: Evaluation Metrics

### Retrieval Metrics
| Metric | Description | Use Case |
|--------|-------------|----------|
| Precision@K | Relevant docs / Retrieved docs | Quality of top results |
| Recall@K | Relevant retrieved / All relevant | Coverage of relevant info |
| F1@K | Harmonic mean of P&R | Balanced evaluation |
| MRR | Position of first relevant result | Speed to correct answer |
| nDCG | Ranking quality with graded relevance | Order matters |

### Context Quality Metrics
- **Contextual Relevancy:** Is retrieved context relevant to input?
- **Contextual Recall:** Does context contain all needed information?
- **Contextual Precision:** Is context ranked by relevance?

### Generation Metrics
- **Faithfulness:** Does response match retrieved context?
- **Answer Relevancy:** Does response address the query?
- **Hallucination Rate:** Factual errors not in context

---

## Part 6: Recommendations for Visioneer Memory System

### Immediate Improvements

1. **Implement Hybrid Retrieval**
   - Combine semantic search with BM25 keyword matching
   - Use Reciprocal Rank Fusion for score combination
   - Expected improvement: 20-30% better retrieval for specific terms

2. **Add Re-Ranking Layer**
   - Retrieve top-100, re-rank to top-10 with cross-encoder
   - Use lightweight models (MiniLM) for latency constraints
   - Expected improvement: 15-30% accuracy boost

3. **Contextualize Chunks**
   - Prepend document-level context to each chunk before embedding
   - Use LLM to generate brief contextual summaries
   - Expected improvement: 35-49% reduction in retrieval failures

### Medium-Term Enhancements

4. **Implement Adaptive Retrieval**
   - Add decision logic for when/how much to retrieve
   - Use confidence scoring to trigger additional retrieval
   - Route queries to appropriate retrieval strategies

5. **Query Transformation Pipeline**
   - Decompose complex queries into sub-queries
   - Consider HyDE for domain-specific applications
   - Implement query reformulation based on initial results

6. **Context Engineering Framework**
   - Implement compaction for long conversations
   - Add structured note-taking for persistent context
   - Use progressive disclosure for exploration

### Evaluation Framework

7. **Implement Retrieval Metrics**
   - Track Precision@K, Recall@K, MRR for retrieval quality
   - Monitor Context Relevancy and Faithfulness for generation
   - Set up continuous evaluation pipeline

---

## References

- [Seven Failure Points in RAG Systems](https://arxiv.org/html/2401.05856v1)
- [Contextual Retrieval - Anthropic](https://www.anthropic.com/engineering/contextual-retrieval)
- [Effective Context Engineering for AI Agents - Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Optimizing RAG with Hybrid Search & Reranking - Superlinked](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)
- [Reasoning Agentic RAG Survey](https://arxiv.org/html/2506.10408v1)
- [Self-RAG Project](https://selfrag.github.io/)
- [HyDE - Zilliz](https://zilliz.com/learn/improve-rag-and-information-retrieval-with-hyde-hypothetical-document-embeddings)
- [Chain-of-Retrieval](https://arxiv.org/html/2501.14342v1)
