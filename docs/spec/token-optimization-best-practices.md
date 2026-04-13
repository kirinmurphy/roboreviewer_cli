# Token Optimization Best Practices for LLM CLI Tools

**A practical guide to reducing AI costs by 70-90% without sacrificing quality**

---

## Table of Contents

1. [Why Token Optimization Matters](#why-token-optimization-matters)
2. [The Token Cost Problem](#the-token-cost-problem)
3. [Core Principles](#core-principles)
4. [Proven Optimization Strategies](#proven-optimization-strategies)
   - [Strategy 1: Send Only What's Needed](#strategy-1-send-only-whats-needed)
   - [Strategy 2: Filter Before Sending](#strategy-2-filter-before-sending)
   - [Strategy 3: Auto-Implement Simple Tasks](#strategy-3-auto-implement-simple-tasks)
   - [Strategy 4: Detect and Eliminate Duplicates](#strategy-4-detect-and-eliminate-duplicates)
   - [Strategy 5: Track Everything](#strategy-5-track-everything)
5. [Real-World Results](#real-world-results)
6. [Implementation Checklist](#implementation-checklist)
7. [Common Mistakes to Avoid](#common-mistakes-to-avoid)

---

## Why Token Optimization Matters

**Every word you send to an AI costs money.** If your tool reviews 100 pull requests per day, even small optimizations can save thousands of dollars per month.

**Example:**
- Before optimization: 500,000 tokens per review × $0.015 = **$7.50 per review**
- After optimization: 100,000 tokens per review × $0.015 = **$1.50 per review**
- **Savings: $6.00 per review** → $600/day for 100 reviews → **$18,000/month**

---

## The Token Cost Problem

LLM APIs charge per token (roughly 1 token = 4 characters). Costs add up when you:

1. **Send large context** (documentation, code diffs, previous findings)
2. **Make multiple calls** (multiple reviewers, peer review, implementation)
3. **Send redundant data** (same context to different agents)
4. **Include unnecessary information** (audit findings for files not changed)

**The solution:** Be strategic about what you send and when.

---

## Core Principles

### 1. Differential Context
**Don't send everything to everyone.**

- Initial reviewers need full context (code + docs)
- Peer reviewers only need findings to critique
- Implementation agents only need findings to fix

### 2. Smart Filtering
**Filter data before sending, not after.**

- Remove audit findings for unchanged files
- Filter documentation to relevant sections only
- Skip findings that are already fixed

### 3. Deduplication
**Don't review the same thing twice.**

- Merge identical findings from multiple reviewers
- Detect similar findings and flag them
- Avoid re-assessing what's already been decided

### 4. Automation First
**Let simple tools handle simple tasks.**

- Use static analyzers (CodeRabbit, ESLint) for style/formatting
- Auto-implement obvious fixes before expensive LLM review
- Reserve LLMs for complex judgment calls

### 5. Measure Everything
**You can't optimize what you don't measure.**

- Track tokens per phase (review, peer review, implementation)
- Monitor token usage trends over time
- Identify which phases consume the most tokens

---

## Proven Optimization Strategies

### Strategy 1: Send Only What's Needed

**Problem:** Sending full 150KB documentation + 50KB diff to every agent in every phase.

**Solution:** Send different context to different agents:

```
Phase 1: Initial Review
  ✓ Send: Full diff + filtered docs

Phase 2: Peer Review
  ✗ Don't send: Full diff or docs
  ✓ Send: Only findings to critique
  ✓ Give: Read-only file access (agents read what they need)

Phase 3: Implementation
  ✗ Don't send: Documentation (findings are self-contained)
  ✓ Send: Only findings to fix
```

**Impact:** 60-70% reduction in total tokens

**Implementation:**
```typescript
// BAD: Send everything to everyone upfront
await peerReview({ diff, docs, findings });

// GOOD: Send findings, let agent read files it needs
await peerReview({
  findings,
  // Agent has read-only file access
  // Reads only the specific files needed to verify findings
  // Typical usage: 5-10KB vs 50KB full diff
});
```

---

### Strategy 2: Filter Before Sending

**Problem:** Sending 50 audit findings when only 10 are relevant to changed files.

**Solution:** Pre-filter audit findings:

```typescript
function filterAuditFindings({ findings, changedFiles, diffText }) {
  return findings.filter(finding => {
    // Only include findings for changed files
    if (!changedFiles.includes(finding.file)) return false;

    // Skip findings that appear already fixed
    if (appearsFixed(finding, diffText)) return false;

    // Skip low-severity findings
    if (finding.severity === 'trivial') return false;

    return true;
  });
}
```

**Impact:** 10-20% reduction in audit context

**Real example:**
- Before: 50 audit findings → 25KB
- After: 12 audit findings → 6KB
- **Savings: 76%**

---

### Strategy 3: Auto-Implement Simple Tasks

**Problem:** LLMs waste tokens reviewing obvious fixes (missing semicolons, formatting, etc.).

**Solution:** Let static analyzers fix simple issues first, then review the updated code:

```
Step 1: Run CodeRabbit (static analysis)
  ↓ Finds 30 style/formatting issues

Step 2: Auto-implement eligible fixes
  ↓ Fixes 25 style issues in the working tree

Step 3: LLM reviews the cleaned-up code
  ↓ Focuses on logic/design, not formatting
```

**Impact:** 30-50% reduction (eliminates assessment of trivial issues)

**Configuration:**
```json
{
  "audit_tools": [{
    "id": "coderabbit",
    "enabled": true,
    "auto_implement": {
      "enabled": true,
      "min_severity": "minor"
    }
  }]
}
```

**Key insight:** Static analyzers are free (or cheap). LLMs are expensive. Use the right tool for the job.

---

### Strategy 4: Detect and Eliminate Duplicates

**Problem:** Two reviewers flag the same issue, both get sent for peer review.

**Solution:** Detect duplicates using text similarity:

```typescript
function detectDuplicates(findings) {
  return findings.map((finding, i) => {
    // Compare to previous findings
    for (let j = 0; j < i; j++) {
      const similarity = calculateSimilarity(finding, findings[j]);

      if (similarity > 0.75) {  // 75% similar
        finding.potential_duplicate_of = findings[j].id;
        finding.similarity_score = similarity;
      }
    }
    return finding;
  });
}

function calculateSimilarity(a, b) {
  // Simple word overlap (Jaccard similarity)
  const wordsA = new Set(a.summary.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.summary.toLowerCase().split(/\s+/));

  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return intersection / union;
}
```

**Impact:** 5-10% reduction by avoiding redundant peer review

**Example output:**
```
Finding f-005: "Add error handling for null user"
  ⚠️  Potential duplicate of f-003 (85% similar)
```

---

### Strategy 5: Track Everything

**Problem:** You don't know which phases are eating your tokens.

**Solution:** Track tokens per phase:

```typescript
session.token_usage = {
  total_input_tokens: 55000,
  total_output_tokens: 3500,
  by_phase: {
    review: {
      input_tokens: 50000,  // 91% of total!
      output_tokens: 2500,
      call_count: 2
    },
    peer_review: {
      input_tokens: 2500,   // 4% of total
      output_tokens: 500,
      call_count: 2
    },
    implement: {
      input_tokens: 1250,   // 2% of total
      output_tokens: 400,
      call_count: 1
    }
  }
};
```

**Display to users:**
```
Token Usage Summary
-------------------
Total Input:  55,000 tokens (220KB)
Total Output: 3,500 tokens (14KB)

By Phase:
  review        50,000 (91%) × 2 calls
  peer_review    2,500 (4%) × 2 calls
  implement      1,250 (2%) × 1 call
```

**Impact:** Visibility drives optimization

**Key insight:** Once you see that 91% of tokens go to initial review, you know where to optimize first.

---

## Real-World Results

### Roboreviewer Case Study

**Scenario:** 2-agent code review tool (50 files, 20KB diff, 150KB docs)

| Phase | Before | After | Savings |
|-------|--------|-------|---------|
| **Phase 1: Quick Wins** | 567KB | 400KB | 29% |
| - Remove diff from peer review | - | -40KB | - |
| - Remove docs from implementation | - | -50KB | - |
| - Reduce git diff context | - | -10KB | - |
| - Compact audit findings | - | -12KB | - |
| **Phase 2: CodeRabbit-First** | 400KB | 280KB | 30% |
| - Auto-implement audit findings first | - | -120KB | - |
| **Phase 3: Smart Filtering** | 280KB | 190KB | 32% |
| - Filter documentation by relevance | - | -60KB | - |
| - Pre-filter audit findings | - | -30KB | - |
| **Phase 4: Intelligence** | 190KB | 170KB | 11% |
| - Duplicate detection | - | -10KB | - |
| - File categorization (foundation) | - | -10KB | - |

**Overall:** 567KB → 170KB = **70% reduction**

**Cost impact:**
- Before: $7.50 per review
- After: $2.25 per review
- **$5.25 saved per review** × 100 reviews/day = **$525/day = $15,750/month**

---

## Implementation Checklist

### Phase 1: Measure (Week 1)
- [ ] Add token tracking to all LLM calls
- [ ] Display token usage in CLI output
- [ ] Log tokens by phase to identify hotspots
- [ ] Establish baseline metrics

### Phase 2: Quick Wins (Week 2)
- [ ] Remove redundant context from peer review
- [ ] Remove redundant context from implementation
- [ ] Compact audit findings to essential fields
- [ ] Reduce git diff context lines (3 → 1)

### Phase 3: Smart Filtering (Week 3)
- [ ] Implement documentation filtering by relevance
- [ ] Pre-filter audit findings to changed files
- [ ] Skip audit findings that appear already fixed
- [ ] Filter by severity threshold

### Phase 4: Automation (Week 4)
- [ ] Integrate static analysis tools
- [ ] Auto-implement simple fixes before LLM review
- [ ] Add user approval flow for auto-fixes
- [ ] Track auto-implementation savings

### Phase 5: Deduplication (Week 5)
- [ ] Implement finding similarity detection
- [ ] Flag potential duplicates for review
- [ ] Measure duplicate rate reduction

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Optimizing Output Instead of Input

**Wrong:**
```typescript
// Trying to make LLM responses shorter
prompt += "Be concise. Use short responses.";
```

**Right:**
```typescript
// Send less input
const relevantDocs = filterDocsByChangedFiles(docs, changedFiles);
await review({ docs: relevantDocs });  // 60% smaller input
```

**Why:** Input tokens cost the same as output tokens, but input is where the bulk of your costs are (90%+ in most cases).

---

### ❌ Mistake 2: Compressing Field Names

**Wrong:**
```json
{ "id": "f-001", "src": "r1", "rec": "..." }
```

**Right:**
```json
{ "finding_id": "f-001", "source_reviewer_id": "r1", "recommendation": "..." }
```

**Why:** 5-10% savings isn't worth making your session files unreadable. Instead, reduce fields or filter data.

---

### ❌ Mistake 3: Sacrificing Quality for Tokens

**Wrong:**
```typescript
// Skip peer review to save tokens
if (findings.length > 10) {
  skipPeerReview = true;  // ❌ Quality loss
}
```

**Right:**
```typescript
// Send less context to peer review
await peerReview({
  findings: compactFindings(findings)  // ✓ Same quality, fewer tokens
});
```

**Why:** Token optimization should never reduce quality. Focus on eliminating waste, not value.

---

### ❌ Mistake 4: Not Measuring

**Wrong:**
```typescript
// Guess at optimizations
await review({ docs: docs.substring(0, 50000) });  // Arbitrary limit
```

**Right:**
```typescript
// Measure, then optimize
const before = estimateTokens(docs);
const filtered = filterRelevantDocs(docs, changedFiles);
const after = estimateTokens(filtered);
console.log(`Filtered docs: ${before} → ${after} (-${100 - (after/before*100)}%)`);
```

**Why:** You can't improve what you don't measure. Data drives decisions.

---

### ❌ Mistake 5: Premature Optimization

**Wrong:**
```typescript
// Complex optimization before measuring
await parallelReviewByFile(...);  // Complex, not proven needed
```

**Right:**
```typescript
// Start with simple wins
await review({
  docs: filterDocs(docs),       // Simple, big impact
  findings: compactFindings(findings)  // Simple, big impact
});
```

**Why:** Get 70% savings from simple changes before adding complexity.

---

## Summary

**Token optimization is about being smart, not cheap:**

1. **Send only what each agent needs** - Differential context saves 60-70%
2. **Filter before sending** - Pre-filtering saves 10-20%
3. **Automate simple tasks** - Static analysis first saves 30-50%
4. **Detect duplicates** - Similarity detection saves 5-10%
5. **Measure everything** - Tracking drives continuous improvement

**Total potential savings: 70-90%**

**The golden rule:** Eliminate waste, not value. Every optimization should maintain or improve quality while reducing cost.

---

**Ready to implement?** Start with measurement (Phase 1), then tackle quick wins (Phase 2). You'll see 30-40% savings in the first week with minimal effort.

**Questions?** See [review_token_optimization.md](review_token_optimization.md) for Roboreviewer's detailed implementation.
