/**
 * milestone command
 *
 * Supports the `create` subcommand to create a forge:milestone epic bead with
 * optional requirement linkage via validates dependencies.
 */

import { createEpic, addDep } from "../bead-helpers.js";

export interface MilestoneCreateFlags {
  title?: string;
  description?: string;
  reqs: string[];
}

const KNOWN_FLAGS = new Set(["--title", "--description", "--req"]);

function printUsage(): void {
  console.log("Usage: gsd2b milestone <subcommand> [options]\n");
  console.log("Subcommands:");
  console.log("  create    Create a new milestone\n");
  console.log("Options for create:");
  console.log("  --title <text>        Milestone title (required)");
  console.log("  --description <text>  Milestone description");
  console.log("  --req <id>            Requirement bead ID to validate (repeatable)");
  console.log("  --help                Show this help message");
}

function parseCreateFlags(args: string[]): MilestoneCreateFlags | null {
  const flags: MilestoneCreateFlags = { reqs: [] };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      return null;
    }

    if (arg === "--title") {
      flags.title = args[++i];
      continue;
    }

    if (arg === "--description") {
      flags.description = args[++i];
      continue;
    }

    if (arg === "--req") {
      flags.reqs.push(args[++i]);
      continue;
    }

    if (arg.startsWith("--title=")) {
      flags.title = arg.slice("--title=".length);
      continue;
    }

    if (arg.startsWith("--description=")) {
      flags.description = arg.slice("--description=".length);
      continue;
    }

    if (arg.startsWith("--req=")) {
      flags.reqs.push(arg.slice("--req=".length));
      continue;
    }

    if (arg.startsWith("-")) {
      const flagName = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
      if (!KNOWN_FLAGS.has(flagName)) {
        console.error(`Unknown flag: ${arg}\n`);
        printUsage();
        process.exitCode = 1;
        return null;
      }
    }
  }

  return flags;
}

function runCreate(args: string[]): void {
  const flags = parseCreateFlags(args);

  if (flags === null) {
    return;
  }

  if (!flags.title) {
    console.error("Error: --title is required\n");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const description = flags.description ?? "";
  const milestoneId = createEpic(flags.title, description, ["forge:milestone"]);

  console.log(`Milestone created: ${milestoneId}`);

  for (const reqId of flags.reqs) {
    addDep(milestoneId, reqId, "validates");
    console.log(`  validates → ${reqId}`);
  }
}

export function runMilestone(args: string[]): void {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printUsage();
    return;
  }

  if (subcommand === "create") {
    runCreate(rest);
    return;
  }

  console.error(`Unknown subcommand: ${subcommand}\n`);
  printUsage();
  process.exitCode = 1;
}
