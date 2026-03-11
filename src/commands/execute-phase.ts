/**
 * execute-phase command
 *
 * Entry point for the execute-phase workflow. Supports subcommands:
 *
 *   start PHASE_ID   Validate phase has open tasks, create git branch, mark in_progress
 *   run PHASE_ID     Wave-based task dispatch with git commits per task
 *   finish PHASE_ID  (not yet implemented)
 *
 * Usage:
 *   gsd2b execute-phase start PHASE_ID [--base-branch <branch>]
 *   gsd2b execute-phase run PHASE_ID [--dry-run]
 *
 * Options (start):
 *   --base-branch <branch>  Branch to fork from (default: current branch)
 *   --help                  Show this help message
 *
 * Options (run):
 *   --dry-run               Show wave plan without executing
 */

import { execFileSync } from "node:child_process";
import { computeWaves } from "../lib/waves.js";

export interface ExecutePhaseFlags {
  subcommand?: string;
  phaseId?: string;
  baseBranch?: string;
  dryRun?: boolean;
}

const KNOWN_FLAGS = new Set(["--base-branch", "--help", "--dry-run"]);

function printUsage(): void {
  console.log("Usage: gsd2b execute-phase <subcommand> [options]\n");
  console.log("Subcommands:");
  console.log("  start PHASE_ID   Validate phase, create git branch, mark in_progress");
  console.log("  run PHASE_ID     Wave-based task dispatch with git commits per task");
  console.log("  finish PHASE_ID  (not yet implemented)\n");
  console.log("Options (start):");
  console.log("  --base-branch <branch>  Branch to fork from (default: current branch)");
  console.log("  --help                  Show this help message\n");
  console.log("Options (run):");
  console.log("  --dry-run               Show wave plan without executing");
}

export function parseFlags(args: string[]): ExecutePhaseFlags | null {
  const flags: ExecutePhaseFlags = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      return null;
    }

    if (arg === "--base-branch") {
      flags.baseBranch = args[++i];
      continue;
    }

    if (arg.startsWith("--base-branch=")) {
      flags.baseBranch = arg.slice("--base-branch=".length);
      continue;
    }

    if (arg === "--dry-run") {
      flags.dryRun = true;
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

    if (arg === "execute-phase") {
      continue;
    }

    positional.push(arg);
  }

  if (positional.length > 0) {
    flags.subcommand = positional[0];
  }
  if (positional.length > 1) {
    flags.phaseId = positional[1];
  }

  return flags;
}

function getCurrentBranch(): string {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf-8",
    timeout: 10_000,
  }).trim();
}

