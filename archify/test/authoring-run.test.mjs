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
  buildProjectIndex,
  createEvidenceLedger,
} from '../evidence/project-index.mjs';
import {
  QUALITY_CONTRACT,
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

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function evidenceFixture(root) {
  const repoRoot = path.join(root, 'repository');
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'archify@example.test']);
  git(repoRoot, ['config', 'user.name', 'Archify Test']);
  git(repoRoot, ['remote', 'add', 'origin', 'https://github.com/example/authoring-fixture.git']);
  fs.writeFileSync(path.join(repoRoot, 'src', 'index.ts'), 'export const ready = true;\n', 'utf8');
  git(repoRoot, ['add', 'src/index.ts']);
  git(repoRoot, ['commit', '-qm', 'fixture']);
  const revision = git(repoRoot, ['rev-parse', 'HEAD']);
  const projectIndex = buildProjectIndex({ repoRoot, revision });
  const ledger = createEvidenceLedger(projectIndex, [{
    claimId: 'entry',
    path: 'src/index.ts',
    line: 1,
    endLine: 1,
    summary: 'Entry point',
  }]);
  const projectIndexPath = path.join(root, 'project-index.json');
  const evidencePath = path.join(root, 'evidence-ledger.json');
  writeJson(projectIndexPath, projectIndex);
  writeJson(evidencePath, ledger);
  return { repoRoot, revision, projectIndexPath, evidencePath, ledger };
}

function passingValidation(candidatePath, type = 'workflow', requiredLanguage) {
  const candidate = fs.readFileSync(candidatePath);
  const artifact = Buffer.from('<!doctype html><title>candidate</title>\n');
  const artifactReceipt = {
    path: path.join(path.dirname(candidatePath), 'ephemeral.html'),
    bytes: artifact.byteLength,
    sha256: createHash('sha256').update(artifact).digest('hex'),
  };
  const viewports = QUALITY_CONTRACT.guards.desktopViewports.map(({ width, height }) => ({
    width,
    height,
    theme: 'light',
    requestedTheme: 'light',
    resolvedTheme: 'light',
    detailLevel: 'read',
    motion: 'still',
    themeStateOk: true,
    detailStateOk: true,
    motionStateOk: true,
    stateOk: true,
    ok: true,
  }));
  return {
    schemaVersion: 1,
    command: 'validate',
    type,
    ok: true,
    status: 'pass',
    specification: {
      type,
      bytes: candidate.byteLength,
      sha256: createHash('sha256').update(candidate).digest('hex'),
    },
    artifact: { ...artifactReceipt, ephemeral: true },
    checks: QUALITY_CONTRACT.guards.deterministicCheckNames.map((name) => ({ name, ok: true })),
    composition: { summary: { errors: 0, warnings: 0 }, profile: 'showcase' },
    ...(requiredLanguage ? { authoredLanguage: {
      required: requiredLanguage,
      locale: requiredLanguage,
      inspected: 1,
      proseInspected: 1,
      technicalIdentifiersPreserved: 0,
      violations: 0,
    } } : {}),
    preflight: {
      schemaVersion: 2,
      command: 'visual-preflight',
      ok: true,
      status: 'pass',
      automatedChecks: ['containment'],
      artifact: {
        ...artifactReceipt,
        verification: {
          unchanged: true,
          before: { bytes: artifactReceipt.bytes, sha256: artifactReceipt.sha256 },
          after: { bytes: artifactReceipt.bytes, sha256: artifactReceipt.sha256 },
        },
      },
      state: {
        status: 'pass',
        detail: 'read',
        motion: 'still',
        theme: 'light',
        observations: viewports.map((entry) => ({
          width: entry.width,
          height: entry.height,
          requestedTheme: 'light',
          resolvedTheme: 'light',
          detailLevel: 'read',
          motion: 'still',
          ok: true,
        })),
      },
      containment: { status: 'pass', viewports },
    },
  };
}

test('authoring run: mechanically writes digest-bound handoff, canonical timing, and receipt-derived report', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-authoring-run-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const candidatePath = path.join(tmp, 'candidate.json');
  const evidence = evidenceFixture(tmp);
  const evidencePath = evidence.evidencePath;
  const validationPath = path.join(tmp, 'validation.json');
  const outputDirectory = path.join(tmp, 'run');
  writeJson(candidatePath, { schema_version: 1, diagram_type: 'workflow', meta: { title: 'Agent loop' }, nodes: [] });
  writeJson(validationPath, passingValidation(candidatePath));

  const clock = fakeClock();
  const run = AuthoringRun.open({
    run: {
      id: 'pi/workflow',
      diagramType: 'workflow',
      repository: { revision: evidence.revision },
    },
    outputDirectory,
    repoRoot: evidence.repoRoot,
    projectIndexPath: evidence.projectIndexPath,
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
  assert.equal(completed.handoff.evidence.ledgerDigest, evidence.ledger.ledgerDigest);
  assert.equal(completed.handoff.evidence.factCount, 1);
  assert.equal(completed.handoff.evidence.verification.verified, true);
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
  const evidence = evidenceFixture(tmp);
  const evidencePath = evidence.evidencePath;
  const validationPath = path.join(tmp, 'validation.json');
  writeJson(candidatePath, { schema_version: 1, diagram_type: 'sequence' });
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
    repoRoot: evidence.repoRoot,
    projectIndexPath: evidence.projectIndexPath,
    clock: fakeClock(),
  });

  assert.throws(
    () => run.finalize({ candidatePath, evidencePath, validationPath }),
    /exactly 9 passing checks/,
  );
  assert.equal(fs.existsSync(path.join(outputDirectory, 'handoff.json')), false);
  assert.equal(fs.existsSync(path.join(outputDirectory, 'authoring-report.md')), false);
  assert.equal(fs.existsSync(path.join(outputDirectory, 'timing.json')), false);

  writeJson(validationPath, passingValidation(candidatePath, 'sequence'));
  const recovered = run.finalize({ candidatePath, evidencePath, validationPath });
  assert.equal(recovered.handoff.status, 'ready');
});

