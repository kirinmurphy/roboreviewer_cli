import { renderReviewEvent } from "../../lib/output/review-output/index.ts";

export function createReviewWriter({ verbose }: { verbose: boolean }) {
  let transientAuditLineVisible = false;
  let lastRenderedBlock = false;

  return (event) => {
    if (isAuditStartEvent({ event })) {
      writeTransientAuditLine({ event });
      transientAuditLineVisible = true;
      return;
    }

    if (isAuditFinalEvent({ event })) {
      if (transientAuditLineVisible) {
        clearTransientAuditLine();
        transientAuditLineVisible = false;
      }
      process.stdout.write(renderReviewEvent({ event, verbose }));
      lastRenderedBlock = true;
      return;
    }

    if (transientAuditLineVisible) {
      clearTransientAuditLine();
      transientAuditLineVisible = false;
    }

    if (typeof event === "string" && lastRenderedBlock) {
      process.stdout.write("\n");
    }
    process.stdout.write(renderReviewEvent({ event, verbose }));
    lastRenderedBlock = typeof event !== "string";
  };
}

function clearTransientAuditLine() {
  if (!process.stdout.isTTY) {
    return;
  }

  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

function isAuditFinalEvent({ event }: { event: unknown }) {
  return typeof event !== "string" && (event as any)?.type === "audit_status" && (event as any).phase !== "starting";
}

function isAuditStartEvent({ event }: { event: unknown }) {
  return typeof event !== "string" && (event as any)?.type === "audit_status" && (event as any).phase === "starting";
}

function writeTransientAuditLine({ event }: { event: any }) {
  const text = `[roboreviewer] Audit: ${event.toolId} running...`;
  if (!process.stdout.isTTY) {
    process.stdout.write(`${text}\n`);
    return;
  }

  process.stdout.write(`\r${text}`);
}
