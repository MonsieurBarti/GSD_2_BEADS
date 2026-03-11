/**
 * plan-phase command
 *
 * Entry point for the plan-phase workflow. Supports subcommands:
 *
 *   discuss PHASE_ID       Gather phase context interactively
 *   create-tasks PHASE_ID  Create task beads as children of a phase
 *
 * Usage:
 *   gsd2b plan-phase discuss PHASE_ID [options]
 *   gsd2b plan-phase create-tasks PHASE_ID [--task "title|desc|ac|req1,req2"] [--chain]
 *
 * Options (discuss):
 *   --phase <id>          Phase bead ID (alternative to positional arg)
 *   --auto                Non-interactive mode (reads from flags)
 *   --research <text>     Research findings
 *   --constraints <text>  Constraints for this phase
 *   --decisions <text>    Key decisions made
 *   --scope <text>        Scope notes
 *   --help                Show this help message
 *
 * Options (create-tasks):
 *   --task "title|desc|ac|req1,req2"  Task spec (repeatable)
 *   --tasks-json <json>               JSON array of task specs
 *   --chain                           Add sequential blocks deps between tasks
 */

import { execFileSync } from "node:child_process";
import * as readline from "readline";
import { createTask, addDep } from "../bead-helpers.js";

export interface PhaseContext {
  phaseId: string;
  research: string;
  constraints: string;
  decisions: string;
  scope: string;
}

export interface TaskSpec {
  title: string;
  description: string;
  acceptance_criteria: string;
  reqIds: string[];
}

export interface PlanPhaseFlags {
  subcommand?: string;
  phaseId?: string;
  auto: boolean;
  research?: string;
  constraints?: string;
  decisions?: string;
  scope?: string;
  tasks: string[];
  tasksJson?: string;
  chain: boolean;
}

const KNOWN_FLAGS = new Set([
  "--phase",
  "--auto",
  "--research",
  "--constraints",
  "--decisions",
  "--scope",
  "--task",
  "--tasks-json",
  "--chain",
]);

function printUsage(): void {
  console.log("Usage: gsd2b plan-phase <subcommand> [options]\n");
  console.log("Subcommands:");
  console.log("  discuss PHASE_ID      Gather phase context interactively");
  console.log("  create-tasks PHASE_ID Create task beads as children of the phase\n");
  console.log("Options (discuss):");
  console.log("  --phase <id>          Phase bead ID");
  console.log("  --auto                Non-interactive mode");
  console.log("  --research <text>     Research findings");
  console.log("  --constraints <text>  Constraints for this phase");
  console.log("  --decisions <text>    Key decisions made");
  console.log("  --scope <text>        Scope notes");
  console.log("  --help                Show this help message\n");
  console.log("Options (create-tasks):");
  console.log('  --task "title|desc|ac|req1,req2"  Task spec (repeatable)');
  console.log("  --tasks-json <json>               JSON array of task specs");
  console.log("  --chain                           Add sequential blocks deps between tasks");
}

export function parseFlags(args: string[]): PlanPhaseFlags | null {
  const flags: PlanPhaseFlags = { auto: false, tasks: [], chain: false };
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      return null;
    }

    if (arg === "--auto") {
      flags.auto = true;
      continue;
    }

    if (arg === "--phase") {
      flags.phaseId = args[++i];
      continue;
    }

    if (arg === "--research") {
      flags.research = args[++i];
      continue;
    }

    if (arg === "--constraints") {
      flags.constraints = args[++i];
      continue;
    }

    if (arg === "--decisions") {
      flags.decisions = args[++i];
      continue;
    }

    if (arg === "--scope") {
      flags.scope = args[++i];
      continue;
    }

    if (arg === "--task") {
      flags.tasks.push(args[++i]);
      continue;
    }

    if (arg === "--tasks-json") {
      flags.tasksJson = args[++i];
      continue;
    }

    if (arg === "--chain") {
      flags.chain = true;
      continue;
    }

    // Inline --flag=value forms
    if (arg.startsWith("--phase=")) {
      flags.phaseId = arg.slice("--phase=".length);
      continue;
    }
    if (arg.startsWith("--research=")) {
      flags.research = arg.slice("--research=".length);
      continue;
    }
    if (arg.startsWith("--constraints=")) {
      flags.constraints = arg.slice("--constraints=".length);
      continue;
    }
    if (arg.startsWith("--decisions=")) {
      flags.decisions = arg.slice("--decisions=".length);
      continue;
    }
    if (arg.startsWith("--scope=")) {
      flags.scope = arg.slice("--scope=".length);
      continue;
    }

    if (arg.startsWith("--task=")) {
      flags.tasks.push(arg.slice("--task=".length));
      continue;
    }

    if (arg.startsWith("--tasks-json=")) {
      flags.tasksJson = arg.slice("--tasks-json=".length);
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

    // Positional: skip the command name itself
    if (arg === "plan-phase") {
      continue;
    }

    positional.push(arg);
  }

  // First positional is the subcommand, second is the phase ID
  if (positional.length > 0) {
    flags.subcommand = positional[0];
  }
  if (positional.length > 1 && !flags.phaseId) {
    flags.phaseId = positional[1];
  }

  return flags;
}

