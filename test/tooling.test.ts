import test from "node:test";
import assert from "node:assert/strict";
import { inspectToolAvailability } from "../src/lib/tooling.ts";

test("inspectToolAvailability reports built-in mock tool as available", async () => {
  const result = await inspectToolAvailability({
    tool: {
      displayName: "Mock Adapter",
      command: "",
      verifyCommand: "",
      launchCommand: "",
      requiresAuthentication: false,
      authReminder: "",
      installCommand: null,
    },
  });

  assert.equal(result.installed, true);
});

test("inspectToolAvailability reports a missing shell command as unavailable", async () => {
  const result = await inspectToolAvailability({
    tool: {
      displayName: "Missing Tool",
      command: "roboreviewer-definitely-missing-command",
      verifyCommand: "roboreviewer-definitely-missing-command --version",
      launchCommand: "roboreviewer-definitely-missing-command",
      requiresAuthentication: false,
      authReminder: "",
      installCommand: null,
    },
  });

  assert.equal(result.installed, false);
});
