export const INTERNAL_CONFIG = {
  tools: {
    agents: {
      codex: {
        displayName: "Codex CLI",
        command: "codex",
        verifyCommand: "codex --version",
        launchCommand: "codex",
        requiresAuthentication: true,
        authReminder:
          "Before running `roboreviewer review`, launch `codex` and complete its authentication flow.",
        installCommand: {
          command: "npm",
          args: ["install", "-g", "@openai/codex"],
        },
      },
      "claude-code": {
        displayName: "Claude Code CLI",
        command: "claude",
        verifyCommand: "claude --version",
        launchCommand: "claude",
        requiresAuthentication: true,
        authReminder:
          "Before running `roboreviewer review`, launch `claude` and complete its authentication flow.",
        installCommand: {
          command: "npm",
          args: ["install", "-g", "@anthropic-ai/claude-code"],
        },
      },
      mock: {
        displayName: "Mock Adapter",
        command: "",
        verifyCommand: "",
        launchCommand: "",
        requiresAuthentication: false,
        authReminder: "",
        installCommand: null,
      },
    },
    audit: {
      coderabbit: {
        displayName: "CodeRabbit CLI",
        command: "coderabbit",
        verifyCommand: "coderabbit --version",
        launchCommand: "coderabbit",
        requiresAuthentication: true,
        authReminder:
          "Before enabling CodeRabbit in review runs, authenticate the `coderabbit` CLI according to its local setup flow.",
        installCommand: {
          command: "sh",
          args: ["-c", "curl -fsSL https://cli.coderabbit.ai/install.sh | sh"],
        },
      },
    },
  },
  docs: {
    supportedExtensions: [".md", ".txt"],
  },
  findings: {
    categories: ["correctness", "security", "style", "performance"],
    severities: ["low", "medium", "high"],
  },
  summary: {
    unresolvedConflictsTitle: "## Unresolved Conflicts",
    resolvedDisputesTitle: "## Resolved Disputes",
    consensusFixesTitle: "## Consensus Fixes",
    discardedFindingsTitle: "## Discarded Findings",
    auditFindingsNotAdoptedTitle: "## Audit Findings Not Adopted",
    reviewLogTitle: "## Review Log",
    sessionStatsTitle: "## Session Stats",
  },
  cli: {
    sectionDividerWidth: 64,
    valueStyles: {
      ids: {
        tone: "green",
        bold: true,
      },
      severityBadges: {
        reviewer: {
          low: "blue",
          medium: "yellow",
          high: "red",
        },
        audit: {
          critical: "red",
          major: "yellow",
          minor: "blue",
          trivial: "cyan",
        },
      },
    },
    init: {
      wizardTitle: "Roboreviewer Setup Wizard",
      repositorySectionTitle: "Repository Context",
      agentsSectionTitle: "Agent Configuration",
      auditSectionTitle: "Audit Configuration",
      repositoryFilesSectionTitle: "Repository Files",
      authSectionTitle: "Authentication Checks",
      readyTitle: "Roboreviewer Is Ready",
    },
    review: {
      workflowTitle: "Review Workflow",
      auditTitle: "Audit Feedback",
      reviewerFindingsTitle: "Reviewer Findings",
      peerReviewTitle: "Peer Review",
      pushbackTitle: "Pushback Response",
      consensusTitle: "Consensus Summary",
      implementationTitle: "Implementation Result",
      completionTitle: "Review Complete",
    },
  },
  mockAdapter: {
    lowSeverityStyleCategory: "style",
    lowSeverityStyleSeverity: "low",
    withdrawableSummaryToken: "TODO or FIXME",
    reviewRules: [
      {
        key: "console_log",
        pattern: /^\+.*console\.log\(/,
        category: "style",
        severity: "low",
        summary: "Remove committed console.log debugging output",
        recommendation: "Delete the committed console.log statement.",
      },
      {
        key: "debugger",
        pattern: /^\+.*\bdebugger;?/,
        category: "correctness",
        severity: "medium",
        summary: "Remove committed debugger statement",
        recommendation: "Delete the committed debugger statement.",
      },
      {
        key: "todo",
        pattern: /^\+.*\b(?:TODO|FIXME)\b/,
        category: "style",
        severity: "low",
        summary: "Resolve TODO or FIXME marker before merging",
        recommendation: "Remove the TODO or FIXME marker from committed code.",
      },
    ],
  },
} as const;

export const FINDING_CATEGORY_LIST = INTERNAL_CONFIG.findings.categories.join("|");
export const FINDING_SEVERITY_LIST = INTERNAL_CONFIG.findings.severities.join("|");
