import test from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "../src/lib/system/shell.ts";

test("runCommand does not crash on EPIPE when a child exits before consuming stdin", async () => {
  await assert.rejects(
    () =>
      runCommand({
        command: "node",
        args: ["-e", "process.exit(1)"],
        input: "prompt text that may hit a closed stdin pipe",
      }),
    /exited with code 1/,
  );
});
