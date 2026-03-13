import path from "node:path";

/**
 * Filters documentation to only include sections relevant to changed files and symbols.
 * This significantly reduces token usage by eliminating irrelevant context.
 */
export function filterRelevantDocs({
  docsText,
  changedFiles,
  maxDocsBytes,
  diffText,
}: {
  docsText: string;
  changedFiles: string[];
  maxDocsBytes: number;
  diffText?: string;
}): string {
  if (!docsText || changedFiles.length === 0) {
    return docsText;
  }

  // Extract symbols from diff for more targeted filtering
  const changedSymbols = diffText ? extractSymbolsFromDiff(diffText) : [];

  // Split docs into sections (by headers or blank lines)
  const docSections = splitDocsBySection(docsText);

  // Score each section by relevance to changed files and symbols
  const scoredSections = docSections.map(section => ({
    section,
    score: calculateRelevance(section, changedFiles, changedSymbols),
  }));

  // Sort by relevance (highest first)
  scoredSections.sort((a, b) => b.score - a.score);

  // Include sections until we hit the byte limit
  const includedSections: string[] = [];
  let totalBytes = 0;

  for (const { section, score } of scoredSections) {
    // Skip sections with zero relevance
    if (score === 0) {
      continue;
    }

    const sectionBytes = Buffer.byteLength(section, "utf8");

    // Stop if adding this section would exceed limit
    if (totalBytes + sectionBytes > maxDocsBytes) {
      break;
    }

    includedSections.push(section);
    totalBytes += sectionBytes;
  }

  // If we have no relevant sections, return a truncated version of original docs
  if (includedSections.length === 0) {
    return truncateToBytes(docsText, maxDocsBytes);
  }

  return includedSections.join("\n\n");
}

/**
 * Splits documentation into logical sections based on markdown headers
 * or multiple consecutive blank lines.
 */
function splitDocsBySection(docsText: string): string[] {
  const sections: string[] = [];
  const lines = docsText.split("\n");
  let currentSection: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line is a markdown header (starts with #)
    const isHeader = /^#{1,6}\s+/.test(line);

    // If we hit a header and have content, save current section and start new one
    if (isHeader && currentSection.length > 0) {
      sections.push(currentSection.join("\n").trim());
      currentSection = [line];
    } else {
      currentSection.push(line);
    }
  }

  // Add the final section
  if (currentSection.length > 0) {
    sections.push(currentSection.join("\n").trim());
  }

  return sections.filter(s => s.length > 0);
}

/**
 * Extracts symbols (functions, classes, constants, variables) from a git diff
 */
