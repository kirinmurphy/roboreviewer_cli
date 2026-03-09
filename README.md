# Roboreviewer

Roboreviewer is a command-line tool for running a small, structured AI review board inside a git repository.

Instead of asking one coding agent to both review and implement changes on its own, Roboreviewer coordinates:

- one **Director** agent, which can review and implement
- an optional second **Reviewer** agent, which can provide a second set of feedback
- optional audit tools such as **CodeRabbit**, which supplies extra advisory context

## What Problem It Solves

AI coding tools are fast, but they are not naturally disciplined. They can miss project rules, overconfidently suggest weak changes, or implement fixes without a clear review trail.

Roboreviewer adds structure around that process. It decides what code is being reviewed, loads the project context, asks agents to review the same target, tracks where they agree or disagree, applies consensus fixes automatically, and pauses for a human decision only when needed.

## How It Works

Roboreviewer has two phases.

**Phase 1: Automated review and implementation**

You point it at a commit range or just the latest commit. It gathers the diff, optionally loads project docs, optionally runs an audit tool, and asks the configured agents to review the same change set. Accepted findings are implemented automatically by the Director.

**Phase 2: Human resolution, only if needed**

If reviewers disagree and the disagreement survives pushback, Roboreviewer queues that item for a later decision. You resolve those one at a time in the terminal, and the Director applies only the disputed items you approved.

That means most of the flow is non-interactive, but the edge cases stay explicit and auditable.

## Typical Workflow

In practice, the experience is meant to feel like this:

1. Initialize the repository once with `roboreviewer init`.
2. Run `roboreviewer review --last` or `roboreviewer review <commit-ish>`.
3. Let the tool review the target, record findings, and implement consensus fixes.
4. If any disputes remain, run `roboreviewer resolve`.
5. If that resolve flow gets interrupted, run `roboreviewer resume`.

## Current Scope

This repository currently implements the v1 command set:

- `roboreviewer init`
- `roboreviewer review <commit-ish>`
- `roboreviewer review --last`
- `roboreviewer resolve`
- `roboreviewer resume`

Supported agent adapters in this build:

- `codex`
- `claude-code`
- `mock`

Supported built-in audit tool:

- `coderabbit`

In the current implementation, CodeRabbit is advisory input only. Its output is passed to reviewers as context, but it does not become a first-class Roboreviewer finding on its own.
Its output is still persisted and reported separately so audit feedback does not disappear just because no reviewer adopted it.

## What Gets Written

Roboreviewer keeps two kinds of files inside the target repository.

**Committed configuration**

```text
.roboreviewer/config.json
```

This describes which tools are enabled and where optional project documentation should be loaded from.

**Runtime state**

```text
.roboreviewer/runtime/session.json
.roboreviewer/runtime/ROBOREVIEWER_SUMMARY.md
```

These files capture the current session, unresolved conflicts, final decisions, and the human-readable summary of the run. The runtime directory should not be committed.

## Safety Model

Roboreviewer is intentionally conservative in v1.

- It requires a clean working tree before a review run starts.
- It does not create branches automatically.
- It does not create commits automatically.
- It is designed to preserve resumable state when the human resolution flow is interrupted.

## Installing And Running It

If you are working directly from this repository, the easiest setup is:

```bash
npm link
roboreviewer init
```

If you do not want to link it globally, you can run it directly:

```bash
node --experimental-strip-types ./bin/roboreviewer.ts init
```

Inside a target repository, the normal first run is:

```bash
roboreviewer init
roboreviewer review --last
```

## Adapter Requirements

To use live agent adapters, the corresponding CLIs need to already exist and be authenticated on your machine.

`codex`

- `codex` CLI installed
- usable in non-interactive mode

`claude-code`

- `claude` CLI installed
- usable in `--print` mode

`coderabbit`

- `coderabbit` CLI installed if enabled in config

The `mock` adapter exists so the full workflow can still run end to end in a deterministic way during development and testing.

## Tests

Default test suite:

```bash
npm test
```

This exercises the deterministic mock workflow end to end.

Optional live adapter smoke tests:

```bash
npm run test:live:codex
npm run test:live:claude
npm run test:live:all
```

These are opt-in because they depend on local credentials, installed CLIs, and networked model access.

Linting:

```bash
npm run lint
```

Type checking:

```bash
npm run typecheck
```

Combined local verification:

```bash
npm run ci
```

## Packaging

This repository is already shaped like an npm CLI package through the `bin` entry in `package.json`.

That means:

- you can use it locally today via `npm link`
- it can be published later to npm
- after publishing, users will be able to run it through `npx`

This project is licensed under MIT.
