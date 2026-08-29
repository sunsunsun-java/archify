import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCandidatePreflightBatch } from '../authoring/candidate-preflight.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class FakeSession {
  calls = [];

  async preflight({ artifactPath, finalArtifact }) {
    const artifact = fs.readFileSync(artifactPath);
    this.calls.push({ artifactPath, finalArtifact });
    return {
      exitCode: 0,
      receipt: {
        schemaVersion: 1,
        ok: true,
        command: 'visual-preflight',
        status: 'pass',
        artifact: {
          path: artifactPath,
          bytes: artifact.byteLength,
          sha256: createHash('sha256').update(artifact).digest('hex'),
        },
        containment: { status: 'pass', viewports: [] },
        captures: { status: 'skipped', screenshots: [] },
        sidecars: { receipt: 'temporary.json' },
        diagnostics: [],
      },
    };
  }
}

test('candidate preflight renders and checks several candidates before reusing one browser session', async () => {
  const session = new FakeSession();
  const result = await runCandidatePreflightBatch({
    skillRoot,
    session,
    candidates: [
      {
        id: 'workflow',
        type: 'workflow',
        input: path.join(skillRoot, 'examples', 'agent-tool-call.workflow.json'),
      },
      {
        id: 'dataflow',
        type: 'dataflow',
        input: path.join(skillRoot, 'examples', 'product-analytics.dataflow.json'),
      },
    ],
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.receipt.ok, true);
  assert.equal(result.receipt.command, 'validate-batch');
  assert.deepEqual(result.receipt.session, {
    shared: true,
    candidates: 2,
    expectedBrowserResets: 1,
  });
  assert.equal(result.receipt.timing.source, 'validate-batch');
  assert.ok(result.receipt.timing.durationMs >= 0);
  assert.deepEqual(session.calls.map((call) => call.finalArtifact), [false, true]);
  assert.equal(result.receipt.candidates.length, 2);
  assert.equal(result.receipt.candidates.every((receipt) => receipt.checks.length === 9), true);
  assert.equal(result.receipt.candidates.every((receipt) => receipt.preflight.artifact.ephemeral === true), true);
  for (const receipt of result.receipt.candidates) {
    assert.equal(receipt.timing.source, 'candidate-preflight');
    assert.equal(
      receipt.timing.durationMs,
      Number((receipt.timing.inputMs + receipt.timing.renderMs + receipt.timing.checkMs + receipt.timing.preflightMs).toFixed(3)),
    );
  }
  assert.equal(session.calls.every((call) => !fs.existsSync(call.artifactPath)), true);
});

test('candidate preflight keeps deterministic failures structured and does not skip valid peers', async () => {
  const session = new FakeSession();
  const result = await runCandidatePreflightBatch({
    skillRoot,
    session,
    candidates: [
      {
        id: 'broken',
        type: 'workflow',
        input: path.join(skillRoot, 'examples', 'missing.json'),
      },
      {
        id: 'valid',
        type: 'workflow',
        input: path.join(skillRoot, 'examples', 'agent-tool-call.workflow.json'),
      },
    ],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.receipt.candidates[0].stage, 'input');
  assert.equal(result.receipt.candidates[0].repairPlan.qualityGuards.semanticDeletionAllowed, false);
  assert.equal(result.receipt.candidates[0].timing.renderMs, 0);
  assert.equal(result.receipt.candidates[1].ok, true);
  assert.equal(session.calls.length, 1);
});
