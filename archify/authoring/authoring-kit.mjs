import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const AUTHORING_TYPES = Object.freeze([
  'architecture',
  'workflow',
  'sequence',
  'dataflow',
  'lifecycle',
]);

const EXAMPLES = Object.freeze({
  architecture: 'examples/web-app.architecture.json',
  workflow: 'examples/agent-tool-call.workflow.json',
  sequence: 'examples/cache-miss-request.sequence.json',
  dataflow: 'examples/product-analytics.dataflow.json',
  lifecycle: 'examples/agent-run.lifecycle.json',
});

const LAYOUT_BUDGETS = Object.freeze({
  architecture: Object.freeze({
    recommendedViewBox: Object.freeze([1280, 640]),
    maximumViewBoxAspectRatio: 0.5,
    primaryLimits: Object.freeze({ components: 12, boundaries: 4, cards: 3, guidedViews: 2 }),
    composition: 'Use one left-to-right main path with short vertical branches.',
  }),
  workflow: Object.freeze({
    recommendedViewBox: Object.freeze([1000, 540]),
    maximumViewBoxAspectRatio: 0.54,
    primaryLimits: Object.freeze({ nodes: 12, lanes: 4, cards: 2, guidedViews: 2 }),
    composition: 'Prefer horizontal lanes or phases; reserve vertical stacks for short exception paths.',
  }),
  sequence: Object.freeze({
    recommendedViewBox: Object.freeze([1080, 620]),
    maximumViewBoxAspectRatio: 0.575,
    primaryLimits: Object.freeze({ participants: 7, messages: 13, cards: 3, guidedViews: 2 }),
    composition: 'Keep one authored timeline and merge repeated low-information events before changing typography.',
  }),
  dataflow: Object.freeze({
    recommendedViewBox: Object.freeze([1080, 600]),
    maximumViewBoxAspectRatio: 0.556,
    primaryLimits: Object.freeze({ nodes: 12, stages: 5, cards: 2, guidedViews: 2 }),
    composition: 'Use horizontal stage bands and keep persistence or recovery paths as compact side branches.',
  }),
  lifecycle: Object.freeze({
    recommendedViewBox: Object.freeze([1080, 620]),
    maximumViewBoxAspectRatio: 0.575,
    primaryLimits: Object.freeze({ states: 10, lanes: 4, cards: 2, guidedViews: 2 }),
    composition: 'Keep the main lifecycle horizontal and place terminal outcomes in one compact terminal band.',
  }),
});

const QUALITY_GUARDS = Object.freeze({
  qualityProfile: 'showcase',
  deterministicChecks: 9,
  compositionErrors: 0,
  compositionWarnings: 0,
  desktopViewports: Object.freeze([
    Object.freeze([1440, 900]),
    Object.freeze([1600, 1000]),
    Object.freeze([1920, 1080]),
    Object.freeze([2048, 1320]),
  ]),
  minimumProjectedNodeTextPx: 6,
  semanticDeletionAllowed: false,
  typographyReductionAllowed: false,
});

function authoringCommands(type) {
  const repositoryOption = type === 'architecture' ? ' [--repo-root <path>]' : '';
  return Object.freeze({
    validate: `node bin/archify.mjs validate ${type} <candidate.json> --quality showcase${repositoryOption} --json`,
    preflight: `node bin/archify.mjs validate ${type} <candidate.json> --quality showcase${repositoryOption} --preflight --json`,
    preflightBatch: 'node bin/archify.mjs validate-batch <candidates.json> --quality showcase --json',
    deliver: `node bin/archify.mjs deliver ${type} <candidate.json> <output.html> --quality showcase${repositoryOption} --json`,
    visualCheck: 'node bin/archify.mjs visual-check <output.html>... --json',
    projectQuery: 'node bin/archify.mjs project-index query <index.json> [--symbol <name>] [--import <specifier>] [--path <prefix>] --json',
    evidenceHydrate: 'node bin/archify.mjs evidence-ledger hydrate <index.json> <selections.json> --output <ledger.json> --json',
  });
}

function filePacket(skillRoot, relativePath) {
  const absolutePath = path.join(skillRoot, ...relativePath.split('/'));
  const content = fs.readFileSync(absolutePath, 'utf8');
  return Object.freeze({
    path: relativePath,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
    content,
  });
}

/**
 * Return the complete, byte-identical authoring contract for one diagram type.
 * Callers learn one interface; file discovery and matching-example selection
 * remain local to this module.
 */
export function loadAuthoringKit(type, { skillRoot = moduleRoot } = {}) {
  if (!AUTHORING_TYPES.includes(type)) {
    throw new Error(`Unknown diagram type "${type}". Expected one of: ${AUTHORING_TYPES.join(', ')}`);
  }
  const resolvedRoot = fs.realpathSync(path.resolve(skillRoot));
  return Object.freeze({
    schemaVersion: 1,
    type,
    layoutBudget: Object.freeze({
      targetViewport: Object.freeze([1440, 900]),
      ...LAYOUT_BUDGETS[type],
      qualityGuards: QUALITY_GUARDS,
    }),
    commands: authoringCommands(type),
    capabilities: Object.freeze({
      repositoryEvidence: type === 'architecture',
      projectIndexQuery: true,
      evidenceLedgerHydrate: true,
      deterministicRepairPlan: true,
      sharedVisualCheckSession: true,
      atomicDelivery: true,
    }),
    workflow: Object.freeze([
      'author a fresh candidate within layoutBudget',
      'validate after every candidate edit',
      'use repairPlan actions without deleting semantics or reducing typography',
      'run preflight on the first deterministic pass and before freezing',
      'hydrate and verify revision-pinned evidence before delivery',
      'deliver the frozen candidate exactly once',
    ]),
    files: Object.freeze({
      schema: filePacket(resolvedRoot, `schemas/${type}.schema.json`),
      commonSchema: filePacket(resolvedRoot, 'schemas/common.schema.json'),
      example: filePacket(resolvedRoot, EXAMPLES[type]),
    }),
  });
}
