/**
 * remember / recall commands
 *
 * remember <key> <value>  — stores a memory via state.ts remember()
 * recall <key>            — retrieves a memory via state.ts recall()
 */

import { remember, recall } from "../state.js";

function printRememberUsage(): void {
  console.log("Usage: gsd2b remember <key> <value>\n");
  console.log("Store a named memory value.\n");
  console.log("Options:");
  console.log("  --json    Output in JSON format");
  console.log("  --help    Show this help message");
}

function printRecallUsage(): void {
  console.log("Usage: gsd2b recall <key>\n");
  console.log("Retrieve a named memory value.\n");
  console.log("Options:");
  console.log("  --json    Output in JSON format");
  console.log("  --help    Show this help message");
}

export function runRemember(args: string[]): void {
  const json = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("-"));

  if (args.includes("--help") || args.includes("-h")) {
    printRememberUsage();
    return;
  }

  if (positional.length < 2) {
    console.error("Error: <key> and <value> are required\n");
    printRememberUsage();
    process.exitCode = 1;
    return;
  }

  const key = positional[0];
  const value = positional[1];

  remember(key, value);

  if (json) {
    console.log(JSON.stringify({ key, value, stored: true }));
  } else {
    console.log(`Stored: ${key} = ${value}`);
  }
}

export function runRecall(args: string[]): void {
  const json = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("-"));

  if (args.includes("--help") || args.includes("-h")) {
    printRecallUsage();
    return;
  }

  if (positional.length < 1) {
    console.error("Error: <key> is required\n");
    printRecallUsage();
    process.exitCode = 1;
    return;
  }

  const key = positional[0];
  const value = recall(key);

  if (json) {
    console.log(JSON.stringify({ key, value }));
  } else {
    if (value === null) {
      console.log("No memory found");
    } else {
      console.log(value);
    }
  }
}
