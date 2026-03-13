/**
 * Categorizes files in a PR for two-pass review of large PRs
 * Critical files get full review, routine files get summary review
 */

export interface FileCategory {
  file: string;
  category: "CRITICAL" | "SUSPICIOUS" | "ROUTINE";
  reason: string;
}

export interface CategorizationResult {
  critical: string[];
  suspicious: string[];
  routine: string[];
  stats: {
    totalFiles: number;
    criticalFiles: number;
    suspiciousFiles: number;
    routineFiles: number;
    criticalPercentage: number;
  };
}

/**
 * Categorize files for two-pass review
 */
export function categorizeFiles({
  changedFiles,
  diffText,
}: {
  changedFiles: string[];
  diffText: string;
}): CategorizationResult {
  const categories: FileCategory[] = changedFiles.map((file) => {
    const category = categorizeFile({ file, diffText });
    return { file, ...category };
  });

  const critical = categories.filter((c) => c.category === "CRITICAL").map((c) => c.file);
  const suspicious = categories.filter((c) => c.category === "SUSPICIOUS").map((c) => c.file);
  const routine = categories.filter((c) => c.category === "ROUTINE").map((c) => c.file);

  const criticalPercentage = (critical.length / changedFiles.length) * 100;

  return {
    critical,
    suspicious,
    routine,
    stats: {
      totalFiles: changedFiles.length,
      criticalFiles: critical.length,
      suspiciousFiles: suspicious.length,
      routineFiles: routine.length,
      criticalPercentage: Math.round(criticalPercentage),
    },
  };
}

/**
 * Categorize a single file
 */
function categorizeFile({
  file,
  diffText,
}: {
  file: string;
  diffText: string;
}): {
  category: "CRITICAL" | "SUSPICIOUS" | "ROUTINE";
  reason: string;
} {
  const lowerFile = file.toLowerCase();

  // CRITICAL: Security-related
  if (
    lowerFile.includes("auth") ||
    lowerFile.includes("security") ||
    lowerFile.includes("crypto") ||
    lowerFile.includes("password") ||
    lowerFile.includes("token") ||
    lowerFile.includes("session") ||
    lowerFile.includes("permission") ||
    lowerFile.includes("rbac") ||
    lowerFile.includes("oauth")
  ) {
    return { category: "CRITICAL", reason: "Security-sensitive file" };
  }

  // CRITICAL: Database/migrations
  if (
    lowerFile.includes("migration") ||
    lowerFile.includes("schema") ||
    lowerFile.endsWith(".sql") ||
    lowerFile.includes("database")
  ) {
    return { category: "CRITICAL", reason: "Database schema change" };
  }

  // CRITICAL: API contracts
  if (
    lowerFile.includes("api/") ||
    lowerFile.includes("/routes/") ||
    lowerFile.includes("/endpoints/") ||
    lowerFile.includes("graphql") ||
    lowerFile.includes("openapi") ||
    lowerFile.includes("swagger")
  ) {
    return { category: "CRITICAL", reason: "API contract change" };
  }

  // CRITICAL: Configuration
  if (
    lowerFile.includes("config") ||
    lowerFile.endsWith(".env") ||
    lowerFile.endsWith(".yml") ||
    lowerFile.endsWith(".yaml") ||
    lowerFile.endsWith(".json") ||
    lowerFile.includes("docker")
  ) {
    return { category: "CRITICAL", reason: "Configuration change" };
  }

  // ROUTINE: Test files
  if (
    lowerFile.includes("test") ||
    lowerFile.includes("spec") ||
    lowerFile.includes("__tests__") ||
    lowerFile.endsWith(".test.ts") ||
    lowerFile.endsWith(".test.js") ||
    lowerFile.endsWith(".spec.ts") ||
    lowerFile.endsWith(".spec.js")
  ) {
    // Unless the diff shows failing tests or TODO/FIXME
    if (containsSuspiciousTestChanges({ file, diffText })) {
      return { category: "SUSPICIOUS", reason: "Test changes need attention" };
    }
    return { category: "ROUTINE", reason: "Test file update" };
  }

  // ROUTINE: Documentation
  if (
    lowerFile.endsWith(".md") ||
    lowerFile.endsWith(".txt") ||
    lowerFile.includes("/docs/") ||
    lowerFile.includes("readme")
  ) {
    return { category: "ROUTINE", reason: "Documentation update" };
  }

  // ROUTINE: Generated files
  if (
    lowerFile.includes("generated") ||
    lowerFile.includes(".lock") ||
    lowerFile.includes("package-lock") ||
    lowerFile.includes("yarn.lock") ||
    lowerFile.includes("pnpm-lock")
  ) {
    return { category: "ROUTINE", reason: "Generated/lock file" };
  }

  // SUSPICIOUS: Error handling changes
  if (containsErrorHandlingChanges({ file, diffText })) {
    return { category: "SUSPICIOUS", reason: "Error handling modified" };
  }

  // SUSPICIOUS: TODO/FIXME comments
  if (containsTodoOrFixme({ file, diffText })) {
    return { category: "SUSPICIOUS", reason: "Contains TODO/FIXME" };
  }

  // SUSPICIOUS: Large changes
  if (isLargeChange({ file, diffText })) {
    return { category: "SUSPICIOUS", reason: "Large file change (>200 lines)" };
  }

  // Default to CRITICAL for implementation files
  return { category: "CRITICAL", reason: "Implementation file" };
}

