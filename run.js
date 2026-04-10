#!/usr/bin/env node
/**
 * Nexgen Tax Engine – CLI Runner
 *
 * Usage:
 *   node run.js <input.json> [output.json]
 *
 * If output.json is omitted, prints to stdout.
 *
 * Examples:
 *   node run.js examples/example1_individual.json
 *   node run.js examples/example1_individual.json results/output1.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { run } = require('./engine/calculate');

const [,, inputArg, outputArg] = process.argv;

if (!inputArg) {
  console.error('Usage: node run.js <input.json> [output.json]');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

const rawInput = fs.readFileSync(inputPath, 'utf-8');
const output   = run(rawInput);
const outputJSON = JSON.stringify(output, null, 2);

if (outputArg) {
  const outPath = path.resolve(outputArg);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, outputJSON, 'utf-8');
  console.log(`Output written to ${outPath}`);
} else {
  console.log(outputJSON);
}

// Exit with error code if calculation failed
if (output.status === 'error') process.exit(2);