function isTTY(): boolean {
  return Boolean(process.stdin.isTTY);
}

// --- readline helpers (mirrors new-project-interactive.ts) ---

function createInterface(): readline.Interface {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    console.log("\nAborted.");
    process.exit(0);
  });

  return rl;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function askRequired(
  rl: readline.Interface,
  question: string,
  fieldName: string
): Promise<string> {
  let value = "";
  while (!value) {
    value = await ask(rl, question);
    if (!value) {
      console.log(`${fieldName} cannot be empty. Please try again.`);
    }
  }
  return value;
}

// --- interactive discuss ---

async function discussInteractive(phaseId: string): Promise<PhaseContext> {
  const rl = createInterface();

  try {
    console.log(`\nGathering context for phase: ${phaseId}\n`);

    console.log("Research findings (what you have learned so far):");
    const research = await askRequired(rl, "> ", "Research findings");

    console.log(
      "\nConstraints (technical, time, budget, dependencies — or press Enter to skip):"
    );
    const constraints = await ask(rl, "> ");

    console.log(
      "\nKey decisions made for this phase (or press Enter to skip):"
    );
    const decisions = await ask(rl, "> ");

    console.log(
      "\nScope notes (what is in/out of scope — or press Enter to skip):"
    );
    const scope = await ask(rl, "> ");

    console.log("\nPhase context captured.\n");

    return { phaseId, research, constraints, decisions, scope };
  } finally {
    rl.close();
  }
}

// --- auto discuss ---

function discussAuto(flags: PlanPhaseFlags, phaseId: string): PhaseContext {
  const research = flags.research ?? "";
  if (!research) {
    console.error(
      "Error: --research is required in --auto / non-TTY mode.\n"
    );
    process.exitCode = 1;
  }

  return {
    phaseId,
    research,
    constraints: flags.constraints ?? "",
    decisions: flags.decisions ?? "",
    scope: flags.scope ?? "",
  };
}

// --- store context ---

function buildNotes(ctx: PhaseContext): string {
  const lines: string[] = ["## Phase Context"];

  lines.push("\n### Research Findings");
  lines.push(ctx.research || "(none)");

  lines.push("\n### Constraints");
  lines.push(ctx.constraints || "(none)");

  lines.push("\n### Key Decisions");
  lines.push(ctx.decisions || "(none)");

  lines.push("\n### Scope Notes");
  lines.push(ctx.scope || "(none)");

  return lines.join("\n");
}

function storeContext(ctx: PhaseContext): void {
  const notes = buildNotes(ctx);

  try {
    execFileSync("bd", ["update", ctx.phaseId, `--notes=${notes}`], {
      encoding: "utf-8",
      stdio: "inherit",
      timeout: 30_000,
    });
    console.log(`Context stored on phase ${ctx.phaseId}.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to store context: ${msg}`);
    process.exitCode = 1;
  }
}

// --- subcommand handlers ---

