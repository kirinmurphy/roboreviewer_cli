import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./system/fs.ts";
import { INTERNAL_CONFIG } from "./internal-config.ts";
import { filterRelevantDocs } from "./docs-filter.ts";

const SECRET_PATTERNS = [
  /api[_-]?key/gi,
  /token/gi,
  /password/gi,
  /secret/gi,
];

export async function loadDocumentationContext({ cwd, docsPath, maxDocsBytes }) {
  if (!docsPath) {
    return { docsText: "", files: [], totalBytes: 0 };
  }

  const fullPath = path.isAbsolute(docsPath) ? docsPath : path.join(cwd, docsPath);
  if (!(await pathExists(fullPath))) {
    throw new Error(`Docs file or folder path does not exist: ${docsPath}`);
  }

  const files = await collectFiles(fullPath);
  let totalBytes = 0;
  let docsText = "";

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    totalBytes += Buffer.byteLength(raw, "utf8");
    if (totalBytes > maxDocsBytes) {
      throw new Error(`Documentation exceeds context.max_docs_bytes (${maxDocsBytes}).`);
    }
    const relativePath = path.relative(cwd, filePath);
    docsText += `<documentation path="${relativePath}">\n${redactSecrets(raw)}\n</documentation>\n\n`;
  }

  return { docsText: docsText.trim(), files: files.map((filePath) => path.relative(cwd, filePath)), totalBytes };
}

/**
 * Load documentation context with smart filtering based on changed files and symbols.
 * This reduces token usage by only including relevant documentation sections.
 */
export async function loadFilteredDocumentationContext({
  cwd,
  docsPath,
  maxDocsBytes,
  changedFiles,
  diffText,
}: {
  cwd: string;
  docsPath: string | null;
  maxDocsBytes: number;
  changedFiles: string[];
  diffText?: string;
}) {
  // Load full documentation first
  const fullDocs = await loadDocumentationContext({ cwd, docsPath, maxDocsBytes });

  // If no changed files or docs are already under limit, return as-is
  if (changedFiles.length === 0 || fullDocs.totalBytes <= maxDocsBytes) {
    return fullDocs;
  }

  // Apply smart filtering (file-based + symbol-aware)
  const filteredDocsText = filterRelevantDocs({
    docsText: fullDocs.docsText,
    changedFiles,
    maxDocsBytes,
    diffText,
  });

  return {
    docsText: filteredDocsText,
    files: fullDocs.files,
    totalBytes: Buffer.byteLength(filteredDocsText, "utf8"),
  };
}

async function collectFiles(targetPath) {
  const stats = await fs.stat(targetPath);
  if (stats.isFile()) {
    return isSupportedDocumentationFile(targetPath) ? [targetPath] : [];
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && isSupportedDocumentationFile(entry.name)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function isSupportedDocumentationFile(filePath: string) {
  return INTERNAL_CONFIG.docs.supportedExtensions.some((extension) => filePath.endsWith(extension));
}

function redactSecrets(input) {
  return SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, "[REDACTED]"), input);
}
