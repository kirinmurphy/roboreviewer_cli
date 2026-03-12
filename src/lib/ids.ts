export function createSessionId() {
  return new Date().toISOString().replaceAll(":", "-");
}

export function findingId({
  scanIteration,
  index,
  reviewerTool,
}: {
  scanIteration: number;
  index: number;
  reviewerTool: string;
}) {
  validateFindingIdPart({ value: scanIteration, label: "scanIteration" });
  validateFindingIdPart({ value: index, label: "index" });
  const numericId = scanIteration * 1000 + index;
  return `f-${String(numericId).padStart(4, "0")}-${normalizeIdSuffix({ value: reviewerTool })}`;
}

export function conflictId(index) {
  return `c-${String(index).padStart(3, "0")}`;
}

function validateFindingIdPart({ value, label }: { value: number; label: string }) {
  if (!Number.isInteger(value) || value < 1 || value > 999) {
    throw new Error(`${label} must be an integer between 1 and 999.`);
  }
}

function normalizeIdSuffix({ value }: { value: string }) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("reviewerTool must be a non-empty string.");
  }
  return normalized;
}