function extractSymbolsFromDiff(diffText: string): string[] {
  const symbols = new Set<string>();
  const lines = diffText.split("\n");

  for (const line of lines) {
    // Only look at added or modified lines
    if (!line.startsWith("+") && !line.startsWith("-")) {
      continue;
    }

    // Remove the +/- prefix
    const content = line.substring(1);

    // Match function declarations: function foo(), async function bar(), const baz = () =>
    const functionMatches = content.matchAll(/(?:function|async\s+function)\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*(?:async\s*)?\(/g);
    for (const match of functionMatches) {
      const name = match[1] || match[2] || match[3];
      if (name && name.length > 2) {
        symbols.add(name);
      }
    }

    // Match class declarations: class Foo, export class Bar
    const classMatches = content.matchAll(/(?:export\s+)?class\s+(\w+)/g);
    for (const match of classMatches) {
      if (match[1] && match[1].length > 2) {
        symbols.add(match[1]);
      }
    }

    // Match constants: const FOO = ..., export const BAR =
    const constMatches = content.matchAll(/(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=/g);
    for (const match of constMatches) {
      if (match[1] && match[1].length > 2) {
        symbols.add(match[1]);
      }
    }

    // Match interface/type declarations: interface Foo, type Bar =
    const typeMatches = content.matchAll(/(?:export\s+)?(?:interface|type)\s+(\w+)/g);
    for (const match of typeMatches) {
      if (match[1] && match[1].length > 2) {
        symbols.add(match[1]);
      }
    }
  }

  return Array.from(symbols);
}

/**
 * Calculates how relevant a documentation section is to the changed files and symbols.
 * Higher scores = more relevant.
 */
function calculateRelevance(docSection: string, changedFiles: string[], changedSymbols: string[] = []): number {
  let score = 0;
  const lowerSection = docSection.toLowerCase();

  for (const file of changedFiles) {
    const fileName = path.basename(file);
    const fileNameNoExt = path.basename(file, path.extname(file));
    const dirName = path.dirname(file);

    // Exact file path mention (very high relevance)
    if (lowerSection.includes(file.toLowerCase())) {
      score += 20;
    }

    // File name mention (high relevance)
    if (lowerSection.includes(fileName.toLowerCase())) {
      score += 15;
    }

    // File name without extension (medium-high relevance)
    if (lowerSection.includes(fileNameNoExt.toLowerCase())) {
      score += 10;
    }

    // Directory name mention (medium relevance)
    if (dirName !== "." && lowerSection.includes(dirName.toLowerCase())) {
      score += 5;
    }

    // Extract key terms from filename and check for matches
    const fileTerms = extractTerms(fileNameNoExt);
    for (const term of fileTerms) {
      // Use word boundaries to avoid false matches
      const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
      if (regex.test(docSection)) {
        score += 3;
      }
    }
  }

  // Symbol-aware filtering: boost sections mentioning changed symbols
  for (const symbol of changedSymbols) {
    // Check for exact symbol mention with word boundaries
    const symbolRegex = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "i");
    if (symbolRegex.test(docSection)) {
      // High score for symbol matches - these are very targeted
      score += 25;
    }

    // Also check for camelCase/snake_case variants
    const variants = generateSymbolVariants(symbol);
    for (const variant of variants) {
      const variantRegex = new RegExp(`\\b${escapeRegExp(variant)}\\b`, "i");
      if (variantRegex.test(docSection)) {
        score += 15;
      }
    }
  }

  // Boost sections that appear to be architectural or overview docs
  if (/\b(architecture|overview|getting started|introduction)\b/i.test(docSection)) {
    score += 5;
  }

  return score;
}

/**
 * Generate naming variants of a symbol to catch different documentation styles
 * e.g., filterAuditFindings -> ["filter_audit_findings", "filter-audit-findings"]
 */
function generateSymbolVariants(symbol: string): string[] {
  const variants = new Set<string>();

  // Split camelCase into words
  const words = symbol
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .map(w => w.toLowerCase());

  if (words.length > 1) {
    // snake_case
    variants.add(words.join("_"));
    // kebab-case
    variants.add(words.join("-"));
    // space separated
    variants.add(words.join(" "));
  }

  return Array.from(variants);
}

/**
 * Extracts meaningful terms from a filename or text.
 * Splits on camelCase, PascalCase, kebab-case, snake_case.
 */
function extractTerms(text: string): string[] {
  return text
    // Split on capital letters (camelCase/PascalCase)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Split on hyphens, underscores, dots
    .split(/[-_.]/g)
    .map(term => term.trim().toLowerCase())
    .filter(term => term.length > 2);  // Ignore very short terms
}

/**
 * Escapes special regex characters for safe use in RegExp constructor
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Truncates text to fit within a byte limit, trying to break at word boundaries.
 */
export function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return text;
  }

  // Binary search for the right cutoff point
  let low = 0;
  let high = text.length;
  let result = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.substring(0, mid);
    const bytes = Buffer.byteLength(candidate, "utf8");

    if (bytes <= maxBytes) {
      result = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Try to break at last word boundary
  const lastSpace = result.lastIndexOf(" ");
  const lastNewline = result.lastIndexOf("\n");
  const breakPoint = Math.max(lastSpace, lastNewline);

  if (breakPoint > result.length * 0.9) {
    // Only break at word boundary if we're close to the end
    result = result.substring(0, breakPoint);
  }

  return result + "\n\n[Documentation truncated to fit token limit]";
}
