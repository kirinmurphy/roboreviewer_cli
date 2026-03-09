export function createSessionId() {
  return new Date().toISOString().replaceAll(":", "-");
}

export function findingId(index) {
  return `f-${String(index).padStart(3, "0")}`;
}

export function conflictId(index) {
  return `c-${String(index).padStart(3, "0")}`;
}
