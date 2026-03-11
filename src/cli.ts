import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function getVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
  return pkg.version;
}

function printHelp(json: boolean): void {
  const commands = [
    { name: "help", description: "Show this help message" },
    { name: "version", description: "Print version" },
    { name: "status", description: "Show project status" },
  ];

  if (json) {
    console.log(JSON.stringify({ commands }));
  } else {
    console.log("gsd2b - GSD-2 with beads-backed state\n");
    console.log("Usage: gsd2b <command> [options]\n");
    console.log("Commands:");
    for (const cmd of commands) {
      console.log(`  ${cmd.name.padEnd(12)} ${cmd.description}`);
    }
    console.log("\nOptions:");
    console.log("  --json       Output in JSON format");
  }
}

function printVersion(json: boolean): void {
  const version = getVersion();
  if (json) {
    console.log(JSON.stringify({ version }));
  } else {
    console.log(`gsd2b v${version}`);
  }
}

function printStatus(json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ status: "ok", message: "No project initialized" }));
  } else {
    console.log("No project initialized. Run gsd2b init to get started.");
  }
}

export function main(args: string[]): void {
  const json = args.includes("--json");
  const command = args.find((a) => !a.startsWith("-")) ?? "help";

  switch (command) {
    case "help":
      printHelp(json);
      break;
    case "version":
      printVersion(json);
      break;
    case "status":
      printStatus(json);
      break;
    default:
      printHelp(json);
      process.exitCode = 1;
      break;
  }
}
