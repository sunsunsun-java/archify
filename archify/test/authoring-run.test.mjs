import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { AuthoringRun } from '../authoring/authoring-run.mjs';
import {
  QUALITY_CONTRACT_DIGEST,
  qualityContractIdentity,
} from '../authoring/quality-contract.mjs';
import { renderAuthoringReport } from '../orchestration/report.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(skillRoot, 'bin', 'archify.mjs');

function fakeClock() {
  let now = 0;
  return {
    monotonicMs: () => now,
    wallMs: () => Date.parse('2026-08-29T00:00:00.000Z'),
    advance(milliseconds) {
      now += milliseconds;
    },
  };
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('authoring run: mechanically writes digest-bound handoff, canonical timing, and receipt-derived report', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-authoring-run-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const candidatePath = path.join(tmp, 'candidate.json');
  const evidencePath = path.join(tmp, 'evidence-ledger.json');
  const validationPath = path.join(tmp, 'validation.json');
  const outputDirectory = path.join(tmp, 'run');
  writeJson(candidatePath, { type: 'workflow', meta: { title: 'Agent loop' }, nodes: [] });
  writeJson(evidencePath, {
    schemaVersion: 1,
    repository: { revision: 'a'.repeat(40), indexDigest: 'b'.repeat(64) },
    ledgerDigest: 'c'.repeat(64),
    facts: [{ id: 'fact-1' }, { id: 'fact-2' }],
  });
  writeJson(validationPath, {
    command: 'validate',
    ok: true,
    status: 'pass',
    checks: Array.from({ length: 9 }, (_, index) => ({ id: `check-${index + 1}`, ok: true })),
    composition: { summary: { errors: 0, warnings: 0 }, profile: 'showcase' },
  });

  const clock = fakeClock();
  const run = AuthoringRun.open({
    run: {
      id: 'pi/workflow',
      diagramType: 'workflow',
      repository: { revision: 'a'.repeat(40) },
    },
    outputDirectory,
    clock,
  });
  clock.advance(7);
  await run.stage('candidate-authoring', async () => {
    clock.advance(11);
  });
  clock.advance(5);
  await run.stage('deterministic-validation', async () => {
    clock.advance(13);
  });
  clock.advance(3);

  const completed = run.finalize({ candidatePath, evidencePath, validationPath });
  assert.equal(completed.timing.durationMs, 39);
  assert.equal(
    Date.parse(completed.timing.endedAt) - Date.parse(completed.timing.startedAt),
    completed.timing.durationMs,
  );
  assert.equal(completed.timing.accounting.stagedMs, 24);
  assert.equal(completed.timing.accounting.agentOverheadMs, 15);
  assert.deepEqual(
    completed.timing.stages.map((stage) => stage.durationMs),
    completed.timing.stages.map((stage) => stage.endOffsetMs - stage.startOffsetMs),
  );

  assert.equal(completed.handoff.kind, 'archify.authoring-handoff');
  assert.equal(completed.handoff.status, 'ready');
  assert.equal(completed.handoff.contract.quality.sha256, QUALITY_CONTRACT_DIGEST);
  assert.deepEqual(completed.handoff.contract, qualityContractIdentity({ skillRoot }));
  assert.equal(completed.handoff.candidate.sha256, sha256(candidatePath));
  assert.equal(completed.handoff.evidence.sha256, sha256(evidencePath));
  assert.equal(completed.handoff.evidence.ledgerDigest, 'c'.repeat(64));
  assert.equal(completed.handoff.evidence.factCount, 2);
  assert.equal(completed.handoff.validation.sha256, sha256(validationPath));
  assert.equal(completed.handoff.validation.checksPassed, 9);
  assert.equal(completed.handoff.validation.checksTotal, 9);
  const { digest, ...handoffBody } = completed.handoff;
  assert.equal(digest, createHash('sha256').update(JSON.stringify(handoffBody)).digest('hex'));
  assert.deepEqual(completed.timing.finalReceipt, completed.handoff);
  assert.deepEqual(JSON.parse(fs.readFileSync(completed.paths.handoffPath, 'utf8')), completed.handoff);
  assert.deepEqual(JSON.parse(fs.readFileSync(completed.paths.timingPath, 'utf8')), completed.timing);

  assert.match(completed.report.markdown, /Generated mechanically from canonical timing and handoff receipts/);
  assert.match(completed.report.markdown, /Agent overhead: 0\.015s/);
  assert.match(completed.report.markdown, new RegExp(sha256(candidatePath)));
  assert.equal(fs.readFileSync(completed.paths.reportPath, 'utf8'), completed.report.markdown);
  assert.deepEqual(
    renderAuthoringReport({ timing: completed.timing, outputRoot: outputDirectory }),
    completed.report,
  );
});

test('authoring run: refuses an incomplete quality receipt without producing a ready handoff', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-authoring-run-failed-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const candidatePath = path.join(tmp, 'candidate.json');
  const evidencePath = path.join(tmp, 'evidence.json');
  const validationPath = path.join(tmp, 'validation.json');
  writeJson(candidatePath, { type: 'sequence' });
  writeJson(evidencePath, { ledgerDigest: 'd'.repeat(64), facts: [] });
  writeJson(validationPath, {
    command: 'validate',
    ok: true,
    status: 'pass',
    checks: Array.from({ length: 8 }, (_, index) => ({ id: `check-${index + 1}`, ok: true })),
    composition: { summary: { errors: 0, warnings: 0 }, profile: 'showcase' },
  });
  const outputDirectory = path.join(tmp, 'run');
  const run = AuthoringRun.open({
    run: { id: 'pi/sequence', diagramType: 'sequence' },
    outputDirectory,
    clock: fakeClock(),
  });

  assert.throws(
    () => run.finalize({ candidatePath, evidencePath, validationPath }),
    /exactly 9 passing checks/,
  );
  assert.equal(fs.existsSync(path.join(outputDirectory, 'handoff.json')), false);
  assert.equal(fs.existsSync(path.join(outputDirectory, 'authoring-report.md')), false);
  assert.equal(fs.existsSync(path.join(outputDirectory, 'timing.json')), false);

  writeJson(validationPath, {
    command: 'validate',
    ok: true,
    status: 'pass',
    checks: Array.from({ length: 9 }, (_, index) => ({ id: `check-${index + 1}`, ok: true })),
    composition: { summary: { errors: 0, warnings: 0 }, profile: 'showcase' },
  });
  const recovered = run.finalize({ candidatePath, evidencePath, validationPath });
  assert.equal(recovered.handoff.status, 'ready');
});

