# Visioneer Memory Implementation Priorities
## Quick Reference Summary

---

## Priority Matrix

### CRITICAL PATH (Do First)

| # | Improvement | Impact | Effort | Phase |
|---|-------------|--------|--------|-------|
| 1 | **Memory Node Schema Extension** | HIGH | LOW | 1 |
| 2 | **Persistence Score (PS) Calculator** | HIGH | LOW | 1 |
| 3 | **Basic Decay Functions** | HIGH | LOW | 1 |
| 4 | **Hybrid Search (Semantic + BM25)** | HIGH | MEDIUM | 1 |
| 5 | **Typed Edge Taxonomy** | HIGH | MEDIUM | 2 |
| 6 | **Contradiction Detection** | HIGH | HIGH | 2 |
| 7 | **Context Assembly Pipeline** | HIGH | MEDIUM | 2 |

### HIGH VALUE (Do Next)

| # | Improvement | Impact | Effort | Phase |
|---|-------------|--------|--------|-------|
| 8 | **Graceful Degradation Tiers** | MEDIUM | MEDIUM | 2 |
| 9 | **Cross-Encoder Re-ranking** | MEDIUM | LOW | 3 |
| 10 | **Consolidation Job** | MEDIUM | HIGH | 3 |
| 11 | **Contextual Chunk Enrichment** | MEDIUM | LOW | 3 |
| 12 | **Provenance Tracking** | MEDIUM | LOW | 2 |

### OPTIMIZATION (Do Later)

| # | Improvement | Impact | Effort | Phase |
|---|-------------|--------|--------|-------|
| 13 | **Adaptive Retrieval Router** | MEDIUM | HIGH | 3 |
| 14 | **Progressive Disclosure** | LOW | MEDIUM | 4 |
| 15 | **Query Decomposition** | LOW | MEDIUM | 4 |
| 16 | **Spaced Repetition** | LOW | LOW | 4 |
| 17 | **Metrics Dashboard** | MEDIUM | MEDIUM | 4 |

---

## Top 5 Quick Wins

These provide maximum value with minimal implementation effort:

### 1. Add BM25 Keyword Search
**Expected Gain:** 20-30% better retrieval for exact terms
**Effort:** ~3 days
**Action:** Add BM25 index alongside embedding search, combine with RRF

### 2. Implement Decay Functions
**Expected Gain:** Principled forgetting, reduced memory bloat
**Effort:** ~2 days
**Action:** Add exponential decay for episodic, linear for semantic memories

### 3. Persistence Score Calculation
**Expected Gain:** Smart retention decisions
**Effort:** ~2 days
**Action:** Score memories by frequency, salience, connections, recency, importance

### 4. Contextual Chunk Headers
**Expected Gain:** 35-49% reduction in retrieval failures
**Effort:** ~2 days
**Action:** Prepend document context to chunks before embedding

### 5. Cross-Encoder Re-ranking
**Expected Gain:** 15-30% accuracy boost
**Effort:** ~1 day
**Action:** Add MiniLM re-ranker for top-100 → top-10 refinement

---

## Key Formulas Reference

### Persistence Score
```
PS = 0.25·F + 0.20·E + 0.25·C + 0.15·R + 0.15·I
```

### Exponential Decay
```
S(t) = S₀ × e^(-λt)
λ = 0.05 (14-day half-life, medium importance)
```

### Recency Score
```
R = e^(-days/30)
```

### Reciprocal Rank Fusion
```
RRF(d) = Σ 1/(60 + rank_i(d))
```

---

## Critical Thresholds

| Threshold | Default | Description |
|-----------|---------|-------------|
| Consolidation PS | 0.4 | Minimum PS to move to long-term |
| Archive Strength | 0.3 | Below this for 7 days → archive |
| Summarize Strength | 0.15 | Below this for 30 days → summarize |
| Forget Strength | 0.1 | Below this → queue for deletion |
| Contradiction Similarity | 0.85 | Semantic similarity to trigger check |

---

## New Relationship Types to Add

**Must Have:**
- `SUPPORTS` / `CONTRADICTS`
- `SUPERSEDES` / `SUPERSEDED_BY`
- `DEPENDS_ON` / `ENABLES`
- `LEARNED_FROM` / `APPLIED_IN`

**Should Have:**
- `IS_A` / `PART_OF`
- `PRECEDED_BY` / `FOLLOWED_BY`
- `QUALIFIES` / `REFINES`

---

## Memory Node Schema Extension

Add these fields to existing memory storage:

```
+ current_strength: float (0-1)
+ decay_function: enum
+ decay_rate: float
+ persistence_score: float
+ access_count: int
+ last_accessed: timestamp
+ valid_from: timestamp
+ valid_until: timestamp
+ source_confidence: float
+ status: enum (active/archived/summarized/tombstone)
+ superseded_by: string
+ conflicts_with: string[]
```

---

## Phase 1 Checklist (Weeks 1-4)

- [ ] Extend memory schema with new fields
- [ ] Implement exponential decay function
- [ ] Implement linear decay function
- [ ] Build persistence score calculator
- [ ] Add BM25 index
- [ ] Implement RRF score combination
- [ ] Add basic retrieval metrics logging

---

## Success Metrics

| Metric | Current (est.) | Target | Measurement |
|--------|----------------|--------|-------------|
| Retrieval Precision@10 | ~0.5 | >0.7 | Weekly sample evaluation |
| Memory Growth Rate | Unknown | <5%/day | Daily storage monitoring |
| Contradiction Detection | 0% | >80% | Test with known conflicts |
| Context Relevancy | Unknown | >0.8 | Sample query evaluation |

---

*Quick Reference Version 1.0*
