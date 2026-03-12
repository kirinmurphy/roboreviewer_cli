import { spawn } from "node:child_process";

type CommandOptions = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  allowedExitCodes?: number[];
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export function runCommand({
  command,
  args,
  cwd,
  env,
  input,
  allowedExitCodes = [],
}: CommandOptions): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdin.on("error", (error) => {
      if ("code" in error && error.code === "EPIPE") {
        return;
      }
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      if (code === 0 || allowedExitCodes.includes(code ?? -1)) {
        settled = true;
        resolve({ stdout, stderr, code: code ?? 0 });
        return;
      }

      settled = true;
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });

    if (input) {
      child.stdin.end(input);
      return;
    }
    child.stdin.end();
  });
}
