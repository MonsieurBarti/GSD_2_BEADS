/**
 * verify-phase command
 *
 * Supports two subcommands:
 *   check PHASE_ID    — report tasks missing acceptance criteria and open tasks with AC
 *   coverage PHASE_ID — report forge:req beads without validates links from phase tasks
 */

import { execFileSync } from "node:child_process";

interface BeadItem {
  id: string;
  title: string;
  status: string;
  acceptance_criteria?: string;
  labels?: string[];
}

interface DepItem {
  id: string;
  from_id: string;
  to_id: string;
  dep_type: string;
}

function printUsage(): void {
  console.log("Usage: gsd2b verify-phase <subcommand> <PHASE_ID>\n");
  console.log("Subcommands:");
  console.log("  check    <PHASE_ID>  Report tasks missing AC and open tasks with AC");
  console.log("  coverage <PHASE_ID>  Report forge:req beads without validates links\n");
  console.log("Options:");
  console.log("  --help  Show this help message");
}

function getChildren(phaseId: string): BeadItem[] | null {
  let output: string;
  try {
    output = execFileSync("bd", ["children", phaseId, "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not retrieve children for ${phaseId}: ${message}`);
    process.exitCode = 1;
    return null;
  }

  if (!output) {
    return [];
  }

  try {
    return JSON.parse(output) as BeadItem[];
  } catch {
    console.error("Error: failed to parse children output");
    process.exitCode = 1;
    return null;
  }
}

function runCheck(args: string[]): void {
  if (args[0] === "--help" || args[0] === "-h") {
    printUsage();
    return;
  }

  const phaseId = args[0];
  if (!phaseId || phaseId.startsWith("-")) {
    console.error("Error: PHASE_ID is required\n");
    console.log("Usage: gsd2b verify-phase check <PHASE_ID>");
    process.exitCode = 1;
    return;
  }

  const children = getChildren(phaseId);
  if (children === null) {
    return;
  }

  const missingAC: BeadItem[] = [];
  const openWithAC: BeadItem[] = [];

  for (const task of children) {
    const hasAC = task.acceptance_criteria && task.acceptance_criteria.trim().length > 0;
    const isOpen = task.status !== "closed";

    if (!hasAC) {
      missingAC.push(task);
    } else if (isOpen) {
      openWithAC.push(task);
    }
  }

  console.log(`Phase: ${phaseId}`);
  console.log(`Total tasks: ${children.length}\n`);

  console.log(`Tasks missing acceptance criteria (${missingAC.length}):`);
  if (missingAC.length === 0) {
    console.log("  (none)");
  } else {
    for (const t of missingAC) {
      console.log(`  ${t.id}  [${t.status}]  ${t.title}`);
    }
  }

  console.log(`\nOpen tasks with acceptance criteria — incomplete work (${openWithAC.length}):`);
  if (openWithAC.length === 0) {
    console.log("  (none)");
  } else {
    for (const t of openWithAC) {
      console.log(`  ${t.id}  [${t.status}]  ${t.title}`);
    }
  }

  const gaps = missingAC.length + openWithAC.length;
  console.log(`\nSummary: ${gaps} gap(s) found.`);

  if (gaps > 0) {
    process.exitCode = 1;
  }
}

function runCoverage(args: string[]): void {
  if (args[0] === "--help" || args[0] === "-h") {
    printUsage();
    return;
  }

  const phaseId = args[0];
  if (!phaseId || phaseId.startsWith("-")) {
    console.error("Error: PHASE_ID is required\n");
    console.log("Usage: gsd2b verify-phase coverage <PHASE_ID>");
    process.exitCode = 1;
    return;
  }

  // Get all forge:req beads
  let reqOutput: string;
  try {
    reqOutput = execFileSync("bd", ["list", "--label", "forge:req", "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not list forge:req beads: ${message}`);
    process.exitCode = 1;
    return;
  }

  let reqs: BeadItem[] = [];
  if (reqOutput) {
    try {
      reqs = JSON.parse(reqOutput) as BeadItem[];
    } catch {
      console.error("Error: failed to parse forge:req list output");
      process.exitCode = 1;
      return;
    }
  }

  if (reqs.length === 0) {
    console.log("No forge:req beads found.");
    return;
  }

  // Get phase task IDs for filtering
  const children = getChildren(phaseId);
  if (children === null) {
    return;
  }
  const phaseTaskIds = new Set(children.map((c) => c.id));

  const covered: BeadItem[] = [];
  const uncovered: BeadItem[] = [];

  for (const req of reqs) {
    let depOutput: string;
    try {
      depOutput = execFileSync("bd", ["dep", "list", req.id, "--type", "validates", "--json"], {
        encoding: "utf-8",
        timeout: 30_000,
      }).trim();
    } catch {
      depOutput = "";
    }

    let deps: DepItem[] = [];
    if (depOutput) {
      try {
        deps = JSON.parse(depOutput) as DepItem[];
      } catch {
        deps = [];
      }
    }

    const hasPhaseValidation = deps.some(
      (d) => phaseTaskIds.has(d.from_id) || phaseTaskIds.has(d.to_id),
    );

    if (hasPhaseValidation) {
      covered.push(req);
    } else {
      uncovered.push(req);
    }
  }

  console.log(`Phase: ${phaseId}`);
  console.log(`Total forge:req beads: ${reqs.length}\n`);

  console.log(`Covered requirements (${covered.length}):`);
  if (covered.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of covered) {
      console.log(`  ${r.id}  [${r.status}]  ${r.title}`);
    }
  }

  console.log(`\nUncovered requirements — no validates links from phase tasks (${uncovered.length}):`);
  if (uncovered.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of uncovered) {
      console.log(`  ${r.id}  [${r.status}]  ${r.title}`);
    }
  }

  console.log(`\nSummary: ${uncovered.length} uncovered requirement(s).`);

  if (uncovered.length > 0) {
    process.exitCode = 1;
  }
}

export function runVerifyPhase(args: string[]): void {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printUsage();
    return;
  }

  if (subcommand === "check") {
    runCheck(rest);
    return;
  }

  if (subcommand === "coverage") {
    runCoverage(rest);
    return;
  }

  console.error(`Unknown subcommand: ${subcommand}\n`);
  printUsage();
  process.exitCode = 1;
}
