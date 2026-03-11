import { execFileSync } from "node:child_process";
import type { ProjectSpec } from "./new-project.js";

function runBdCreate(args: string[]): string {
  const stdout = execFileSync("bd", ["create", "--silent", ...args], {
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
  return stdout;
}

/**
 * Create an epic bead and return its ID.
 */
export function createEpic(
  title: string,
  description: string,
  labels: string[] = [],
  parentId?: string,
): string {
  const args: string[] = ["--type=epic", `--title=${title}`, `--description=${description}`];
  if (labels.length > 0) {
    args.push(`--labels=${labels.join(",")}`);
  }
  if (parentId) {
    args.push(`--parent=${parentId}`);
  }
  return runBdCreate(args);
}

/**
 * Create a feature bead and return its ID.
 */
export function createFeature(
  title: string,
  description: string,
  labels: string[] = [],
  parentId?: string,
): string {
  const args: string[] = ["--type=feature", `--title=${title}`, `--description=${description}`];
  if (labels.length > 0) {
    args.push(`--labels=${labels.join(",")}`);
  }
  if (parentId) {
    args.push(`--parent=${parentId}`);
  }
  return runBdCreate(args);
}

/**
 * Add a dependency between two beads.
 * fromId depends on / is blocked by toId (or the relationship is typed by `type`).
 */
export function addDep(fromId: string, toId: string, type = "blocks"): void {
  execFileSync("bd", ["dep", "add", fromId, toId, `--type=${type}`], {
    encoding: "utf-8",
    timeout: 30_000,
  });
}

const DEFAULT_PHASES = [
  "Foundation",
  "Initialization",
  "Planning",
  "Execution",
  "Observability",
  "Polish",
];

/**
 * Materialize a ProjectSpec into the bead hierarchy:
 * 1. Root project epic (forge:project)
 * 2. Requirement features (forge:req), parented to root
 * 3. Phase epics (forge:phase), parented to root, with sequential blocks deps
 * 4. Store vision via bd remember
 */
export function materialize(spec: ProjectSpec): void {
  console.log(`Creating project: ${spec.name}\n`);

  // 1. Root project epic
  const rootId = createEpic(spec.name, spec.vision, ["forge:project"]);
  console.log(`  Project epic: ${rootId}`);

  // 2. Requirements as feature beads
  const reqIds: string[] = [];
  for (const req of spec.requirements) {
    const reqId = createFeature(req.title, req.description, ["forge:req"], rootId);
    reqIds.push(reqId);
    console.log(`  Requirement:  ${reqId} — ${req.title}`);
  }

  // 3. Phase epics with sequential blocks deps
  const phaseIds: string[] = [];
  for (const phaseName of DEFAULT_PHASES) {
    const phaseId = createEpic(
      `Phase: ${phaseName}`,
      `${phaseName} phase for ${spec.name}`,
      ["forge:phase"],
      rootId,
    );
    phaseIds.push(phaseId);
    console.log(`  Phase:        ${phaseId} — ${phaseName}`);
  }

  // Sequential deps: phase[i+1] depends on phase[i]
  for (let i = 0; i < phaseIds.length - 1; i++) {
    addDep(phaseIds[i + 1], phaseIds[i], "blocks");
  }

  // 4. Store vision
  execFileSync("bd", ["remember", `forge:project:${rootId}:vision`, spec.vision], {
    encoding: "utf-8",
    timeout: 30_000,
  });

  console.log(`\nProject created: ${rootId}`);
  console.log(`  ${reqIds.length} requirements, ${phaseIds.length} phases`);
}
