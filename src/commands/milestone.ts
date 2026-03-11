/**
 * milestone command
 *
 * Supports the `create` subcommand to create a forge:milestone epic bead with
 * optional requirement linkage via validates dependencies.
 */

import { execFileSync } from "node:child_process";
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
  console.log("  create    Create a new milestone");
  console.log("  list      List all milestones");
  console.log("  complete  Close a milestone and print audit summary\n");
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

interface BeadItem {
  id: string;
  title: string;
  status: string;
}

function runList(): void {
  let stdout: string;
  try {
    stdout = execFileSync("bd", ["list", "--label", "forge:milestone", "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: could not retrieve milestones: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (!stdout) {
    console.log("No milestones found.");
    return;
  }

  let items: BeadItem[];
  try {
    items = JSON.parse(stdout) as BeadItem[];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: failed to parse milestone list output: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (items.length === 0) {
    console.log("No milestones found.");
    return;
  }

  console.log("Milestones:");
  for (const item of items) {
    console.log(`  ${item.id}  [${item.status}]  ${item.title}`);
  }
}

function runComplete(args: string[]): void {
  const milestoneId = args[0];

  if (!milestoneId || milestoneId.startsWith("-")) {
    process.stderr.write("Error: MILESTONE_ID is required\n\nUsage: gsd2b milestone complete <MILESTONE_ID>\n");
    process.exitCode = 1;
    return;
  }

  // Get child stats
  let children: BeadItem[] = [];
  try {
    const childOutput = execFileSync("bd", ["children", milestoneId, "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();

    if (childOutput) {
      children = JSON.parse(childOutput) as BeadItem[];
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not retrieve children for ${milestoneId}: ${message}`);
    process.exitCode = 1;
    return;
  }

  // Close the milestone
  try {
    execFileSync("bd", ["close", milestoneId], {
      encoding: "utf-8",
      timeout: 30_000,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not close milestone ${milestoneId}: ${message}`);
    process.exitCode = 1;
    return;
  }

  // Audit summary
  const total = children.length;
  const closed = children.filter((c) => c.status === "closed").length;
  const open = total - closed;

  console.log(`Milestone ${milestoneId} closed.`);
  console.log(`Audit summary:`);
  console.log(`  Total children : ${total}`);
  console.log(`  Open           : ${open}`);
  console.log(`  Closed         : ${closed}`);
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

  if (subcommand === "list") {
    runList();
    return;
  }

  if (subcommand === "complete") {
    runComplete(rest);
    return;
  }

  console.error(`Unknown subcommand: ${subcommand}\n`);
  printUsage();
  process.exitCode = 1;
}
