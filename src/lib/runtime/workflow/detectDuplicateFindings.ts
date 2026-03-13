// Force ES module mode for Node.js --experimental-strip-types
export {};

/**
 * Detects potential duplicate findings using text similarity
 * to help reduce peer review load and improve token efficiency
 */

/**
 * Calculate simple text similarity score between two strings
 * Uses Jaccard similarity on word sets
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  if (words1.size === 0 && words2.size === 0) {
    return 1.0;
  }

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Calculate finding similarity score
 */
function calculateFindingSimilarity(finding1: any, finding2: any): number {
  // Different files = not duplicates (unless both are architectural/cross-cutting)
  const file1 = finding1.location?.file || finding1.file;
  const file2 = finding2.location?.file || finding2.file;

  if (file1 && file2 && file1 !== file2) {
    // Allow cross-file duplicates only if both are architectural concerns
    const isArchitectural1 = isArchitecturalFinding(finding1);
    const isArchitectural2 = isArchitecturalFinding(finding2);
    if (!isArchitectural1 || !isArchitectural2) {
      return 0;
    }
  }

  // Different categories = likely not duplicates
  if (finding1.category && finding2.category && finding1.category !== finding2.category) {
    return 0;
  }

  // Compare summary text
  const summary1 = finding1.summary || "";
  const summary2 = finding2.summary || "";
  const summarySimilarity = calculateTextSimilarity(summary1, summary2);

  // Compare recommendation text
  const rec1 = finding1.recommendation || "";
  const rec2 = finding2.recommendation || "";
  const recSimilarity = calculateTextSimilarity(rec1, rec2);

  // Weight summary more heavily than recommendation
  return summarySimilarity * 0.7 + recSimilarity * 0.3;
}

/**
 * Check if a finding is architectural/cross-cutting
 */
function isArchitecturalFinding(finding: any): boolean {
  const text = `${finding.summary || ""} ${finding.recommendation || ""}`.toLowerCase();
  const architecturalKeywords = [
    "architecture",
    "design pattern",
    "across",
    "throughout",
    "global",
    "system-wide",
    "consistency",
    "all files",
    "codebase",
  ];

  return architecturalKeywords.some((keyword) => text.includes(keyword));
}

export interface DuplicateInfo {
  /** The finding ID this might be a duplicate of */
  potentialDuplicateOf: string;
  /** Similarity score (0-1) */
  similarityScore: number;
}

/**
 * Detect potential duplicates among findings
 * Returns findings annotated with duplicate information
 */
export function detectDuplicateFindings(findings: any[]): any[] {
  const SIMILARITY_THRESHOLD = 0.75; // 75% similarity = potential duplicate

  return findings.map((finding, index) => {
    // Check against all previous findings
    let bestMatch: DuplicateInfo | null = null;

    for (let i = 0; i < index; i++) {
      const otherFinding = findings[i];
      const similarity = calculateFindingSimilarity(finding, otherFinding);

      if (similarity >= SIMILARITY_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.similarityScore) {
          bestMatch = {
            potentialDuplicateOf: otherFinding.finding_id,
            similarityScore: Math.round(similarity * 100) / 100,
          };
        }
      }
    }

    if (bestMatch) {
      return {
        ...finding,
        potential_duplicate_of: bestMatch.potentialDuplicateOf,
        similarity_score: bestMatch.similarityScore,
      };
    }

    return finding;
  });
}

/**
 * Get statistics about duplicate detection
 */
export function getDuplicateStats(findings: any[]): {
  total: number;
  potentialDuplicates: number;
  uniqueFindings: number;
} {
  const potentialDuplicates = findings.filter((f) => f.potential_duplicate_of).length;

  return {
    total: findings.length,
    potentialDuplicates,
    uniqueFindings: findings.length - potentialDuplicates,
  };
}
