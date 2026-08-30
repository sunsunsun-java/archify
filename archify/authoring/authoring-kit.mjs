import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUALITY_CONTRACT,
  assertExpectedQualityContract,
  qualityContractIdentity,
} from './quality-contract.mjs';
import {
  DESKTOP_READER_DIAGRAM_WIDTH,
  MIN_PROJECTED_NODE_TEXT_PX,
  minimumReadableSourceTextPx,
} from '../renderers/shared/desktop-readability.mjs';

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

function desktopReadability(maximumViewBoxWidth) {
  return Object.freeze({
    diagramWidth: DESKTOP_READER_DIAGRAM_WIDTH,
    minimumProjectedNodeTextPx: MIN_PROJECTED_NODE_TEXT_PX,
    minimumSourceNodeTextPxAtMaximumWidth: minimumReadableSourceTextPx(maximumViewBoxWidth),
    formula: 'sourceFontPx * min(1, diagramWidth / viewBoxWidth) >= minimumProjectedNodeTextPx',
  });
}

const EVIDENCE_SELECTION_TEMPLATE = Object.freeze({
  rootShape: 'selections.json must be a bare JSON array of source selections, not an object wrapper.',
  document: freezeDocument([{
    claimId: 'stable-source-fact-id',
    path: 'path/from-project-index',
    line: 1,
    endLine: 1,
    summary: 'short source-derived fact',
  }]),
});

const LAYOUT_BUDGETS = Object.freeze({
  architecture: Object.freeze({
    recommendedViewBox: Object.freeze([1080, 600]),
    maximumRecommendedViewBoxWidth: 1080,
    maximumViewBoxAspectRatio: 0.556,
    desktopReadability: desktopReadability(1080),
    primaryLimits: Object.freeze({ components: 12, boundaries: 4, cards: 3, guidedViews: 2 }),
    composition: 'Use one left-to-right main path with short vertical branches.',
  }),
  workflow: Object.freeze({
    recommendedViewBox: Object.freeze([960, 540]),
    maximumRecommendedViewBoxWidth: 960,
    maximumViewBoxAspectRatio: 0.563,
    desktopReadability: desktopReadability(960),
    primaryLimits: Object.freeze({ nodes: 12, lanes: 4, cards: 2, guidedViews: 2 }),
    composition: 'Use schema v2 horizontal lanes or phases with constraint-driven readable layout; retain schema v1 only for fixed legacy geometry compatibility.',
  }),
  sequence: Object.freeze({
    recommendedViewBox: Object.freeze([1080, 620]),
    maximumRecommendedViewBoxWidth: 1080,
    maximumViewBoxAspectRatio: 0.575,
    desktopReadability: desktopReadability(1080),
    primaryLimits: Object.freeze({ participants: 7, messages: 13, cards: 3, guidedViews: 2 }),
    composition: 'Keep one authored timeline and merge repeated low-information events before changing typography.',
  }),
  dataflow: Object.freeze({
    recommendedViewBox: Object.freeze([1080, 600]),
    maximumRecommendedViewBoxWidth: 1080,
    maximumViewBoxAspectRatio: 0.556,
    desktopReadability: desktopReadability(1080),
    primaryLimits: Object.freeze({ nodes: 12, stages: 5, cards: 2, guidedViews: 2 }),
    composition: 'Use horizontal stage bands and keep persistence or recovery paths as compact side branches.',
  }),
  lifecycle: Object.freeze({
    recommendedViewBox: Object.freeze([1080, 630]),
    maximumRecommendedViewBoxWidth: 1080,
    maximumViewBoxAspectRatio: 0.584,
    desktopReadability: desktopReadability(1080),
    primaryLimits: Object.freeze({ states: 10, lanes: 4, cards: 2, guidedViews: 2 }),
    composition: 'Keep the main lifecycle horizontal and place terminal outcomes in one compact terminal band.',
  }),
});

