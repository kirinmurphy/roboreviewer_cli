import { CONFIG_PATH } from "../constants.ts";
import { INTERNAL_CONFIG } from "../internal-config.ts";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  blue: "\u001B[34m",
  magenta: "\u001B[35m",
  cyan: "\u001B[36m",
  gray: "\u001B[90m",
} as const;

export function renderInitBanner() {
  return [
    "",
    renderSectionHeader({ title: INTERNAL_CONFIG.cli.init.wizardTitle, tone: "cyan" }),
    `${formatStageLabel({ label: "Goal" })} Configure ${colorize({ text: "roboreviewer", tone: "cyan", bold: true })} for this repository.`,
    "",
  ].join("\n");
}

export function renderInitSection({ title, tone = "blue" }: { title: string; tone?: Tone }) {
  return `${renderSectionHeader({ title, tone })}\n\n`;
}

export function renderInitStatus({ message }: { message: string }) {
  return `${colorize({ text: "[roboreviewer]", tone: "gray", bold: true })} ${message}\n`;
}

export function renderInitWarning({ message }: { message: string }) {
  return `${indent(1)}${colorize({ text: "Warning:", tone: "yellow", bold: true })} ${message}\n`;
}

export function renderInitError({ message }: { message: string }) {
  return `${indent(1)}${colorize({ text: "Error:", tone: "red", bold: true })} ${message}\n`;
}

export function renderInitConfirmation({ installedTools }: { installedTools: any[] }) {
  const lines = [
    "",
    renderSectionHeader({ title: INTERNAL_CONFIG.cli.init.readyTitle, tone: "green" }),
    `${formatStageLabel({ label: "Config" })} ${CONFIG_PATH}`,
    colorize({ text: "-".repeat(INTERNAL_CONFIG.cli.sectionDividerWidth), tone: "gray" }),
  ];

  if (installedTools.length === 0) {
    lines.push("No third-party CLIs were installed during this setup run.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`${indent(1)}${colorize({ text: "Installed during setup", tone: "green", bold: true })}`);
  for (const tool of installedTools) {
    lines.push(`${indent(2)}${tool.displayName}`);
    if (tool.verifyCommand) {
      lines.push(`${indent(3)}${formatStageLabel({ label: "Check" })} ${tool.verifyCommand}`);
    }
    if (tool.launchCommand) {
      lines.push(`${indent(3)}${formatStageLabel({ label: "Launch" })} ${tool.launchCommand}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function renderSectionHeader({ title, tone }: { title: string; tone: Tone }) {
  const divider = "=".repeat(INTERNAL_CONFIG.cli.sectionDividerWidth);
  return [
    colorize({ text: divider, tone: "gray" }),
    colorize({ text: title, tone, bold: true }),
    colorize({ text: divider, tone: "gray" }),
  ].join("\n");
}

function formatStageLabel({ label }: { label: string }) {
  return colorize({ text: `${label}:`, tone: "gray", bold: true });
}

function colorize({ text, tone, bold = false }: { text: string; tone: Tone; bold?: boolean }) {
  if (!process.stdout.isTTY) {
    return text;
  }

  const parts = [];
  if (bold) {
    parts.push(ANSI.bold);
  }
  parts.push(ANSI[tone]);
  parts.push(text);
  parts.push(ANSI.reset);
  return parts.join("");
}

function indent(level: number) {
  return "  ".repeat(level);
}

type Tone = "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "gray";
