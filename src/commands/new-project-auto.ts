/**
 * Auto (non-interactive) mode for new-project command.
 *
 * Builds a ProjectSpec from CLI flags without prompts.
 * Supports --vision, --description, and --file (JSON) flags.
 */

import { readFileSync } from "node:fs";
import type { NewProjectFlags, ProjectSpec } from "./new-project.js";

export type { ProjectSpec };

/**
 * Build a ProjectSpec from CLI flags.
 *
 * Resolution order:
 * 1. --file  – reads a JSON file; must contain at least { vision: string }
 * 2. --vision / --description flags override or supplement file values
 *
 * Throws with a usage message if vision is missing.
 */
export function autoSpec(flags: NewProjectFlags): ProjectSpec {
  let partial: Partial<ProjectSpec> = {};

  if (flags.file) {
    let raw: string;
    try {
      raw = readFileSync(flags.file, "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read requirements file "${flags.file}": ${msg}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse requirements file "${flags.file}" as JSON: ${msg}`);
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        `Requirements file "${flags.file}" must contain a JSON object with at least a "vision" field.`,
      );
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj["vision"] === "string") {
      partial.vision = obj["vision"];
    }
    if (typeof obj["name"] === "string") {
      partial.name = obj["name"];
    }
    if (typeof obj["constraints"] === "string") {
      partial.constraints = obj["constraints"];
    }
    if (Array.isArray(obj["requirements"])) {
      partial.requirements = obj["requirements"] as ProjectSpec["requirements"];
    }
  }

  // CLI flags override file values
  if (flags.vision) {
    partial.vision = flags.vision;
  }
  if (flags.description) {
    // Map --description to the constraints field (extended description)
    partial.constraints = flags.description;
  }

  if (!partial.vision) {
    throw new Error(
      "Missing required field: --vision <text>\n" +
        "\n" +
        "In auto mode you must supply a vision either via:\n" +
        "  --vision \"<one-line vision statement>\"\n" +
        "  --file <path>   (JSON file containing { \"vision\": \"...\" })",
    );
  }

  return {
    name: partial.name ?? "",
    vision: partial.vision,
    constraints: partial.constraints ?? "",
    requirements: partial.requirements ?? [],
  };
}
