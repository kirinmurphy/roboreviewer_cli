import { type Prompter } from "../../lib/system/interactive.ts";

export function addQuestionSpacing({
  prompt,
}: {
  prompt: Prompter;
}): Prompter {
  return {
    async ask(message, defaultValue) {
      process.stdout.write("\n");
      return prompt.ask(message, defaultValue);
    },
    async confirm(message, defaultYes) {
      process.stdout.write("\n");
      return prompt.confirm(message, defaultYes);
    },
    async choose(message, options, defaultIndex) {
      process.stdout.write("\n");
      return prompt.choose(message, options, defaultIndex);
    },
    close() {
      return prompt.close();
    },
  };
}
