# roboreviewer

`roboreviewer` is an automated code reviewer CLI that marshals numerous other CLI tools into one coordinated workflow for AI assisted reviews.

Instead of manually interacting with several different AI tools for verifying code quality, `roboreviewer` captures, cross-references, validates and implements feedback across numerous tools.

## How it works

`roboreviewer`:

- Collects findings from static audit tools like CodeRabbit
- Feeds commits, audit tool findings and README docs to >=1 CLI coding agents for analysis
- Applies a peer-review consensus mechanism to agent findings to reinfoce feedback confidence.
- Provides the option to have recommendations updated automatically or after user approval.
- Requires user to tie-break findings that did not reach consensus across agents.
- Employs primary "Director" agent to automatically update code based on consensus and user feedback.
- Allows repeat smart scans to prevent issues from falling through the cracks.

---

```mermaid
flowchart TD
    commits["Code commit(s)"]
    audits["Audit tool(s) analysis<br>(CodeRabbit, etc.)"]
    docs["Referenced README docs"]
    scope["Create review scope"]
    queueImpl["Queue finding<br>for implementation"]
    autoUpdate{"Auto<br>update<br>on?"}
    userQueue["Queue finding<br>for user review"]
    user{"User<br>decides"}
    implement["Implement finding(s)"]
    discard["Discard finding"]

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

Follow [these instructions](docs/setup-instructions.md) to set up `roboreviewer` on your local machine.

## Commands

| Command                            | Purpose                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `roboreviewer init`                | Initialize repository-specific `roboreviewer` configuration.                   |
| `roboreviewer review --last`       | Review the latest commit.                                                      |
| `roboreviewer review <commit-ish>` | Review a commit range from the included commit hash to the most recent commit. |
| `roboreviewer resume`              | Resume any paused review session from saved state.                             |

## Available CLI Tools

Supported agent adapters in this build:

- `codex`
- `claude-code`
- `mock`

Supported built-in audit tool:

- `coderabbit`

Any tools not already installed will be installed automatically if enabled during `roboreview init`.

## `roboreviewer init`

Running `roboreviewer init` triggers the init setup wizard for each repository:

  <div style="max-width: 700px; border: 1px solid #555; border-radius:8px; overflow:hidden;">
    <img src="docs/images/roboreviewer_init.png" alt="Roboreviewer init wizard"
  width="100%" />
  </div>

<br/>

and produces `.roboreviewer/config.json`

```json
{
  "schema_version": 1,
  "autoUpdate": false,
  "agents": {
    "director": {
      "tool": "codex"
    },
    "reviewers": [
      {
        "tool": "claude-code"
      }
    ]
  },
  "audit_tools": [
    {
      "id": "coderabbit",
      "enabled": true
    }
  ],
  "context": {
    "docs_path": "docs/spec/MVP",
    "max_docs_bytes": 200000
  }
}
```

Running `roboreview init` a second time requires confirmation to overwrite file with new configuration.

## `roboreviewer review`

Running `roboreviewer` triggers a review workflow

[EXAMPLE REVIEW CLI SCREENSHOTS PLACEHOLDER - coming soon]

and produces `.roboreviewer/runtime/session.json`

[EXAMPLE REVIEW session.json PLACEHOLDER - coming soon]

## License

This project is licensed under MIT.
