import { runInitCommand } from "./commands/init.ts";
import { runResolveCommand } from "./commands/resolve.ts";
import { runResumeCommand } from "./commands/resume.ts";
import { runReviewCommand } from "./commands/review.ts";
import { CLI_COMMANDS } from "./lib/constants.ts";

export async function runCli(argv) {
  const { command, options } = parseArgs(argv);

  if (command === "help") {
    process.stdout.write(`${formatHelp()}\n`);
    return;
  }

  if (command === CLI_COMMANDS.INIT) {
    await runInitCommand();
    return;
  }

  if (command === CLI_COMMANDS.REVIEW) {
    await runReviewCommand(options);
    return;
  }

  if (command === CLI_COMMANDS.RESOLVE) {
    await runResolveCommand();
    return;
  }

  if (command === CLI_COMMANDS.RESUME) {
    await runResumeCommand();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function formatHelp() {
  return [
    "Usage:",
    `  roboreviewer ${CLI_COMMANDS.INIT}`,
    `  roboreviewer ${CLI_COMMANDS.REVIEW} <commit-ish> [--docs <path>] [--verbose]`,
    `  roboreviewer ${CLI_COMMANDS.REVIEW} --last [--docs <path>] [--verbose]`,
    `  roboreviewer ${CLI_COMMANDS.RESOLVE}`,
    `  roboreviewer ${CLI_COMMANDS.RESUME}`,
  ].join("\n");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    return { command: "help", options: {} };
  }

  if (command === CLI_COMMANDS.REVIEW) {
    return {
      command,
      options: parseReviewArgs(rest),
    };
  }

  return {
    command,
    options: {},
  };
}

function parseReviewArgs(rest) {
  let selector = null;
  let last = false;
  let docsOverride = null;
  let verbose = false;

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--last") {
      last = true;
    } else if (value === "--verbose") {
      verbose = true;
    } else if (value === "--docs") {
      docsOverride = rest[index + 1] ?? null;
      index += 1;
    } else if (!selector) {
      selector = value;
    } else {
      throw new Error(`Unexpected argument: ${value}`);
    }
  }

  if (last && selector) {
    throw new Error("Use either <commit-ish> or --last, not both.");
  }

  if (!last && !selector) {
    throw new Error("review requires <commit-ish> or --last.");
  }

  return {
    selector,
    last,
    docsOverride,
    verbose,
  };
}
