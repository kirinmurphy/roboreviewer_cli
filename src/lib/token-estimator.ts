/**
 * Estimates token count for text.
 * Uses a rough heuristic: 1 token ≈ 4 characters on average.
 * This is approximate but good enough for tracking purposes.
 */
export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  // Average: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Estimates tokens for a request object by serializing it.
 */
export function estimateRequestTokens(request: any): number {
  const serialized = typeof request === "string" ? request : JSON.stringify(request);
  return estimateTokens(serialized);
}

/**
 * Get byte size of text
 */
export function getByteSize(text: string): number {
  return Buffer.byteLength(text, "utf8");
}
