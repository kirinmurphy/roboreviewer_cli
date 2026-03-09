import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline";

type Prompter = {
  ask(message: string, defaultValue?: string): Promise<string>;
  confirm(message: string, defaultYes?: boolean): Promise<boolean>;
  choose(message: string, options: string[], defaultIndex?: number): Promise<string>;
  close(): Promise<void>;
};

export async function withPrompter<T>(callback: (prompter: Prompter) => Promise<T>): Promise<T> {
  const rl = readline.createInterface({ input, output });
  const askLine = (message: string): Promise<string> =>
    new Promise<string>((resolve) => {
      rl.question(message, resolve);
    });
  try {
    return await callback({
      async ask(message, defaultValue = "") {
        const suffix = defaultValue ? ` [${defaultValue}]` : "";
        const answer = await askLine(`${message}${suffix}: `);
        return answer.trim() || defaultValue;
      },
      async confirm(message, defaultYes = true) {
        const suffix = defaultYes ? " [Y/n]" : " [y/N]";
        const answer = (await askLine(`${message}${suffix}: `)).trim().toLowerCase();
        if (!answer) {
          return defaultYes;
        }
        return answer === "y" || answer === "yes";
      },
      async choose(message, options, defaultIndex = 0) {
        output.write(`${message}\n`);
        options.forEach((option, index) => {
          output.write(`  ${index + 1}. ${option}\n`);
        });
        const raw = await askLine(`Enter choice (default: ${defaultIndex + 1}): `);
        const index = raw.trim() ? Number(raw.trim()) - 1 : defaultIndex;
        if (!Number.isInteger(index) || index < 0 || index >= options.length) {
          throw new Error("Invalid selection.");
        }
        return options[index];
      },
      async close() {
        await rl.close();
      },
    });
  } finally {
    await rl.close();
  }
}
