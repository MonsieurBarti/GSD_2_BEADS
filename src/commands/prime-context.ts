/**
 * prime-context command
 *
 * Assembles structured context from the bead graph for agent context windows.
 * Takes a phase-id and outputs a markdown document containing:
 *   project vision/description, current phase approach/design,
 *   open tasks with acceptance criteria, blockers, and relevant memories.
 *
 * Usage: gsd2b prime-context <PHASE_ID> [--json]
 */

import { execFileSync } from "node:child_process";

interface BeadDetail {
  id: string;
  title: string;
  status: string;
  description?: string;
  acceptance_criteria?: string;
  notes?: string;
  design?: string;
  labels?: string[];
}

interface ContextDocument {
  project: {
    id: string;
    title: string;
    description: string;
  };
  phase: {
    id: string;
    title: string;
    description: string;
    design: string;
    notes: string;
  };
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    acceptance_criteria: string;
  }>;
  blockers: Array<{
    id: string;
    title: string;
    notes: string;
  }>;
  memories: string;
}

function printUsage(): void {
  console.log("Usage: gsd2b prime-context <PHASE_ID> [options]\n");
  console.log("Arguments:");
  console.log("  PHASE_ID  The bead ID of the phase to build context for\n");
  console.log("Options:");
  console.log("  --json  Output structured JSON instead of markdown");
  console.log("  --help  Show this help message");
}

/** Extract bead IDs from bd tree/list output */
function extractIds(output: string): string[] {
  const ids: string[] = [];
  const idPattern = /\bGSD_2_BEADS-\w+/g;
  for (const line of output.split("\n")) {
    const match = line.match(idPattern);
    if (match) {
      ids.push(match[0]);
    }
  }
  return ids;
}

function fetchBead(id: string): BeadDetail | null {
  try {
    const out = execFileSync("bd", ["show", id, "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
    const items = JSON.parse(out) as BeadDetail[];
    return items[0] ?? null;
  } catch {
    return null;
  }
}

function getChildren(phaseId: string): BeadDetail[] | null {
  let output: string;
  try {
    output = execFileSync("bd", ["children", phaseId], {
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

  const ids = extractIds(output);
  const childIds = ids.slice(1); // skip parent
  if (childIds.length === 0) {
    return [];
  }

  const items: BeadDetail[] = [];
  for (const id of childIds) {
    const bead = fetchBead(id);
    if (bead) {
      items.push(bead);
    }
  }
  return items;
}

function getProjectBead(): BeadDetail | null {
  try {
    const out = execFileSync("bd", ["list", "--label", "forge:project", "--status=all"], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
    if (!out) return null;
    const ids = extractIds(out);
    if (ids.length === 0) return null;
    return fetchBead(ids[0]);
  } catch {
    return null;
  }
}

function getMemories(phaseTitle: string): string {
  try {
    const out = execFileSync("bd", ["memories", phaseTitle], {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
    return out || "(none)";
  } catch {
    return "(none)";
  }
}

function buildContext(phaseId: string): ContextDocument | null {
  // Fetch phase bead
  const phase = fetchBead(phaseId);
  if (!phase) {
    console.error(`Error: phase '${phaseId}' not found or could not be retrieved.`);
    process.exitCode = 1;
    return null;
  }

  // Fetch project bead
  const project = getProjectBead();

  // Fetch children
  const children = getChildren(phaseId);
  if (children === null) {
    return null;
  }

  // Separate open tasks and blockers
  const openTasks = children.filter((c) => c.status !== "closed" && c.status !== "blocked");
  const blockers = children.filter((c) => c.status === "blocked");

  // Fetch memories related to phase title
  const memories = getMemories(phase.title);

  return {
    project: {
      id: project?.id ?? "(unknown)",
      title: project?.title ?? "(unknown)",
      description: project?.description ?? "",
    },
    phase: {
      id: phase.id,
      title: phase.title,
      description: phase.description ?? "",
      design: phase.design ?? "",
      notes: phase.notes ?? "",
    },
    tasks: openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      acceptance_criteria: t.acceptance_criteria ?? "",
    })),
    blockers: blockers.map((b) => ({
      id: b.id,
      title: b.title,
      notes: b.notes ?? "",
    })),
    memories,
  };
}

function renderMarkdown(ctx: ContextDocument): string {
  const lines: string[] = [];

  lines.push("# Agent Context Document");
  lines.push("");

  // Project section
  lines.push("## Project");
  lines.push("");
  lines.push(`**ID:** ${ctx.project.id}`);
  lines.push(`**Title:** ${ctx.project.title}`);
  if (ctx.project.description) {
    lines.push("");
    lines.push(ctx.project.description);
  }
  lines.push("");

  // Phase section
  lines.push("## Phase");
  lines.push("");
  lines.push(`**ID:** ${ctx.phase.id}`);
  lines.push(`**Title:** ${ctx.phase.title}`);
  if (ctx.phase.description) {
    lines.push("");
    lines.push("### Description");
    lines.push("");
    lines.push(ctx.phase.description);
  }
  if (ctx.phase.design) {
    lines.push("");
    lines.push("### Design / Approach");
    lines.push("");
    lines.push(ctx.phase.design);
  }
  if (ctx.phase.notes) {
    lines.push("");
    lines.push("### Notes");
    lines.push("");
    lines.push(ctx.phase.notes);
  }
  lines.push("");

  // Tasks section
  lines.push("## Tasks");
  lines.push("");
  if (ctx.tasks.length === 0) {
    lines.push("_(no open tasks)_");
  } else {
    for (const task of ctx.tasks) {
      lines.push(`### ${task.id} — ${task.title}`);
      lines.push("");
      lines.push(`**Status:** ${task.status}`);
      if (task.acceptance_criteria) {
        lines.push("");
        lines.push("**Acceptance Criteria:**");
        lines.push("");
        lines.push(task.acceptance_criteria);
      }
      lines.push("");
    }
  }

  // Blockers section
  lines.push("## Blockers");
  lines.push("");
  if (ctx.blockers.length === 0) {
    lines.push("_(no blockers)_");
  } else {
    for (const blocker of ctx.blockers) {
      lines.push(`### ${blocker.id} — ${blocker.title}`);
      lines.push("");
      if (blocker.notes) {
        lines.push(blocker.notes);
      }
      lines.push("");
    }
  }

  // Memories section
  lines.push("## Memories");
  lines.push("");
  lines.push(ctx.memories);

  return lines.join("\n");
}

export function runPrimeContext(args: string[]): void {
  // Parse flags
  const jsonMode = args.includes("--json");
  const helpMode = args.includes("--help") || args.includes("-h");

  if (helpMode) {
    printUsage();
    return;
  }

  // Find phase-id: first non-flag argument
  const phaseId = args.find((a) => !a.startsWith("-"));

  if (!phaseId) {
    console.error("Error: PHASE_ID is required\n");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const ctx = buildContext(phaseId);
  if (ctx === null) {
    return;
  }

  if (jsonMode) {
    console.log(JSON.stringify(ctx, null, 2));
  } else {
    console.log(renderMarkdown(ctx));
  }
}
