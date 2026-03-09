import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function clearDir(dirPath) {
  await ensureDir(dirPath);
  const entries = await fs.readdir(dirPath);
  await Promise.all(entries.map((entry) => fs.rm(path.join(dirPath, entry), { recursive: true, force: true })));
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonAtomic({ filePath, value }) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  await ensureDir(directory);
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function writeTextAtomic({ filePath, value }) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  await ensureDir(directory);
  await fs.writeFile(tempPath, value, "utf8");
  await fs.rename(tempPath, filePath);
}
