# Revised Requirements

This document captures implementation decisions made where the PRD or technical reference left behavior ambiguous.

## Decisions

1. The CLI implementation in this repository uses Node.js 22+ with no runtime dependencies, to keep installation and execution simple.
2. This build supports three adapter IDs for end-to-end execution: `claude-code`, `codex`, and `mock`.
3. `mock` is a deterministic local adapter added to make the full workflow runnable even when a live coding agent is unavailable or unsuitable for automated verification.
4. The `claude-code` adapter uses `claude --print --output-format json` plus a JSON-only response contract because the CLI does not expose a native output-schema flag equivalent to Codex.
5. `roboreviewer init` defaults to `codex` for the Director in this repository build, with `claude-code` and `mock` offered as explicit alternatives.
6. `roboreviewer init` defaults the optional docs path to `docs` when that directory exists; otherwise it leaves the docs path empty.
7. The v1 implementation performs deterministic exact-match deduplication before peer review when two findings share the same file, line, summary, and recommendation after whitespace normalization.
8. The built-in CodeRabbit integration is best-effort and shells out to `coderabbit review --plain`; its raw output is passed to reviewers as advisory context only.
9. The `mock` adapter only emits findings that it can also auto-remediate deterministically during implementation, so the full workflow stays internally consistent.
10. When a review run completes with unresolved conflicts, the session status is stored as `paused` until `resolve` or `resume` completes the human-in-the-loop flow.
11. Summary generation includes both unresolved and resolved disputed items so a resumed session remains auditable after conflicts are decided.
12. The `codex` live adapter uses `codex exec` with a JSON schema contract for structured review, peer-review, pushback, and implementation responses.
13. The `claude-code` implementation flow runs with `--permission-mode acceptEdits` and an explicit allowlist of edit and inspection tools so the Director can apply changes non-interactively.
14. Mock implementation resolves accepted findings by matching recorded evidence text when earlier accepted edits have shifted the original line numbers.
15. Claude adapter health checks and capability probes retry with an isolated runtime `HOME` when the local CLI fails only because it wants to write debug files outside the repository sandbox.
16. Live adapter integration tests are opt-in through environment variables so the default test suite remains deterministic, offline-friendly, and low-cost.
17. The npm package ships only the executable/runtime files plus `README.md` and `LICENSE`, and now uses the MIT license.
18. Audit-tool output remains outside the consensus engine, but individual audit items are now persisted separately in session state and listed in the summary when no reviewer adopts them.
19. Reviewer findings may optionally reference `related_audit_ids` so adopted audit feedback can be tracked without forcing audit tools into the pushback workflow.
20. The codebase now runs directly from `.ts` files via Node 22's `--experimental-strip-types` support instead of introducing a compile step as part of the initial TypeScript migration.
21. Repeated workflow strings such as command names, statuses, cursor phases, and human-decision values are centralized in constants before wider refactors.
22. Linting is implemented as a zero-dependency repository script that performs TypeScript syntax checks plus a small set of formatting checks.
23. GitHub Actions CI runs on pushes to `main` and on pull requests, and verifies `npm run lint`, `npm run typecheck`, and `npm test`.
24. `roboreviewer init` now checks whether selected third-party tools are available on `PATH`; for supported agent CLIs it may offer an immediate npm-based install attempt, while unavailable audit tools are disabled unless explicitly available.
25. Installing a live agent CLI during `roboreviewer init` is treated as separate from authentication; init now reminds users that Codex and Claude still require a manual local auth/login flow before review runs can succeed.
26. CodeRabbit is now treated the same way during init: when missing, the CLI may offer its official install script, but users are still reminded that installation does not complete CodeRabbit authentication/setup.
27. Re-running `roboreviewer init` no longer silently overwrites `.roboreviewer/config.json`; the CLI now asks for confirmation before replacing an existing config file.
28. After a successful init run, the CLI prints a separate readiness block that points users to `.roboreviewer/config.json` and, when setup installed any third-party CLIs, shows commands to verify and launch them.
29. When users choose the gitignore helper during init, the CLI now ignores the entire `.roboreviewer/` directory rather than only the runtime subdirectory.
30. The Codex adapter now targets the current `codex exec` CLI shape in this environment and no longer passes the removed `--ask-for-approval` flag.
