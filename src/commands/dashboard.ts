/**
 * dashboard command
 *
 * Supports three subcommands:
 *   show [PHASE_ID]     — print open/closed/blocked counts and completion %
 *   blockers [PHASE_ID] — list blocked child beads with dependency info
 *   phases              — list all forge:phase beads with per-phase status summary
 */

import { execFileSync } from "node:child_process";

interface BeadItem {
  id: string;
  title: string;
  status: string;
}

function printUsage(): void {
  console.log("Usage: gsd2b dashboard <subcommand> [options]\n");
  console.log("Subcommands:");
  console.log("  show [PHASE_ID]     Print open/closed/blocked counts and completion %");
  console.log("  blockers [PHASE_ID] List blocked child beads");
  console.log("  phases              List all forge:phase beads with status summary\n");
  console.log("Options:");
  console.log("  --help  Show this help message");
}

function fetchChildren(phaseId: string): BeadItem[] | null {
  let stdout: string;
  try {
    stdout = execFileSync("bd", ["children", phaseId, "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not retrieve children for ${phaseId}: ${message}`);
    process.exitCode = 1;
    return null;
  }

  if (!stdout) {
    return [];
  }

  try {
    return JSON.parse(stdout) as BeadItem[];
  } catch {
    console.error("Error: failed to parse children output");
    process.exitCode = 1;
    return null;
  }
}

function runShow(args: string[]): void {
  const phaseId = args[0];

  if (!phaseId || phaseId.startsWith("-")) {
    console.error("Error: PHASE_ID is required\n");
    console.log("Usage: gsd2b dashboard show <PHASE_ID>");
    process.exitCode = 1;
    return;
  }

  const children = fetchChildren(phaseId);
  if (children === null) {
    return;
  }

  if (children.length === 0) {
    console.log(`No children found for phase ${phaseId}.`);
    return;
  }

  const total = children.length;
  const closed = children.filter((c) => c.status === "closed").length;
  const blocked = children.filter((c) => c.status === "blocked").length;
  const open = total - closed - blocked;
  const pct = total > 0 ? Math.round((closed / total) * 100) : 0;

  console.log(`Phase ${phaseId} — Dashboard Summary`);
  console.log(`  Total    : ${total}`);
  console.log(`  Open     : ${open}`);
  console.log(`  Closed   : ${closed}`);
  console.log(`  Blocked  : ${blocked}`);
  console.log(`  Coverage : ${pct}%`);
}

function runBlockers(args: string[]): void {
  const phaseId = args[0];

  if (!phaseId || phaseId.startsWith("-")) {
    console.error("Error: PHASE_ID is required\n");
    console.log("Usage: gsd2b dashboard blockers <PHASE_ID>");
    process.exitCode = 1;
    return;
  }

  const children = fetchChildren(phaseId);
  if (children === null) {
    return;
  }

  const blocked = children.filter((c) => c.status === "blocked");

  if (blocked.length === 0) {
    console.log(`No blocked items found for phase ${phaseId}.`);
    return;
  }

  console.log(`Blocked items in phase ${phaseId}:`);
  for (const item of blocked) {
    console.log(`  ${item.id}  [blocked]  ${item.title}`);
  }
}

function runPhases(): void {
  let stdout: string;
  try {
    stdout = execFileSync("bd", ["list", "--label", "forge:phase", "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not retrieve phases: ${message}`);
    process.exitCode = 1;
    return;
  }

  if (!stdout) {
    console.log("No phases found.");
    return;
  }

  let phases: BeadItem[];
  try {
    phases = JSON.parse(stdout) as BeadItem[];
  } catch {
    console.error("Error: failed to parse phases output");
    process.exitCode = 1;
    return;
  }

  if (phases.length === 0) {
    console.log("No phases found.");
    return;
  }

  console.log("Phases:");
  for (const phase of phases) {
    const children = fetchChildren(phase.id);
    if (children === null) {
      continue;
    }

    const total = children.length;
    const closed = children.filter((c) => c.status === "closed").length;
    const blocked = children.filter((c) => c.status === "blocked").length;
    const open = total - closed - blocked;
    const pct = total > 0 ? Math.round((closed / total) * 100) : 0;

    console.log(
      `  ${phase.id}  [${phase.status}]  ${phase.title}` +
        `  (open: ${open}, closed: ${closed}, blocked: ${blocked}, ${pct}%)`
    );
  }
}

export function runDashboard(args: string[]): void {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printUsage();
    return;
  }

  if (subcommand === "show") {
    runShow(rest);
    return;
  }

  if (subcommand === "blockers") {
    runBlockers(rest);
    return;
  }

  if (subcommand === "phases") {
    runPhases();
    return;
  }

  console.error(`Unknown subcommand: ${subcommand}\n`);
  printUsage();
  process.exitCode = 1;
}