function authoringCommands(type) {
  const repositoryOption = type === 'architecture' ? ' [--repo-root <path>]' : '';
  const languageOption = ' --require-authored-language <en|zh-CN>';
  return Object.freeze({
    validate: `node bin/archify.mjs validate ${type} <candidate.json> --quality showcase${repositoryOption}${languageOption} --repair-history <repair-history.json> --json`,
    validateStructuralReflow: `node bin/archify.mjs validate ${type} <candidate.json> --quality showcase${repositoryOption}${languageOption} --repair-history <repair-history.json> --repair-mode structural-reflow --json`,
    inspectLayout: `node bin/archify.mjs validate ${type} <candidate.json> --quality showcase${repositoryOption} --layout-json`,
    preflight: `node bin/archify.mjs validate ${type} <candidate.json> --quality showcase${repositoryOption}${languageOption} --repair-history <repair-history.json> --preflight --json`,
    preflightBatch: 'node bin/archify.mjs validate-batch <candidates.json> --quality showcase --json',
    deliver: `node bin/archify.mjs deliver ${type} <candidate.json> <output.html> --quality showcase${repositoryOption}${languageOption} --json`,
    visualCheck: 'node bin/archify.mjs visual-check <output.html>... --json',
    projectQuery: 'node bin/archify.mjs project-index query <index.json> [--symbol <name>] [--import <specifier>] [--path <prefix>] --json',
    sourceSearch: 'node bin/archify.mjs project-index source-search <index.json> --term <literal> [--path <prefix>] --context-lines 3 --json',
    sourceInspect: 'node bin/archify.mjs project-index inspect <index.json> --range <path:start-end> --json',
    evidenceHydrate: 'node bin/archify.mjs evidence-ledger hydrate <index.json> <selections.json> --output <ledger.json> --json',
    evidenceVerify: 'node bin/archify.mjs evidence-ledger verify <ledger.json> --project-index <index.json> --repo-root <path> --json',
    authoringRunStart: `node bin/archify.mjs authoring-run start ${type} --run-id <id> --output <run-directory> --repo-root <path> --project-index <index.json>${languageOption} --json`,
    authoringRunFinalize: 'node bin/archify.mjs authoring-run finalize <authoring-run.json> --candidate <candidate.json> --evidence <ledger.json> --validation <validation.json> --json',
  });
}

function freezeDocument(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDocument(child);
  return Object.freeze(value);
}

function filePacket(skillRoot, relativePath, { contextJson = false } = {}) {
  const absolutePath = path.join(skillRoot, ...relativePath.split('/'));
  const content = fs.readFileSync(absolutePath, 'utf8');
  return Object.freeze({
    path: relativePath,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
    ...(contextJson
      ? { document: freezeDocument(JSON.parse(content)) }
      : { content }),
  });
}

/**
 * Return the complete, byte-identical authoring contract for one diagram type.
 * Callers learn one interface; file discovery and matching-example selection
 * remain local to this module.
 */
export function loadAuthoringKit(type, {
  skillRoot = moduleRoot,
  expectContract,
  contextJson = false,
} = {}) {
  if (!AUTHORING_TYPES.includes(type)) {
    throw new Error(`Unknown diagram type "${type}". Expected one of: ${AUTHORING_TYPES.join(', ')}`);
  }
  if (expectContract !== undefined) assertExpectedQualityContract(expectContract);
  const resolvedRoot = fs.realpathSync(path.resolve(skillRoot));
  return Object.freeze({
    schemaVersion: 1,
    type,
    contract: qualityContractIdentity({ skillRoot: resolvedRoot }),
    layoutBudget: Object.freeze({
      targetViewport: Object.freeze([1440, 900]),
      ...LAYOUT_BUDGETS[type],
      qualityGuards: QUALITY_CONTRACT.guards,
    }),
    commands: authoringCommands(type),
    evidenceSelectionTemplate: EVIDENCE_SELECTION_TEMPLATE,
    repairPolicy: QUALITY_CONTRACT.repairPolicy,
    capabilities: Object.freeze({
      repositoryEvidence: true,
      projectIndexQuery: true,
      projectSourceSearch: true,
      evidenceLedgerHydrate: true,
      evidenceLedgerVerify: true,
      deterministicRepairPlan: true,
      machineAuthoringReport: true,
      sharedVisualCheckSession: true,
      atomicDelivery: true,
    }),
    workflow: Object.freeze([
      'author a fresh candidate within layoutBudget',
      'validate after every candidate edit',
      'reuse one repair-history file and follow repairPlan; validate a requested reflow with --repair-mode structural-reflow, without deleting semantics or reducing typography',
      'run preflight on the first deterministic pass and before freezing',
      'write selections.json using evidenceSelectionTemplate.document as the exact root shape, then hydrate and verify revision-pinned evidence before delivery',
      'deliver the frozen candidate exactly once',
    ]),
    files: Object.freeze({
      schema: filePacket(resolvedRoot, `schemas/${type}.schema.json`, { contextJson }),
      commonSchema: filePacket(resolvedRoot, 'schemas/common.schema.json', { contextJson }),
      example: filePacket(resolvedRoot, EXAMPLES[type], { contextJson }),
    }),
  });
}
