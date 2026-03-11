/**
 * plan-phase command
 *
 * Entry point for the plan-phase workflow. Supports a `discuss` subcommand
 * that gathers phase context interactively (research findings, constraints,
 * decisions, scope notes) and stores the result as structured notes on the
 * phase bead via `bd update`.
 *
 * Usage:
 *   gsd2b plan-phase discuss PHASE_ID [options]
 *
 * Options:
 *   --phase <id>          Phase bead ID (alternative to positional arg)
 *   --auto                Non-interactive mode (reads from flags)
 *   --research <text>     Research findings
 *   --constraints <text>  Constraints for this phase
 *   --decisions <text>    Key decisions made
 *   --scope <text>        Scope notes
 *   --help                Show this help message
 */

import { execFileSync } from "node:child_process";
import * as readline from "readline";

export interface PhaseContext {
  phaseId: string;
  research: string;
  constraints: string;
  decisions: string;
  scope: string;
}

export interface PlanPhaseFlags {
  subcommand?: string;
  phaseId?: string;
  auto: boolean;
  research?: string;
  constraints?: string;
  decisions?: string;
  scope?: string;
}

const KNOWN_FLAGS = new Set([
  "--phase",
  "--auto",
  "--research",
  "--constraints",
  "--decisions",
  "--scope",
]);

function printUsage(): void {
  console.log("Usage: gsd2b plan-phase <subcommand> [options]\n");
  console.log("Subcommands:");
  console.log("  discuss PHASE_ID   Gather phase context interactively\n");
  console.log("Options:");
  console.log("  --phase <id>          Phase bead ID");
  console.log("  --auto                Non-interactive mode");
  console.log("  --research <text>     Research findings");
  console.log("  --constraints <text>  Constraints for this phase");
  console.log("  --decisions <text>    Key decisions made");
  console.log("  --scope <text>        Scope notes");
  console.log("  --help                Show this help message");
}

export function parseFlags(args: string[]): PlanPhaseFlags | null {
  const flags: PlanPhaseFlags = { auto: false };
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
    default:
      console.error(`Unknown subcommand: ${subcommand}\n`);
      printUsage();
      process.exitCode = 1;
  }
}