function getOpenChildTasks(phaseId: string): string[] {
  try {
    const output = execFileSync("bd", ["children", phaseId, "--status=open"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    // If bd children doesn't support --status flag, fall back to filtering
    try {
      const output = execFileSync("bd", ["children", phaseId], {
        encoding: "utf-8",
        timeout: 30_000,
      }).trim();
      if (!output) return [];
      // Return all children lines — let the caller decide if open tasks exist
      return output.split("\n").filter((line) => line.includes("open"));
    } catch {
      return [];
    }
  }
}

async function runStart(flags: ExecutePhaseFlags): Promise<void> {
  if (!flags.phaseId) {
    console.error("Error: PHASE_ID is required for start.\n");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const phaseId = flags.phaseId;

  // Check that the phase has open child tasks
  const openTasks = getOpenChildTasks(phaseId);
  if (openTasks.length === 0) {
    console.error(
      `Error: Phase ${phaseId} has no open child tasks. Add tasks before starting execution.\n`
    );
    process.exitCode = 1;
    return;
  }

  // Determine base branch
  let baseBranch: string;
  if (flags.baseBranch) {
    baseBranch = flags.baseBranch;
  } else {
    try {
      baseBranch = getCurrentBranch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: could not determine current git branch: ${msg}\n`);
      process.exitCode = 1;
      return;
    }
  }

  const branchName = `phase/${phaseId}`;

  // Create the git branch
  try {
    execFileSync("git", ["checkout", "-b", branchName, baseBranch], {
      encoding: "utf-8",
      stdio: "inherit",
      timeout: 30_000,
    });
    console.log(`Created and checked out branch: ${branchName} (from ${baseBranch})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // git exits with non-zero if branch already exists; detect that case
    if (msg.includes("already exists") || msg.includes("already a branch")) {
      console.error(
        `Error: Branch '${branchName}' already exists. ` +
          `Switch to it manually with: git checkout ${branchName}\n`
      );
    } else {
      console.error(`Error: Failed to create branch '${branchName}': ${msg}\n`);
    }
    process.exitCode = 1;
    return;
  }

  // Mark phase as in_progress
  try {
    execFileSync("bd", ["update", phaseId, "--status=in_progress"], {
      encoding: "utf-8",
      stdio: "inherit",
      timeout: 30_000,
    });
    console.log(`Phase ${phaseId} marked as in_progress.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Warning: branch created but failed to mark phase in_progress: ${msg}`);
    process.exitCode = 1;
  }
}

interface BdTaskDetail {
  id: string;
  title: string;
  description?: string;
  acceptance_criteria?: string;
}

function bdShowTask(taskId: string): BdTaskDetail {
  const raw = execFileSync("bd", ["show", taskId, "--json"], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  const parsed = JSON.parse(raw) as BdTaskDetail[];
  return parsed[0];
}

async function runRun(flags: ExecutePhaseFlags): Promise<void> {
  if (!flags.phaseId) {
    console.error("Error: PHASE_ID is required for run.\n");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const phaseId = flags.phaseId;

  // Compute waves
  let waves: string[][];
  try {
    waves = computeWaves(phaseId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error computing waves: ${msg}\n`);
    process.exitCode = 1;
    return;
  }

  // --dry-run: show plan and exit
  if (flags.dryRun) {
    console.log(`Dry run for phase ${phaseId}:`);
    waves.forEach((wave, idx) => {
      console.log(`\nWave ${idx + 1} (${wave.length} task${wave.length === 1 ? "" : "s"}):`);
      for (const taskId of wave) {
        console.log(`  - ${taskId}`);
      }
    });
    return;
  }

  // Check we're on a phase branch
  let currentBranch: string;
  try {
    currentBranch = execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not determine current git branch: ${msg}\n`);
    process.exitCode = 1;
    return;
  }

  if (!currentBranch.startsWith("phase/")) {
    console.error(
      `Error: must be on a phase branch (current: '${currentBranch}'). ` +
        `Run 'gsd2b execute-phase start ${phaseId}' first.\n`
    );
    process.exitCode = 1;
    return;
  }

  const totalTasks = waves.reduce((sum, w) => sum + w.length, 0);
  console.log(`Executing phase ${phaseId} on branch '${currentBranch}'`);
  console.log(`${waves.length} wave(s), ${totalTasks} open task(s)\n`);

  let completedCount = 0;

  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    const wave = waves[waveIdx];
    console.log(`\n--- Wave ${waveIdx + 1} (${wave.length} task${wave.length === 1 ? "" : "s"}) ---`);

    for (const taskId of wave) {
      // Fetch task details
      let task: BdTaskDetail;
      try {
        task = bdShowTask(taskId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error fetching task ${taskId}: ${msg}`);
        process.exitCode = 1;
        return;
      }

      console.log(`\nTask: ${taskId}`);
      console.log(`Title: ${task.title}`);
      if (task.description) {
        console.log(`Description: ${task.description}`);
      }
      if (task.acceptance_criteria) {
        console.log(`Acceptance Criteria:\n${task.acceptance_criteria}`);
      }

      // Mark in_progress
      try {
        execFileSync("bd", ["update", taskId, "--status=in_progress"], {
          encoding: "utf-8",
          stdio: "inherit",
          timeout: 30_000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error marking ${taskId} in_progress: ${msg}`);
        process.exitCode = 1;
        return;
      }

      // Mark closed
      try {
        execFileSync("bd", ["close", taskId], {
          encoding: "utf-8",
          stdio: "inherit",
          timeout: 30_000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error closing ${taskId}: ${msg}`);
        process.exitCode = 1;
        return;
      }

      // Git commit
      try {
        execFileSync("git", ["add", "-A"], {
          encoding: "utf-8",
          stdio: "inherit",
          timeout: 30_000,
        });
        execFileSync("git", ["commit", "-m", `task(${taskId}): ${task.title}`], {
          encoding: "utf-8",
          stdio: "inherit",
          timeout: 30_000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error committing for ${taskId}: ${msg}`);
        process.exitCode = 1;
        return;
      }

      completedCount++;
      console.log(`Completed: ${taskId} (${completedCount}/${totalTasks})`);
    }
  }

  console.log(`\nPhase ${phaseId} execution complete. ${completedCount} task(s) committed.`);
}

// --- main export ---

export async function runExecutePhase(args: string[]): Promise<void> {
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
    case "start":
      await runStart(flags);
      break;
    case "run":
      await runRun(flags);
      break;
    case "finish":
      console.log("Not yet implemented: finish");
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}\n`);
      printUsage();
      process.exitCode = 1;
  }
}
