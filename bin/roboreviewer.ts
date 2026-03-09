#!/usr/bin/env -S node --experimental-strip-types

import { runCli } from "../src/cli.ts";

runCli(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
