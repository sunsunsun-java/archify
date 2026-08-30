import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AUTHORING_TYPES,
  loadAuthoringKit,
} from '../authoring/authoring-kit.mjs';
import {
  QUALITY_CONTRACT,
  QUALITY_CONTRACT_DIGEST,
} from '../authoring/quality-contract.mjs';
import {
  DESKTOP_READER_DIAGRAM_WIDTH,
  MIN_PROJECTED_NODE_TEXT_PX,
  projectedNodeTextPx,
} from '../renderers/shared/desktop-readability.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(skillRoot, 'bin', 'archify.mjs');

const expectedExamples = {
  architecture: 'examples/web-app.architecture.json',
  workflow: 'examples/agent-tool-call.workflow.json',
  sequence: 'examples/cache-miss-request.sequence.json',
  dataflow: 'examples/product-analytics.dataflow.json',
  lifecycle: 'examples/agent-run.lifecycle.json',
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('authoring kit returns the exact schema, common schema, and one matching example', () => {
  assert.deepEqual(AUTHORING_TYPES, Object.keys(expectedExamples));

  for (const type of AUTHORING_TYPES) {
    const kit = loadAuthoringKit(type);
    assert.equal(kit.schemaVersion, 1);
    assert.equal(kit.type, type);
    assert.deepEqual(kit.layoutBudget.targetViewport, [1440, 900]);
    assert.equal(kit.layoutBudget.qualityGuards.deterministicChecks, 9);
    assert.equal(kit.layoutBudget.qualityGuards.desktopViewports.length, 4);
    assert.equal(kit.layoutBudget.qualityGuards.semanticDeletionAllowed, false);
    assert.equal(
      kit.layoutBudget.recommendedViewBox[0] <= kit.layoutBudget.maximumRecommendedViewBoxWidth,
      true,
    );
    assert.equal(kit.layoutBudget.desktopReadability.minimumProjectedNodeTextPx, 6);
    assert.equal(kit.layoutBudget.desktopReadability.diagramWidth, 930);
    assert.equal(kit.layoutBudget.desktopReadability.diagramWidth, DESKTOP_READER_DIAGRAM_WIDTH);
    assert.equal(
      kit.layoutBudget.desktopReadability.minimumProjectedNodeTextPx,
      MIN_PROJECTED_NODE_TEXT_PX,
    );
    assert.ok(Math.abs(projectedNodeTextPx(
      kit.layoutBudget.desktopReadability.minimumSourceNodeTextPxAtMaximumWidth,
      kit.layoutBudget.maximumRecommendedViewBoxWidth,
    ) - MIN_PROJECTED_NODE_TEXT_PX) < 1e-12);
    assert.equal(
      kit.layoutBudget.recommendedViewBox[1] / kit.layoutBudget.recommendedViewBox[0]
        <= kit.layoutBudget.maximumViewBoxAspectRatio,
      true,
    );
    assert.match(kit.commands.validate, new RegExp(`validate ${type}`));
    assert.match(kit.commands.validate, /--repair-history <repair-history\.json>/);
    assert.match(kit.commands.validate, /--require-authored-language <en\|zh-CN>/);
    assert.match(kit.commands.validateStructuralReflow, /--repair-mode structural-reflow/);
    assert.match(kit.commands.inspectLayout, /--layout-json/);
    assert.match(kit.commands.preflight, /--preflight/);
    assert.match(kit.commands.preflight, /--repair-history <repair-history\.json>/);
    assert.match(kit.commands.deliver, /--require-authored-language <en\|zh-CN>/);
    assert.match(kit.commands.sourceSearch, /project-index source-search/);
    assert.match(kit.commands.sourceInspect, /project-index inspect/);
    assert.match(kit.commands.evidenceHydrate, /evidence-ledger hydrate/);
    assert.match(kit.commands.evidenceVerify, /evidence-ledger verify/);
    assert.match(kit.commands.authoringRunStart, new RegExp(`authoring-run start ${type}`));
    assert.match(kit.commands.authoringRunStart, /--repo-root <path>/);
    assert.match(kit.commands.authoringRunStart, /--project-index <index\.json>/);
    assert.match(kit.commands.authoringRunStart, /--require-authored-language <en\|zh-CN>/);
    assert.match(kit.commands.authoringRunFinalize, /authoring-run finalize/);
    assert.equal(kit.capabilities.repositoryEvidence, true);
    assert.equal(kit.capabilities.projectSourceSearch, true);
    assert.equal(kit.capabilities.evidenceLedgerVerify, true);
    assert.equal(kit.capabilities.machineAuthoringReport, true);
    assert.equal(kit.capabilities.deterministicRepairPlan, true);
    assert.equal(kit.repairPolicy.maxStructuralReflows, 2);
    assert.equal(kit.repairPolicy.maxTotalAttempts, 24);
    assert.equal(Array.isArray(kit.evidenceSelectionTemplate.document), true);
    assert.deepEqual(Object.keys(kit.evidenceSelectionTemplate.document[0]), [
      'claimId',
      'path',
      'line',
      'endLine',
      'summary',
    ]);
    assert.match(kit.evidenceSelectionTemplate.rootShape, /JSON array/);
    assert.equal(Object.isFrozen(kit.evidenceSelectionTemplate), true);
    assert.equal(Object.isFrozen(kit.evidenceSelectionTemplate.document), true);
    assert.equal(Object.isFrozen(kit.evidenceSelectionTemplate.document[0]), true);
    assert.equal(Array.isArray(JSON.parse(JSON.stringify(kit)).evidenceSelectionTemplate.document), true);
    assert.ok(kit.workflow.length >= 5);
    assert.deepEqual(Object.keys(kit.files), ['schema', 'commonSchema', 'example']);
    assert.equal(kit.files.schema.path, `schemas/${type}.schema.json`);
    assert.equal(kit.files.commonSchema.path, 'schemas/common.schema.json');
    assert.equal(kit.files.example.path, expectedExamples[type]);

    for (const file of Object.values(kit.files)) {
      assert.equal(file.bytes, Buffer.byteLength(file.content));
      assert.equal(file.sha256, sha256(file.content));
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
      assert.doesNotThrow(() => JSON.parse(file.content));
    }
  }
});

test('workflow authoring budget prevents repeated main-path lane re-entry', () => {
  const composition = loadAuthoringKit('workflow').layoutBudget.composition;

  assert.match(composition, /primary lane|contiguous lane segments/i);
  assert.match(composition, /back-and-forth|repeated lane re-entry/i);
  assert.match(composition, /branch/i);
});

test('authoring kit rejects unknown types without falling back to another example', () => {
  assert.throws(
    () => loadAuthoringKit('deployment'),
    /Unknown diagram type "deployment"/,
  );
});

test('authoring kit binds the exact shared quality and skill contracts', () => {
  const kit = loadAuthoringKit('lifecycle', {
    expectContract: QUALITY_CONTRACT_DIGEST,
  });

  assert.deepEqual(kit.layoutBudget.qualityGuards, QUALITY_CONTRACT.guards);
  assert.deepEqual(kit.layoutBudget.recommendedViewBox, [1080, 630]);
  assert.equal(kit.contract.quality.sha256, QUALITY_CONTRACT_DIGEST);
  assert.equal(kit.contract.quality.schemaVersion, QUALITY_CONTRACT.schemaVersion);
  assert.equal(kit.contract.skill.version, '2.16');
  assert.match(kit.contract.skill.sha256, /^[a-f0-9]{64}$/);
  assert.throws(
    () => loadAuthoringKit('workflow', { expectContract: '0'.repeat(64) }),
    /quality contract mismatch/i,
  );
});

test('context-json packet carries lossless parsed documents without escaped source copies', () => {
  const packet = loadAuthoringKit('dataflow', { contextJson: true });
  const serialized = JSON.stringify(packet);
  const roundTripped = JSON.parse(serialized);

  for (const file of Object.values(roundTripped.files)) {
    const source = fs.readFileSync(path.join(skillRoot, file.path), 'utf8');
    assert.deepEqual(file.document, JSON.parse(source));
    assert.equal(file.content, undefined);
    assert.equal(file.bytes, Buffer.byteLength(source));
    assert.equal(file.sha256, sha256(source));
  }

  const legacy = loadAuthoringKit('dataflow');
  assert.equal(typeof legacy.files.schema.content, 'string');
  assert.equal(legacy.files.schema.document, undefined);
});

test('authoring-kit CLI emits a complete machine packet without an extra discovery round trip', () => {
  const result = spawnSync(process.execPath, [cli, 'authoring-kit', 'workflow', '--json'], {
    cwd: skillRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.type, 'workflow');
  assert.equal(packet.files.schema.path, 'schemas/workflow.schema.json');
  assert.equal(packet.files.commonSchema.path, 'schemas/common.schema.json');
  assert.equal(packet.files.example.path, 'examples/agent-tool-call.workflow.json');
  assert.match(packet.files.example.content, /Agent Tool Call Workflow/);
  assert.deepEqual(packet.layoutBudget.recommendedViewBox, [960, 540]);
  assert.equal(packet.layoutBudget.maximumRecommendedViewBoxWidth, 960);
  assert.match(packet.evidenceSelectionTemplate.rootShape, /JSON array/);
  assert.match(packet.commands.deliver, /deliver workflow/);
  assert.doesNotMatch(packet.commands.deliver, /--repo-root/);
});

test('authoring-kit CLI emits compact context JSON and rejects contract drift', () => {
  const accepted = spawnSync(process.execPath, [
    cli,
    'authoring-kit',
    'workflow',
    '--json',
    '--context-json',
    '--expect-contract',
    QUALITY_CONTRACT_DIGEST,
  ], { cwd: skillRoot, encoding: 'utf8' });
  assert.equal(accepted.status, 0, accepted.stderr);
  const packet = JSON.parse(accepted.stdout);
  assert.equal(packet.files.schema.content, undefined);
  assert.deepEqual(packet.files.schema.document, JSON.parse(
    fs.readFileSync(path.join(skillRoot, 'schemas/workflow.schema.json'), 'utf8'),
  ));
  const legacy = spawnSync(process.execPath, [
    cli,
    'authoring-kit',
    'workflow',
    '--json',
  ], { cwd: skillRoot, encoding: 'utf8' });
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.ok(Buffer.byteLength(accepted.stdout) < Buffer.byteLength(legacy.stdout));

  const rejected = spawnSync(process.execPath, [
    cli,
    'authoring-kit',
    'workflow',
    '--json',
    '--expect-contract',
    '0'.repeat(64),
  ], { cwd: skillRoot, encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(JSON.parse(rejected.stdout).error, /quality contract mismatch/i);
});
