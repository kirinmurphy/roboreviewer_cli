# Roboreviewer

Roboreviewer is an automated code reviewer that marshalls numerous CLI tools into one coordnated CLI workflow for AI assisted code reviews.

Instead of manually interacting with several different AI tools for verifying code quality, Roboreviewer implements an automated workflow that captures and cross-references feedback across numerous tools.

## How it works

Roboreviewer:

- Collects feedback from static audit tools like Code Rabbit
- Feeds commits, audit tool feedback and README docs to >=1 CLI coding agents (codex, claude code) for analysis
- Cross references findings and applies a peer-review consensus mechanism to reinforce confidence in updates.
- Provides the option to have recommendations updated automatically or after user approval.
- Requires user to tie-break findings that did not reach consensus across tools.
- Employs primary "Director" agent to automatically update code based on consensus.
- Allows repeat smart scans to ensure fewer issues fall through the cracks.

---

```mermaid
flowchart TD
    commits["Code commit(s)"]
    audits["Audit tool(s) analysis<br>(Code rabbit, etc.)"]
    docs["Referenced README docs"]
    scope["Create review scope"]
    queueImpl["Queue finding<br>for implementation"]
    autoUpdate{"Auto<br>update<br>on?"}
    userQueue["Queue finding<br>for user review"]
    user{"User<br>decides"}
    implement["Implement finding(s)"]
    discard["Discard finding(s)"]

    subgraph R1[Reviewer 1 codex]
        direction TB
        review1["Initial review"]
        peer1["Peer review"]
        peerDecision1{"Agree w/<br>finding?"}
        pushback1["Analyze pushback"]
        pushbackDecision1{"Agree w/<br>pushback?"}
    end

    subgraph R2[Reviewer 2 claude-code]
        direction TB
        review2["Initial review"]
        peer2["Peer review"]
        peerDecision2{"Agree w/<br>finding?"}
        pushback2["Analyze pushback"]
        pushbackDecision2{"Agree w/<br>pushback?"}
    end

    commits --> scope
    audits --> scope
    docs --> scope
    scope --> review1
    scope --> review2
    review1 -- findings --> peer2
    review2 -- findings --> peer1
    peer1 --> peerDecision1
    peer2 --> peerDecision2
    peerDecision1 -- No --> pushback2
    peerDecision2 -- No --> pushback1
    pushback1 --> pushbackDecision1
    pushback2 --> pushbackDecision2
    pushbackDecision1 -- Yes --> discard
    pushbackDecision2 -- Yes --> discard
    pushbackDecision1 -- No --> userQueue
    pushbackDecision2 -- No --> userQueue
    userQueue --> user
    user -- Implement --> implement
    user -- Discard --> discard
    peerDecision1 -- Yes --> queueImpl
    peerDecision2 -- Yes --> queueImpl
    queueImpl --> autoUpdate
    autoUpdate -- Yes --> implement
    autoUpdate -- No --> user


    classDef data fill:#182235,stroke:#5f86c9,color:#dbe7ff,stroke-width:1.5px
    classDef orchestrator fill:#1b261d,stroke:#78a063,color:#e2f0dc,stroke-width:1.5px
    classDef reviewer1 fill:#2d2418,stroke:#c79a52,color:#f7ead2,stroke-width:1.5px
    classDef reviewer2 fill:#31211d,stroke:#cf8d74,color:#f9e4dc,stroke-width:1.5px
    classDef user fill:#241d30,stroke:#9d7ad6,color:#efe6ff,stroke-width:1.5px

    class commits,audits,docs data
    class scope,queueImpl,autoUpdate,userQueue,implement,discard orchestrator
    class review1,peer1,peerDecision1,pushback1,pushbackDecision1 reviewer1
    class review2,peer2,peerDecision2,pushback2,pushbackDecision2 reviewer2
    class user user

    style R1 fill:#1d1812,stroke:#c79a52,stroke-width:2px,color:#f7ead2
    style R2 fill:#211714,stroke:#cf8d74,stroke-width:2px,color:#f9e4dc
```

## Setup Instructions

Follow the instructions in [this doc](docs/setup-instructions.md) to set up Roboreviewer on your local machine.

## Commands

| Command                            | Purpose                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| `roboreviewer init`                | Initialize repository-local Roboreviewer configuration.              |
| `roboreviewer review <commit-ish>` | Review a specific commit range or target revision.                   |
| `roboreviewer review --last`       | Review the latest commit only.                                       |
| `roboreviewer resolve`             | Continue the human resolution flow for queued non-consensus items.   |
| `roboreviewer resume`              | Resume an interrupted review or resolution session from saved state. |

## Available CLI Tools

If you do not already have one of these tools installed, it will be installed when you select it.

Supported agent adapters in this build:

- `codex`
- `claude-code`
- `mock`

Supported built-in audit tool:

- `coderabbit`

## Initializing Repo

Running `roboreviewer init` creates the committed repository config:

```text
.roboreviewer/config.json
```

That file stores the selected tools, docs settings, and `autoUpdate`.

A typical init flow looks like this:

```text
========================================
Roboreviewer Init Wizard
========================================

Configure roboreviewer for this repository.

========================================
Repository
========================================

? Do you have a docs folder to provide global context for the reviewers? Yes
? Docs path docs
? Max docs bytes 200000

========================================
Agents
========================================

? Pick the main tool (Director) for reviews and updates codex (installed)
? Add a second reviewer? Yes
? Second reviewer tool claude-code (installed)

========================================
Audit Tools
========================================

? Enable CodeRabbit audit tool? No

? How would you like to implement review recommendations:
  > Have recommendations implemented automatically when all roboreviewers agree
    Manually review each recommendation and approve or deny each change

========================================
Authentication
========================================

? Have you already authenticated Codex on this machine? Yes
? Have you already authenticated Claude Code on this machine? Yes

========================================
Roboreviewer Is Ready
========================================

Config: .roboreviewer/config.json
Gitignore: Added .roboreviewer/
```

## Review Output

A review run writes runtime output here:

```text
.roboreviewer/runtime/session.json
.roboreviewer/runtime/ROBOREVIEWER_SUMMARY.md
```

`session.json` is the tool's full runtime state and source of truth for resume/resolve.
`ROBOREVIEWER_SUMMARY.md` is the human-readable summary derived from that session state.

This project is licensed under MIT.
