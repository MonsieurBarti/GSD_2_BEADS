import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { newProject } from "./commands/new-project.js";
import { runMilestone } from "./commands/milestone.js";
import { runPlanPhase } from "./commands/plan-phase.js";
import { runExecutePhase } from "./commands/execute-phase.js";

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
    { name: "milestone", description: "Manage milestones (create/list/complete)" },
    { name: "plan-phase", description: "Plan a phase (discuss/create-tasks)" },
    { name: "execute-phase", description: "Execute phase tasks (start/run/finish)" },
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
  try {
    const output = execFileSync("bd", ["stats"], { encoding: "utf-8" }).trim();
    if (json) {
      const ready = execFileSync("bd", ["ready", "--json"], { encoding: "utf-8" }).trim();
      console.log(JSON.stringify({ status: "ok", stats: output, ready: JSON.parse(ready) }));
    } else {
      console.log(output);
    }
  } catch {
    if (json) {
      console.log(JSON.stringify({ status: "ok", message: "No project initialized" }));
    } else {
      console.log("No project initialized. Run gsd2b init to get started.");
    }
  }
}

export async function main(args: string[]): Promise<void> {
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
    case "new-project":
    case "init":
      await newProject(args);
      break;
    case "milestone":
      await runMilestone(args);
      break;
    case "plan-phase":
      await runPlanPhase(args);
      break;
    case "execute-phase":
      await runExecutePhase(args);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp(json);
      process.exitCode = 1;
      break;
  }
}