test('authoring-run CLI measures a durable envelope and mechanically finalizes receipts', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-authoring-run-cli-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const outputDirectory = path.join(tmp, 'run');
  const candidatePath = path.join(tmp, 'candidate.json');
  const evidencePath = path.join(tmp, 'evidence-ledger.json');
  const validationPath = path.join(tmp, 'validation.json');
  writeJson(candidatePath, { type: 'workflow', meta: { title: 'Measured run' }, nodes: [] });
  writeJson(evidencePath, {
    schemaVersion: 1,
    repository: {
      origin: 'https://github.com/example/pi',
      revision: 'a'.repeat(40),
      objectFormat: 'sha1',
      indexDigest: 'b'.repeat(64),
    },
    ledgerDigest: 'c'.repeat(64),
    facts: [{ claimId: 'entry', path: 'src/index.ts', line: 1, endLine: 1 }],
  });
  writeJson(validationPath, {
    command: 'validate',
    ok: true,
    status: 'pass',
    checks: Array.from({ length: 9 }, (_, index) => ({ id: `check-${index + 1}`, ok: true })),
    composition: { summary: { errors: 0, warnings: 0 }, profile: 'showcase' },
  });

  const forgedTiming = spawnSync(process.execPath, [
    cli,
    'authoring-run',
    'start',
    'workflow',
    '--run-id', 'pi/forged',
    '--output', path.join(tmp, 'forged-run'),
    '--duration-ms', '999999',
    '--json',
  ], { cwd: skillRoot, encoding: 'utf8' });
  assert.equal(forgedTiming.status, 2);
  assert.match(forgedTiming.stderr, /Unknown authoring-run start option "--duration-ms"/);
  assert.equal(fs.existsSync(path.join(tmp, 'forged-run', 'authoring-run.json')), false);

  const started = spawnSync(process.execPath, [
    cli,
    'authoring-run',
    'start',
    'workflow',
    '--run-id', 'pi/workflow',
    '--output', outputDirectory,
    '--json',
  ], { cwd: skillRoot, encoding: 'utf8' });
  assert.equal(started.status, 0, started.stderr);
  const startReceipt = JSON.parse(started.stdout);
  assert.equal(startReceipt.command, 'authoring-run-start');
  assert.equal(startReceipt.status, 'started');
  assert.equal(startReceipt.envelope.kind, 'archify.authoring-run-envelope');
  assert.equal(startReceipt.envelope.run.id, 'pi/workflow');
  assert.equal(startReceipt.envelope.run.diagramType, 'workflow');
  assert.match(startReceipt.envelope.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(startReceipt.paths.envelopePath, 'utf8')),
    startReceipt.envelope,
  );
  assert.equal(fs.existsSync(path.join(outputDirectory, 'timing.json')), false);
  assert.equal(fs.existsSync(path.join(outputDirectory, 'authoring-report.md')), false);

  const finalized = spawnSync(process.execPath, [
    cli,
    'authoring-run',
    'finalize',
    startReceipt.paths.envelopePath,
    '--candidate', candidatePath,
    '--evidence', evidencePath,
    '--validation', validationPath,
    '--json',
  ], { cwd: skillRoot, encoding: 'utf8' });
  assert.equal(finalized.status, 0, finalized.stderr);
  const finalReceipt = JSON.parse(finalized.stdout);
  assert.equal(finalReceipt.command, 'authoring-run-finalize');
  assert.equal(finalReceipt.status, 'ready');
  assert.equal(finalReceipt.handoff.repository.revision, 'a'.repeat(40));
  assert.equal(finalReceipt.handoff.candidate.sha256, sha256(candidatePath));
  assert.equal(finalReceipt.timing.kind, 'archify.run-timing');
  assert.equal(finalReceipt.timing.run.measurementDomain, 'agent-authoring');
  assert.equal(finalReceipt.timing.run.repository.revision, 'a'.repeat(40));
  assert.equal(finalReceipt.timing.run.repository.indexDigest, 'b'.repeat(64));
  assert.equal(finalReceipt.timing.accounting.durationSource, 'monotonic-envelope-endpoints');
  assert.equal(finalReceipt.timing.durationMs,
    Date.parse(finalReceipt.timing.endedAt) - Date.parse(finalReceipt.timing.startedAt));
  assert.deepEqual(finalReceipt.timing.stages, []);
  assert.equal(finalReceipt.timing.accounting.agentOverheadMs, finalReceipt.timing.durationMs);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(finalReceipt.paths.timingPath, 'utf8')),
    finalReceipt.timing,
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(finalReceipt.paths.handoffPath, 'utf8')),
    finalReceipt.handoff,
  );
  assert.match(
    fs.readFileSync(finalReceipt.paths.reportPath, 'utf8'),
    /Generated mechanically from canonical timing and handoff receipts/,
  );
});
