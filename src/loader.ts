#!/usr/bin/env node
import { main } from "./cli.js";

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
