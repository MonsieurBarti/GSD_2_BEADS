/**
 * new-project command
 *
 * Entry point for creating a new GSD-2 project. Captures vision, ingests
 * requirements, and stores a roadmap as beads. Supports interactive and
 * auto (non-interactive) modes.
 */

export interface Requirement {
  title: string;
  description: string;
}

export interface ProjectSpec {
  name: string;
  vision: string;
  constraints: string;
  requirements: Requirement[];
}

export interface NewProjectFlags {
  vision?: string;
  description?: string;
  file?: string;
  auto: boolean;
}

const KNOWN_FLAGS = new Set(["--vision", "--description", "--file", "--auto"]);

function printUsage(): void {
  console.log("Usage: gsd2b new-project [options]\n");
  console.log("Aliases: init\n");
  console.log("Options:");
  console.log("  --vision <text>       One-line vision statement for the project");
  console.log("  --description <text>  Extended project description");
  console.log("  --file <path>         Path to a requirements file to ingest");
  console.log("  --auto                Non-interactive mode (skip prompts)");
  console.log("  --help                Show this help message");
}

function parseFlags(args: string[]): NewProjectFlags | null {
  const flags: NewProjectFlags = { auto: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      return null;
    }

    if (arg === "--auto") {
      flags.auto = true;
      continue;
    }

    if (arg === "--vision") {
      flags.vision = args[++i];
      continue;
    }

    if (arg === "--description") {
      flags.description = args[++i];
      continue;
    }

    if (arg === "--file") {
      flags.file = args[++i];
      continue;
    }

    if (arg.startsWith("--vision=")) {
      flags.vision = arg.slice("--vision=".length);
      continue;
    }

    if (arg.startsWith("--description=")) {
      flags.description = arg.slice("--description=".length);
      continue;
    }

    if (arg.startsWith("--file=")) {
      flags.file = arg.slice("--file=".length);
      continue;
    }

    // Skip the command name itself ('new-project' or 'init')
    if (arg === "new-project" || arg === "init") {
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
  }

  return flags;
}

function isTTY(): boolean {
  return Boolean(process.stdin.isTTY);
}

async function runInteractive(flags: NewProjectFlags): Promise<void> {
  // Placeholder: interactive vision capture will be implemented in a later task.
  console.log("Interactive new-project flow (not yet implemented).");
  console.log("Flags received:", flags);
}

async function runAuto(flags: NewProjectFlags): Promise<void> {
  // Placeholder: auto mode will be implemented in a later task.
  console.log("Auto new-project flow (not yet implemented).");
  console.log("Flags received:", flags);
}

export async function newProject(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  if (flags === null) {
    // Either --help was requested or an unknown flag was encountered.
    // Usage/error already printed; just return.
    return;
  }

  const useAuto = flags.auto || !isTTY();

  if (useAuto) {
    await runAuto(flags);
  } else {
    await runInteractive(flags);
  }
}
