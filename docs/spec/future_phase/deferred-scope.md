# Future Phase: Deferred Scope

This document captures Roboreviewer capabilities that should be deferred until after the initial proof-of-concept is validated.

The recommended v1 goal is narrower:

- Prove that a repository-scoped CLI can coordinate one Director and one optional Reviewer
- Run a commit-range-based review workflow
- Route disagreements into a deferred human-resolution flow
- Let the Director implement accepted outcomes safely

The items below are intentionally deferred because they add substantial implementation complexity without being required to validate the core product thesis.

These items were previously mixed into the PRD and technical reference. They are collected here so the first-iteration documents stay focused on MVP behavior.

## 1. Full-Codebase Review Mode

Defer:

- `roboreviewer review --all`
- Deterministic full-codebase file resolution
- Full-codebase file-count and byte-size guardrails
- `--include-glob` and `--exclude-glob` as a primary review mode feature
- Automatic exclusion policies for binary, secret, generated, and build-artifact paths during full-repo scans

Why defer it:

- Commit-range review is enough to validate the multi-agent review loop
- Full-repo scanning introduces prompt-size, performance, and UX complexity immediately
- It expands the testing surface before the core consensus flow is proven

## 2. Chunking and Chunk-Level Resume

Defer:

- Deterministic chunking for full-codebase review
- Sequential chunk processing across the repository
- Persisted chunk cursors
- Resume from partially completed chunked review runs

Why defer it:

- Chunking exists mainly to make `--all` feasible
- It introduces harder state-management and deduplication problems
- It is not necessary if v1 focuses on commit-range review

## 3. Generalized Audit Adapter Framework

Defer:

- Custom audit adapters with configurable command, args, input contract, and output contract
- Distinct validation rules for built-in vs custom audit adapters
- Broad adapter normalization rules for arbitrary external tools
- Audit-adapter degraded-mode reporting in session state and summary output

Why defer it:

- A proof-of-concept only needs to show that external findings can be incorporated
- A general plugin surface adds configuration, validation, parsing, and support burden early
- v1 can use zero audit tools or a single built-in integration

## 4. Advanced Deduplication

Defer:

- Semantic similarity matching for findings
- Cross-chunk deduplication logic
- More advanced merged-finding heuristics

Why defer it:

- Basic exact-match or location-based deduplication is enough for an early version
- Semantic dedupe is hard to make deterministic and explainable
- This becomes more important once chunking and additional reviewers are added

## 5. Full Automated-Loop Resume

Defer:

- Resume from every automated workflow phase
- Commit-backed checkpoints for every Director implementation pass
- Fine-grained crash recovery during review execution
- Resume based on phase cursors across the non-interactive loop

Why defer it:

- Resume during interactive conflict resolution is the highest-value case
- Full loop recovery introduces significant orchestration and git-state complexity
- The first version can require restarting `review` while still supporting `resume` resumption

## 6. Strict Determinism Controls

Defer:

- Model seed and temperature control guarantees across tools
- Strong reproducibility promises beyond deterministic ordering
- Stable summary fixture guarantees across all environments
- Deterministic chunk ordering and retry input guarantees

Why defer it:

- Ordering and explicit workflow state are enough for v1
- Cross-tool reproducibility may be hard to guarantee in practice
- Strong determinism claims create a testing and support burden early

## 7. Token and Cost Optimization Layer

Defer:

- Prompt caching
- Smart diff extraction and hunk-only review delivery
- `--max-tokens` circuit breaker
- Heuristic early exit based on issue density or no-op review outcomes
- Cost estimation and optimization logic
- Token budget enforcement and session cost exits

Why defer it:

- These are optimization features, not proof-of-concept features
- They complicate request construction, telemetry, and state reporting
- They are best designed after observing real usage patterns

## 8. Stalemate and Advanced Reliability Heuristics

Defer:

- Stalemate detection for repeated Director edits
- Advanced retry and cooldown reporting beyond basic retries
- Detailed degraded-mode reporting for edge-case failures
- Strong environment/version compatibility guarantees beyond basic capability checks

Why defer it:

- Basic retry behavior is sufficient to start
- More nuanced reliability controls should follow real failure data
- These features are easier to justify after first implementation feedback

## 9. Aggressive Performance SLOs

Defer:

- Tight latency guarantees for pre-flight, target resolution, resume, and HITL response
- End-to-end duration commitments for mid-size repositories
- Hard performance targets tied to guardrail limits

Why defer it:

- Performance targets are useful once architecture stabilizes
- Early implementation should optimize for correctness and usability first
- Premature SLO commitments can distort the initial design

## 10. Expanded Multi-Reviewer Future

Defer:

- More than one non-Director reviewer
- Reviewer voting or quorum logic
- Richer fanout and aggregation strategies
- Per-tool execution profiles or named invocation presets

Why defer it:

- One Director plus one optional Reviewer is enough to prove the consensus model
- Additional reviewers multiply orchestration and deduplication complexity
- The simpler topology is easier to validate with users

## Recommended v1 Scope

The initial implementation should stay focused on:

- `roboreviewer init`
- `roboreviewer review <commit-ish>`
- `roboreviewer resume`
- One Director and zero or one Reviewer
- Simple peer review and pushback routing
- Deferred human resolution for non-consensus findings
- One configured docs path
- Non-destructive git behavior
- Basic persisted state, especially for `resume`
