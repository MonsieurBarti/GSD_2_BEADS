/**
 * verify-phase command
 *
 * Supports two subcommands:
 *   check PHASE_ID    — report tasks missing acceptance criteria and open tasks with AC
 *   coverage PHASE_ID — report forge:req beads without validates links from phase tasks
 *
 * Options (all subcommands):
 *   --json  Output results as JSON
 */

import { execFileSync } from "node:child_process";

interface BeadItem {
  id: string;
  title: string;
  status: string;
  acceptance_criteria?: string;
  labels?: string[];
}

function printUsage(): void {
  console.log("Usage: gsd2b verify-phase <subcommand> <PHASE_ID>\n");
  console.log("Subcommands:");
  console.log("  check    <PHASE_ID>  Report tasks missing AC and open tasks with AC");
  console.log("  coverage <PHASE_ID>  Report forge:req beads without validates links\n");
  console.log("Options:");
  console.log("  --json  Output results as JSON");
  console.log("  --help  Show this help message");
}

/** Extract bead IDs from bd tree output */
function extractIds(treeOutput: string): string[] {
  const ids: string[] = [];
  const idPattern = /\bGSD_2_BEADS-\w+/g;
  for (const line of treeOutput.split("\n")) {
    const match = line.match(idPattern);
    if (match) {
      ids.push(match[0]);
    }
  }
  return ids;
}

function fetchBead(id: string): BeadItem | null {
  try {
    const out = execFileSync("bd", ["show", id, "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
    const items = JSON.parse(out) as BeadItem[];
    return items[0] ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Warning: could not fetch bead ${id}: ${message}\n`);
    return null;
  }
}

function getChildren(phaseId: string): BeadItem[] | null {
  let output: string;
  try {
    output = execFileSync("bd", ["children", phaseId], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: could not retrieve children for ${phaseId}: ${message}\n`);
    process.exitCode = 1;
    return null;
  }

  if (!output) {
    return [];
  }

  const ids = extractIds(output);
  const childIds = ids.slice(1); // skip parent
  if (childIds.length === 0) {
    return [];
  }

  const items: BeadItem[] = [];
  for (const id of childIds) {
    const bead = fetchBead(id);
    if (bead) {
      items.push(bead);
    }
  }
  return items;
}

function runCheck(args: string[]): void {
  if (args[0] === "--help" || args[0] === "-h") {
    printUsage();
    return;
  }

  const jsonFlag = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("-"));
  const phaseId = positional[0];

  if (!phaseId) {
    process.stderr.write("Error: PHASE_ID is required\n\nUsage: gsd2b verify-phase check <PHASE_ID> [--json]\n");
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

  const gaps = missingAC.length + openWithAC.length;

  if (jsonFlag) {
    console.log(JSON.stringify({
      phaseId,
      total: children.length,
      gaps,
      missing_ac: missingAC.map((t) => ({ id: t.id, status: t.status, title: t.title })),
      open_with_ac: openWithAC.map((t) => ({ id: t.id, status: t.status, title: t.title })),
    }));
    if (gaps > 0) {
      process.exitCode = 1;
    }
    return;
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

  const jsonFlag = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("-"));
  const phaseId = positional[0];

  if (!phaseId) {
    process.stderr.write("Error: PHASE_ID is required\n\nUsage: gsd2b verify-phase coverage <PHASE_ID> [--json]\n");
    process.exitCode = 1;
    return;
  }

  // Get all forge:req beads
  let reqOutput: string;
  try {
    reqOutput = execFileSync("bd", ["list", "--label", "forge:req"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: could not list forge:req beads: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  const reqIds = reqOutput ? extractIds(reqOutput) : [];
  const reqs: BeadItem[] = [];
  for (const id of reqIds) {
    const bead = fetchBead(id);
    if (bead) {
      reqs.push(bead);
    }
  }

  if (reqs.length === 0) {
    if (jsonFlag) {
      console.log(JSON.stringify({ phaseId, total_reqs: 0, covered: [], uncovered: [] }));
    } else {
      console.log("No forge:req beads found.");
    }
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
      depOutput = execFileSync("bd", ["dep", "list", req.id, "--type", "validates"], {
        encoding: "utf-8",
        timeout: 30_000,
      }).trim();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Warning: could not list deps for ${req.id}: ${message}\n`);
      depOutput = "";
    }

    // Extract IDs from dep output and check for phase task overlap
    const depIds = depOutput ? extractIds(depOutput) : [];
    const hasPhaseValidation = depIds.some((id) => phaseTaskIds.has(id));

    if (hasPhaseValidation) {
      covered.push(req);
    } else {
      uncovered.push(req);
    }
  }

  if (jsonFlag) {
    console.log(JSON.stringify({
      phaseId,
      total_reqs: reqs.length,
      covered: covered.map((r) => ({ id: r.id, status: r.status, title: r.title })),
      uncovered: uncovered.map((r) => ({ id: r.id, status: r.status, title: r.title })),
    }));
    if (uncovered.length > 0) {
      process.exitCode = 1;
    }
    return;
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

  process.stderr.write(`Unknown subcommand: ${subcommand}\n\n`);
  printUsage();
  process.exitCode = 1;
}
