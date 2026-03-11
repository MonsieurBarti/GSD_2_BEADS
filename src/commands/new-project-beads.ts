import { execFileSync } from "node:child_process";
import type { ProjectSpec } from "./new-project.js";
import { createEpic, createFeature, addDep } from "../bead-helpers.js";

export { createEpic, createFeature, addDep };

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
