const REDACTION_PATTERNS = [
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b/g,
  /\bgh[pousr]_[A-Za-z0-9]+\b/g,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
  /\b(?:password|secret|token)\s*[:=]\s*["'][^"']+["']/gi,
];

export function redactText(input) {
  let count = 0;
  const redacted = REDACTION_PATTERNS.reduce((value, pattern) => {
    return value.replace(pattern, (match) => {
      count += 1;
      return "[REDACTED_SECRET]";
    });
  }, input);
  return { text: redacted, count };
}
