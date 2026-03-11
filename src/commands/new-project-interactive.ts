/**
 * new-project-interactive
 *
 * Readline-based conversational capture for project vision and requirements.
 * Exports discuss() which returns a structured ProjectSpec.
 */

import * as readline from "readline";
import { ProjectSpec, Requirement } from "./new-project.js";

export { ProjectSpec, Requirement };

function createInterface(): readline.Interface {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    console.log("\nAborted.");
    process.exit(0);
  });

  return rl;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function askRequired(
  rl: readline.Interface,
  question: string,
  fieldName: string
): Promise<string> {
  let value = "";
  while (!value) {
    value = await ask(rl, question);
    if (!value) {
      console.log(`${fieldName} cannot be empty. Please try again.`);
    }
  }
  return value;
}

async function collectRequirements(
  rl: readline.Interface
): Promise<Requirement[]> {
  const requirements: Requirement[] = [];

  console.log(
    "\nNow let's capture your requirements. Enter them one at a time."
  );
  console.log('(Press Enter with an empty title when you are done.)\n');

  while (true) {
    const title = await ask(
      rl,
      `Requirement #${requirements.length + 1} title (or Enter to finish): `
    );
    if (!title) {
      break;
    }

    const description = await ask(rl, `  Description for "${title}": `);
    requirements.push({ title, description });
    console.log(`  Added: ${title}`);
  }

  return requirements;
}

export async function discuss(): Promise<ProjectSpec> {
  const rl = createInterface();

  try {
    console.log("\nWelcome to GSD-2 new project setup.\n");

    const name = await askRequired(rl, "Project name: ", "Project name");

    console.log(
      '\nVision statement (describe the goal of this project in one or more sentences):'
    );
    const vision = await askRequired(rl, "> ", "Vision");

    console.log(
      "\nKey constraints (technical, time, budget, etc. — or press Enter to skip):"
    );
    const constraints = await ask(rl, "> ");

    const requirements = await collectRequirements(rl);

    console.log("\nProject capture complete.\n");

    return { name, vision, constraints, requirements };
  } finally {
    rl.close();
  }
}