/**
 * Check if test changes are suspicious
 */
function containsSuspiciousTestChanges({ file, diffText }: { file: string; diffText: string }): boolean {
  const fileDiff = extractFileDiff(file, diffText);
  const lower = fileDiff.toLowerCase();

  return (
    lower.includes("skip") ||
    lower.includes(".only") ||
    lower.includes("todo") ||
    lower.includes("fixme") ||
    lower.includes("failing")
  );
}

/**
 * Check if diff contains error handling changes
 */
function containsErrorHandlingChanges({ file, diffText }: { file: string; diffText: string }): boolean {
  const fileDiff = extractFileDiff(file, diffText);
  const addedLines = fileDiff.split("\n").filter((line) => line.startsWith("+"));

  const errorKeywords = ["try", "catch", "throw", "error", "exception", "reject"];

  return addedLines.some((line) => {
    const lower = line.toLowerCase();
    return errorKeywords.some((keyword) => lower.includes(keyword));
  });
}

/**
 * Check if diff contains TODO or FIXME
 */
function containsTodoOrFixme({ file, diffText }: { file: string; diffText: string }): boolean {
  const fileDiff = extractFileDiff(file, diffText);
  const addedLines = fileDiff.split("\n").filter((line) => line.startsWith("+"));

  return addedLines.some((line) => {
    const lower = line.toLowerCase();
    return lower.includes("todo") || lower.includes("fixme");
  });
}

/**
 * Check if this is a large change (>200 lines)
 */
function isLargeChange({ file, diffText }: { file: string; diffText: string }): boolean {
  const fileDiff = extractFileDiff(file, diffText);
  const changedLines = fileDiff.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;

  return changedLines > 200;
}

/**
 * Extract diff for a specific file
 */
function extractFileDiff(file: string, diffText: string): string {
  const lines = diffText.split("\n");
  let inFile = false;
  const fileDiffLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git") && line.includes(file)) {
      inFile = true;
      continue;
    }

    if (inFile) {
      if (line.startsWith("diff --git")) {
        break; // Hit next file
      }
      fileDiffLines.push(line);
    }
  }

  return fileDiffLines.join("\n");
}

/**
 * Check if two-pass review should be used
 */
export function shouldUseTwoPassReview({
  changedFiles,
  categorization,
}: {
  changedFiles: string[];
  categorization: CategorizationResult;
}): {
  shouldUse: boolean;
  reason: string;
} {
  const LARGE_PR_THRESHOLD = 50; // 50+ files = large PR
  const CRITICAL_RATIO_THRESHOLD = 60; // If >60% is critical, categorization didn't help

  // Too small for two-pass
  if (changedFiles.length < LARGE_PR_THRESHOLD) {
    return {
      shouldUse: false,
      reason: `PR is small enough (${changedFiles.length} files) for full review`,
    };
  }

  // Categorization didn't help much
  if (categorization.stats.criticalPercentage > CRITICAL_RATIO_THRESHOLD) {
    return {
      shouldUse: false,
      reason: `Most files are critical (${categorization.stats.criticalPercentage}%), full review needed`,
    };
  }

  return {
    shouldUse: true,
    reason: `Large PR (${changedFiles.length} files) with ${categorization.stats.routineFiles} routine files`,
  };
}
