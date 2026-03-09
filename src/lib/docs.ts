import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./system/fs.ts";
import { INTERNAL_CONFIG } from "./internal-config.ts";

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
    throw new Error(`Docs path does not exist: ${docsPath}`);
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

async function collectFiles(targetPath) {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    if (
      entry.isFile() &&
      INTERNAL_CONFIG.docs.supportedExtensions.some((extension) => entry.name.endsWith(extension))
    ) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function redactSecrets(input) {
  return SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, "[REDACTED]"), input);
}
