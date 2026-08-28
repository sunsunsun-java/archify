#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSuite } from '../orchestration/suite-runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  return `Usage:
  archify run-suite --manifest <suite.json> --repo-root <checkout> \\
    --revision <full-commit-id> --output <directory> [options]

Options:
  --archify-cli <file>  Archify CLI entrypoint (default: bin/archify.mjs)
  --concurrency <n>     Number of isolated diagram runs (default: 1)
  --json                Print the suite receipt as JSON
  -h, --help            Show this help

The runner executes typed manifest commands. It does not call a model or
author diagram semantics. Deterministic/browser success leaves the independent
human visual review in pending state. Set manifest.projectIndex to true to
build one shared revision-pinned mechanical fact index.`;
}

function parseArguments(argv) {
  const options = {
    archifyCli: path.join(here, 'archify.mjs'),
    concurrency: 1,
    json: false,
    help: false,
  };
  const valueOptions = new Map([
    ['--manifest', 'manifestPath'],
    ['--repo-root', 'repoRoot'],
    ['--revision', 'revision'],
    ['--output', 'outputRoot'],
    ['--archify-cli', 'archifyCli'],
    ['--concurrency', 'concurrency'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '-h' || argument === '--help') {
      options.help = true;
      continue;
    }
    const key = valueOptions.get(argument);
    if (!key) throw new Error(`Unknown option ${JSON.stringify(argument)}.`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    options[key] = key === 'concurrency' ? Number(value) : value;
  }

  if (!options.help) {
    for (const [key, flag] of [
      ['manifestPath', '--manifest'],
      ['repoRoot', '--repo-root'],
      ['revision', '--revision'],
      ['outputRoot', '--output'],
    ]) {
      if (!options[key]) throw new Error(`Missing required option ${flag}.`);
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArguments(argv);
    if (options.help) {
      console.log(usage());
      return 0;
    }
    const summary = await runSuite(options);
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`Suite ${summary.id}: ${summary.status}`);
      console.log(`Report: ${summary.report}`);
    }
    return summary.status === 'automated-failure' ? 1 : 0;
  } catch (error) {
    if (options?.json || argv.includes('--json')) {
      console.log(JSON.stringify({
        schemaVersion: 1,
        ok: false,
        command: 'run-suite',
        error: error.message,
      }, null, 2));
    } else {
      console.error(`run-suite failed: ${error.message}`);
    }
    return 1;
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
