import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AUTHORING_TYPES,
  loadAuthoringKit,
} from '../authoring/authoring-kit.mjs';

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
    assert.match(kit.commands.validate, new RegExp(`validate ${type}`));
    assert.match(kit.commands.preflight, /--preflight/);
    assert.match(kit.commands.evidenceHydrate, /evidence-ledger hydrate/);
    assert.equal(kit.capabilities.repositoryEvidence, type === 'architecture');
    assert.equal(kit.capabilities.deterministicRepairPlan, true);
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

test('authoring kit rejects unknown types without falling back to another example', () => {
  assert.throws(
    () => loadAuthoringKit('deployment'),
    /Unknown diagram type "deployment"/,
  );
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
  assert.deepEqual(packet.layoutBudget.recommendedViewBox, [1000, 540]);
  assert.match(packet.commands.deliver, /deliver workflow/);
  assert.doesNotMatch(packet.commands.deliver, /--repo-root/);
});