test('authoring run: refuses a passing receipt after the candidate bytes or diagram type change', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-authoring-run-binding-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const candidatePath = path.join(tmp, 'candidate.json');
  const evidence = evidenceFixture(tmp);
  const evidencePath = evidence.evidencePath;
  const validationPath = path.join(tmp, 'validation.json');
  writeJson(candidatePath, { schema_version: 1, diagram_type: 'workflow', meta: { title: 'A' } });
  writeJson(validationPath, passingValidation(candidatePath));
  writeJson(candidatePath, { schema_version: 1, diagram_type: 'workflow', meta: { title: 'B' } });
  const run = AuthoringRun.open({
    run: { id: 'pi/workflow', diagramType: 'workflow' },
    outputDirectory: path.join(tmp, 'run'),
    repoRoot: evidence.repoRoot,
    projectIndexPath: evidence.projectIndexPath,
    clock: fakeClock(),
  });

  assert.throws(
    () => run.finalize({ candidatePath, evidencePath, validationPath }),
    /validation specification does not match the current candidate bytes/,
  );

  writeJson(validationPath, passingValidation(candidatePath, 'sequence'));
  assert.throws(
    () => run.finalize({ candidatePath, evidencePath, validationPath }),
    /validation diagram type does not match the authoring run/,
  );
});

test('authoring run: refuses modified evidence or a changed bound ProjectIndex', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-authoring-run-evidence-binding-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const evidence = evidenceFixture(tmp);
  const candidatePath = path.join(tmp, 'candidate.json');
  const validationPath = path.join(tmp, 'validation.json');
  writeJson(candidatePath, { schema_version: 1, diagram_type: 'workflow' });
  writeJson(validationPath, passingValidation(candidatePath));

  const ledger = JSON.parse(fs.readFileSync(evidence.evidencePath, 'utf8'));
  ledger.facts[0].summary = 'modified after creation';
  writeJson(evidence.evidencePath, ledger);
  const run = AuthoringRun.open({
    run: { id: 'pi/workflow', diagramType: 'workflow' },
    outputDirectory: path.join(tmp, 'run'),
    repoRoot: evidence.repoRoot,
    projectIndexPath: evidence.projectIndexPath,
    clock: fakeClock(),
  });
  assert.throws(
    () => run.finalize({
      candidatePath,
      evidencePath: evidence.evidencePath,
      validationPath,
    }),
    /ledger digest does not match/,
  );

  writeJson(evidence.evidencePath, evidence.ledger);
  const projectIndex = JSON.parse(fs.readFileSync(evidence.projectIndexPath, 'utf8'));
  projectIndex.generatedAt = 'changed';
  writeJson(evidence.projectIndexPath, projectIndex);
  assert.throws(
    () => run.finalize({
      candidatePath,
      evidencePath: evidence.evidencePath,
      validationPath,
    }),
    /project index no longer matches/,
  );
});

test('authoring-run CLI measures a durable envelope and mechanically finalizes receipts', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-authoring-run-cli-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const outputDirectory = path.join(tmp, 'run');
  const candidatePath = path.join(tmp, 'candidate.json');
  const evidence = evidenceFixture(tmp);
  const evidencePath = evidence.evidencePath;
  const validationPath = path.join(tmp, 'validation.json');
  writeJson(candidatePath, { schema_version: 1, diagram_type: 'workflow', meta: { title: 'Measured run' }, nodes: [] });
  writeJson(validationPath, passingValidation(candidatePath, 'workflow', 'zh-CN'));

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
    '--repo-root', evidence.repoRoot,
    '--project-index', evidence.projectIndexPath,
    '--require-authored-language', 'zh-CN',
    '--json',
  ], { cwd: skillRoot, encoding: 'utf8' });
  assert.equal(started.status, 0, started.stderr);
  const startReceipt = JSON.parse(started.stdout);
  assert.equal(startReceipt.command, 'authoring-run-start');
  assert.equal(startReceipt.status, 'started');
  assert.equal(startReceipt.envelope.kind, 'archify.authoring-run-envelope');
  assert.equal(startReceipt.envelope.run.id, 'pi/workflow');
  assert.equal(startReceipt.envelope.run.diagramType, 'workflow');
  assert.equal(startReceipt.envelope.run.requiredLanguage, 'zh-CN');
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
  assert.equal(finalReceipt.handoff.repository.revision, evidence.revision);
  assert.equal(finalReceipt.handoff.candidate.sha256, sha256(candidatePath));
  assert.equal(finalReceipt.handoff.validation.authoredLanguage.required, 'zh-CN');
  assert.equal(finalReceipt.timing.kind, 'archify.run-timing');
  assert.equal(finalReceipt.timing.run.measurementDomain, 'agent-authoring');
  assert.equal(finalReceipt.timing.run.repository.revision, evidence.revision);
  assert.equal(finalReceipt.timing.run.repository.indexDigest, evidence.ledger.repository.indexDigest);
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
