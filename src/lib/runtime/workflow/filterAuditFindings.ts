/**
 * Pre-filters audit findings before sending to LLM reviewers
 * to reduce token usage by eliminating noise and irrelevant findings.
 */

export interface AuditFindingFilter {
  /** Minimum severity to include (trivial, minor, major, critical) */
  minSeverity?: string;
  /** Only include findings in files that were changed */
  onlyChangedFiles?: boolean;
  /** Exclude findings that appear to be already fixed */
  excludeAlreadyFixed?: boolean;
}

export interface FilterResult {
  /** Filtered findings to send to LLMs */
  filtered: any[];
  /** Stats about what was filtered out */
  stats: {
    total: number;
    kept: number;
    removedBelowSeverity: number;
    removedNotInChangedFiles: number;
    removedAlreadyFixed: number;
  };
}

const SEVERITY_RANK = {
  trivial: 1,
  minor: 2,
  major: 3,
  critical: 4,
};

/**
 * Filters audit findings to reduce token usage
 */
export function filterAuditFindings({
  auditFindings,
  changedFiles,
  diffText,
  filter = {},
}: {
  auditFindings: any[];
  changedFiles: string[];
  diffText?: string;
  filter?: AuditFindingFilter;
}): FilterResult {
  const stats = {
    total: auditFindings.length,
    kept: 0,
    removedBelowSeverity: 0,
    removedNotInChangedFiles: 0,
    removedAlreadyFixed: 0,
  };

  const filtered = auditFindings.filter((finding) => {
    // Filter by severity
    if (filter.minSeverity) {
      const minRank = SEVERITY_RANK[filter.minSeverity] ?? 2;
      const findingRank = SEVERITY_RANK[finding.severity?.toLowerCase()] ?? 1;
      if (findingRank < minRank) {
        stats.removedBelowSeverity++;
        return false;
      }
    }

    // Filter by changed files
    if (filter.onlyChangedFiles !== false && changedFiles.length > 0) {
      const findingFile = finding.file || finding.location?.file;
      if (!findingFile) {
        // No file specified - keep it
        return true;
      }

      const isInChangedFiles = changedFiles.some((changedFile) => {
        // Exact match or finding file is within changed directory
        return (
          changedFile === findingFile ||
          changedFile.startsWith(findingFile + "/") ||
          findingFile.startsWith(changedFile + "/")
        );
      });

      if (!isInChangedFiles) {
        stats.removedNotInChangedFiles++;
        return false;
      }
    }

    // Filter out findings that appear already fixed
    if (filter.excludeAlreadyFixed !== false && diffText) {
      if (appearsAlreadyFixed({ finding, diffText })) {
        stats.removedAlreadyFixed++;
        return false;
      }
    }

    return true;
  });

  stats.kept = filtered.length;

  return { filtered, stats };
}

/**
 * Heuristic check if a finding appears to be already addressed in the diff
 */
function appearsAlreadyFixed({
  finding,
  diffText,
}: {
  finding: any;
  diffText: string;
}): boolean {
  // Extract key terms from the finding
  const summary = finding.summary || finding.message || "";
  const recommendation = finding.recommendation || "";
  const text = `${summary} ${recommendation}`.toLowerCase();

  // If the finding mentions specific code patterns, check if they're in the diff
  const patterns = extractCodePatterns(text);
  if (patterns.length === 0) {
    return false;
  }

  // Check if the diff contains lines that address this finding
  // Look for added lines (starting with +) that contain the recommended changes
  const addedLines = diffText
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.substring(1).toLowerCase());

  // If multiple patterns from the recommendation appear in added lines,
  // this finding is likely already fixed
  const matchCount = patterns.filter((pattern) =>
    addedLines.some((line) => line.includes(pattern))
  ).length;

  // Consider it fixed if > 50% of patterns are in added lines and we have at least 2 matches
  return matchCount >= 2 && matchCount / patterns.length > 0.5;
}

/**
 * Extract code patterns from finding text
 * E.g., "use try-catch" -> ["try", "catch"]
 */
function extractCodePatterns(text: string): string[] {
  const patterns: string[] = [];

  // Common code patterns
  const codeKeywords = [
    "async",
    "await",
    "try",
    "catch",
    "throw",
    "return",
    "const",
    "let",
    "var",
    "if",
    "else",
    "switch",
    "case",
    "for",
    "while",
    "function",
    "class",
    "import",
    "export",
    "default",
    "null",
    "undefined",
    "error",
    "promise",
  ];

  for (const keyword of codeKeywords) {
    if (text.includes(keyword)) {
      patterns.push(keyword);
    }
  }

  // Extract quoted strings (likely code snippets)
  const quotedMatches = text.match(/['"`]([^'"`]+)['"`]/g);
  if (quotedMatches) {
    for (const match of quotedMatches) {
      const cleaned = match.replace(/['"`]/g, "").toLowerCase();
      if (cleaned.length > 2) {
        patterns.push(cleaned);
      }
    }
  }

  return patterns;
}

/**
 * Get default filter settings based on config and context
 */
export function getDefaultAuditFilter({
  reviewerCount,
  changedFilesCount,
}: {
  reviewerCount: number;
  changedFilesCount: number;
}): AuditFindingFilter {
  return {
    // For single reviewer, include minor+; for multiple reviewers, include all
    minSeverity: reviewerCount === 1 ? "minor" : "trivial",

    // Always filter to changed files
    onlyChangedFiles: true,

    // Disable "already fixed" heuristic by default - too prone to false positives
    // Can be enabled explicitly if needed, but pattern matching is weak
    excludeAlreadyFixed: false,
  };
}

/**
 * Deduplicate audit findings across multiple tools
 * When CodeRabbit and ESLint flag the same file/issue, merge them
 */
export function deduplicateAuditFindings(findings: any[]): {
  deduplicated: any[];
  stats: {
    total: number;
    unique: number;
    duplicates: number;
  };
} {
  const deduped: any[] = [];
  const seen = new Map<string, any>();
  let duplicateCount = 0;

  for (const finding of findings) {
    const signature = createAuditFindingSignature(finding);

    if (!seen.has(signature)) {
      // First time seeing this issue
      seen.set(signature, {
        ...finding,
        merged_from_tools: [finding.tool_id],
      });
      deduped.push(seen.get(signature));
      continue;
    }

    // Duplicate found - merge it
    const existing = seen.get(signature);
    if (!existing.merged_from_tools.includes(finding.tool_id)) {
      existing.merged_from_tools.push(finding.tool_id);
    }
    duplicateCount++;
  }

  return {
    deduplicated: deduped,
    stats: {
      total: findings.length,
      unique: deduped.length,
      duplicates: duplicateCount,
    },
  };
}

/**
 * Create a signature for an audit finding to detect duplicates
 * Based on file location and summary content
 */
function createAuditFindingSignature(finding: any): string {
  const file = (finding.file || "").toLowerCase().trim();

  // Normalize summary: remove punctuation, lowercase, remove common words
  const summary = (finding.summary || finding.raw_text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .replace(/\s+/g, " ")
    .trim();

  // Extract meaningful words (skip common words like "the", "a", "in", etc.)
  const stopWords = new Set(["the", "a", "an", "in", "on", "at", "to", "for", "of", "is", "are", "be"]);
  const meaningfulWords = summary
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .sort() // Sort for consistency
    .join(" ");

  return `${file}:${meaningfulWords}`;
}