async function runDiscuss(flags: PlanPhaseFlags): Promise<void> {
  if (!flags.phaseId) {
    console.error("Error: PHASE_ID is required.\n");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const phaseId = flags.phaseId;
  const useAuto = flags.auto || !isTTY();

  let ctx: PhaseContext;
  if (useAuto) {
    ctx = discussAuto(flags, phaseId);
    if (process.exitCode === 1) {
      return;
    }
  } else {
    ctx = await discussInteractive(phaseId);
  }

  storeContext(ctx);
}

// --- create-tasks ---

function parseTaskSpec(raw: string): TaskSpec {
  // Format: "title|description|acceptance_criteria|req1,req2"
  const parts = raw.split("|");
  const title = (parts[0] ?? "").trim();
  const description = (parts[1] ?? "").trim();
  const acceptance_criteria = (parts[2] ?? "").trim();
  const reqPart = (parts[3] ?? "").trim();
  const reqIds = reqPart ? reqPart.split(",").map((r) => r.trim()).filter(Boolean) : [];
  return { title, description, acceptance_criteria, reqIds };
}

function collectTaskSpecs(flags: PlanPhaseFlags): TaskSpec[] | null {
  const specs: TaskSpec[] = [];

  if (flags.tasksJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(flags.tasksJson);
    } catch {
      console.error("Error: --tasks-json is not valid JSON.\n");
      process.exitCode = 1;
      return null;
    }
    if (!Array.isArray(parsed)) {
      console.error("Error: --tasks-json must be a JSON array.\n");
      process.exitCode = 1;
      return null;
    }
    for (const item of parsed) {
      if (typeof item === "string") {
        specs.push(parseTaskSpec(item));
      } else if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        specs.push({
          title: String(obj["title"] ?? ""),
          description: String(obj["description"] ?? ""),
          acceptance_criteria: String(obj["acceptance_criteria"] ?? obj["ac"] ?? ""),
          reqIds: Array.isArray(obj["reqIds"])
            ? (obj["reqIds"] as string[]).map(String)
            : typeof obj["reqIds"] === "string"
            ? (obj["reqIds"] as string).split(",").map((r) => r.trim()).filter(Boolean)
            : [],
        });
      }
    }
  }

  for (const raw of flags.tasks) {
    specs.push(parseTaskSpec(raw));
  }

  return specs;
}

async function runCreateTasks(flags: PlanPhaseFlags): Promise<void> {
  if (!flags.phaseId) {
    console.error("Error: PHASE_ID is required for create-tasks.\n");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const phaseId = flags.phaseId;
  const specs = collectTaskSpecs(flags);
  if (!specs) return;

  if (specs.length === 0) {
    console.error(
      "Error: No tasks specified. Use --task or --tasks-json.\n"
    );
    process.exitCode = 1;
    return;
  }

  const createdIds: string[] = [];

  for (const spec of specs) {
    if (!spec.title) {
      console.error("Error: task title cannot be empty.\n");
      process.exitCode = 1;
      return;
    }

    let taskId: string;
    try {
      taskId = createTask(spec.title, spec.description, {
        acceptance_criteria: spec.acceptance_criteria || undefined,
        parentId: phaseId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to create task "${spec.title}": ${msg}`);
      process.exitCode = 1;
      return;
    }

    // Add validates deps to requirements
    for (const reqId of spec.reqIds) {
      try {
        addDep(taskId, reqId, "validates");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Warning: could not add validates dep ${taskId} -> ${reqId}: ${msg}`);
      }
    }

    createdIds.push(taskId);
    console.log(`  Created task ${taskId}: ${spec.title}`);
  }

  // Add sequential blocks deps if --chain
  if (flags.chain && createdIds.length > 1) {
    for (let i = 0; i < createdIds.length - 1; i++) {
      const fromId = createdIds[i];
      const toId = createdIds[i + 1];
      try {
        addDep(fromId, toId, "blocks");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Warning: could not add blocks dep ${fromId} -> ${toId}: ${msg}`);
      }
    }
  }

  console.log(`\nSummary: ${createdIds.length} task(s) created under phase ${phaseId}.`);
  for (let i = 0; i < createdIds.length; i++) {
    const spec = specs[i];
    console.log(`  ${createdIds[i]}  ${spec.title}`);
  }
}

// --- main export ---

export async function runPlanPhase(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  if (flags === null) {
    printUsage();
    return;
  }

  const subcommand = flags.subcommand;

  if (!subcommand) {
    console.error("Error: subcommand required.\n");
    printUsage();
    process.exitCode = 1;
    return;
  }

  switch (subcommand) {
    case "discuss":
      await runDiscuss(flags);
      break;
    case "create-tasks":
      await runCreateTasks(flags);
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}\n`);
      printUsage();
      process.exitCode = 1;
  }
}
