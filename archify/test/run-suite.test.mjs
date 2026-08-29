import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runSuite, spawnCommandRunner } from '../orchestration/suite-runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, '..');
const archifyCli = path.join(skillRoot, 'bin/archify.mjs');
const suiteCli = path.join(skillRoot, 'bin/run-suite.mjs');
const revision = '0123456789abcdef0123456789abcdef01234567';

function jsonResult(receipt, exitCode = 0) {
  return { exitCode, signal: null, stdout: JSON.stringify(receipt), stderr: '' };
}

function validationReceipt(type, input, ok = true) {
  return {
    schemaVersion: 1,
    ok,
    command: 'validate',
    type,
    input,
    checks: Array.from({ length: 9 }, (_value, index) => ({ id: `check-${index + 1}`, ok })),
    composition: { profile: 'showcase', summary: { errors: ok ? 0 : 1, warnings: 0 } },
    ...(ok ? {
      preflight: {
        ok: true,
        status: 'pass',
        containment: {
          status: 'pass',
          viewports: [
            { width: 1440, height: 900, theme: 'light', ok: true },
            { width: 1600, height: 1000, theme: 'light', ok: true },
            { width: 1920, height: 1080, theme: 'light', ok: true },
            { width: 2048, height: 1320, theme: 'light', ok: true },
          ],
        },
      },
    } : {}),
  };
}

function fakeRunner({
  failDiagram = null,
  visualReceiptClaimsHumanPass = false,
  revisionValue = revision,
  capabilityStatus = 'pass',
} = {}) {
  let activeTypedCommands = 0;
  let maximumConcurrency = 0;
  const requests = [];
  const runner = async (request) => {
    requests.push(request);
    if (request.kind === 'repository-revision') {
      return { exitCode: 0, signal: null, stdout: `${revisionValue}\n`, stderr: '' };
    }
    if (request.kind === 'chrome-capability') {
      const ok = capabilityStatus === 'pass';
      const exitCode = ok ? 0 : capabilityStatus === 'unavailable' ? 2 : 1;
      return jsonResult({
        schemaVersion: 1,
        ok,
        command: 'visual-capability-probe',
        status: capabilityStatus,
        chrome: {
          status: ok ? 'available' : capabilityStatus,
          executable: ok ? '/fake/chrome' : null,
          sandbox: { status: 'enabled', automaticOptOut: false },
        },
        cdp: { status: ok ? 'available' : 'skipped' },
        ...(ok ? {} : { error: `Chrome capability ${capabilityStatus}` }),
      }, exitCode);
    }
    activeTypedCommands += 1;
    maximumConcurrency = Math.max(maximumConcurrency, activeTypedCommands);
    await new Promise((resolve) => setTimeout(resolve, 3));
    try {
      if (request.kind === 'exec') {
        const candidatePath = request.args[0];
        fs.writeFileSync(candidatePath, JSON.stringify({
          schema_version: 1,
          diagram_type: request.env.ARCHIFY_SUITE_DIAGRAM_TYPE,
          meta: { title: 'Prepared candidate' },
        }));
        return jsonResult({ schemaVersion: 1, ok: true, command: 'prepare' });
      }
      if (request.kind === 'validate') {
        const type = request.args[2];
        const input = request.args[3];
        const shouldFail = request.env.ARCHIFY_SUITE_DIAGRAM_ID === failDiagram;
        return jsonResult(validationReceipt(type, input, !shouldFail), shouldFail ? 1 : 0);
      }
      if (request.kind === 'deliver') {
        const type = request.args[2];
        const input = request.args[3];
        const output = request.args[4];
        const artifact = `<!doctype html><title>${type}</title>\n`;
        fs.writeFileSync(output, artifact);
        return jsonResult({
          schemaVersion: 1,
          ok: true,
          command: 'deliver',
          type,
          input,
          output,
          artifact: {
            bytes: Buffer.byteLength(artifact),
            sha256: createHash('sha256').update(artifact).digest('hex'),
          },
          validation: {
            checksPassed: 9,
            checkCount: 9,
            compositionProfile: 'showcase',
            errors: 0,
            warnings: 0,
          },
        });
      }
      if (request.kind === 'visual-check-batch') {
        const artifactPaths = request.args.slice(2, -1);
        const artifacts = artifactPaths.map((artifactPath) => {
          const artifact = fs.readFileSync(artifactPath);
          const screenshotDimensions = [[1440, 900], [2048, 1320]];
          const screenshots = screenshotDimensions.flatMap(([width, height]) => ['light', 'dark'].map((theme) => {
            const file = `${path.basename(artifactPath, '.html')}.${width}x${height}.${theme}.png`;
            fs.writeFileSync(path.join(path.dirname(artifactPath), file), `fake ${theme} screenshot`);
            return { width, height, theme, ok: true, file };
          }));
          return {
            schemaVersion: 1,
            ok: true,
            command: 'visual-check',
            status: 'pass',
            visualReview: visualReceiptClaimsHumanPass ? 'passed' : 'pending',
            artifact: {
              path: artifactPath,
              bytes: artifact.byteLength,
              sha256: createHash('sha256').update(artifact).digest('hex'),
            },
            containment: {
              status: 'pass',
              viewports: [
                { width: 1440, height: 900, ok: true },
                { width: 1600, height: 1000, ok: true },
                { width: 1920, height: 1080, ok: true },
                { width: 2048, height: 1320, ok: true },
              ],
            },
            captures: { status: 'pass', screenshots },
          };
        });
        return jsonResult({
          schemaVersion: 1,
          ok: true,
          command: 'visual-check-batch',
          status: 'pass',
          artifacts,
        });
      }
      throw new Error(`Unexpected command kind ${request.kind}`);
    } finally {
      activeTypedCommands -= 1;
    }
  };
  runner.requests = requests;
  runner.maximumConcurrency = () => maximumConcurrency;
  return runner;
}

function writeManifest(tmp, diagrams, options = {}) {
  const manifestPath = path.join(tmp, 'suite.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    id: 'pi-five-diagrams',
    qualityProfile: 'showcase',
    ...options,
    diagrams,
  }, null, 2));
  return manifestPath;
}

function sharedCandidatePreflightRunner(calls = []) {
  return async ({ candidates, quality }) => {
    calls.push({ candidates, quality });
    return {
      exitCode: 0,
      receipt: {
        schemaVersion: 1,
        ok: true,
        command: 'validate-batch',
        status: 'pass',
        quality,
        session: { shared: true, candidates: candidates.length, expectedBrowserResets: candidates.length - 1 },
        candidates: candidates.map((candidate) => {
          const bytes = fs.readFileSync(candidate.input);
          return {
            ...validationReceipt(candidate.type, candidate.input),
            id: candidate.id,
            specification: {
              bytes: bytes.byteLength,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            },
          };
        }),
      },
    };
  };
}

function staticCandidate(tmp, type) {
  const candidate = path.join(tmp, `${type}.json`);
  fs.writeFileSync(candidate, JSON.stringify({
    schema_version: 1,
    diagram_type: type,
    meta: { title: `${type} candidate` },
  }));
  return path.basename(candidate);
}

function qualityCommands() {
  return [
    { id: 'validate', kind: 'validate' },
    { id: 'deliver', kind: 'deliver' },
    { id: 'visual', kind: 'visual-check' },
  ];
}

test('suite runner CLI: documents explicit repository, revision, output, and no-model contract', () => {
  const result = spawnSync(process.execPath, [suiteCli, '--help'], {
    cwd: skillRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--repo-root <checkout>/);
  assert.match(result.stdout, /--revision <full-commit-id>/);
  assert.match(result.stdout, /--output <directory>/);
  assert.match(result.stdout, /does not call a model/);
  assert.match(result.stdout, /sharedViewportPreflight/);
  assert.match(result.stdout, /manifest\.projectIndex/);
});

test('production command runner reports child-process time without agent marker gaps', async () => {
  const result = await spawnCommandRunner({
    executable: process.execPath,
    args: ['-e', 'process.stdout.write("ok")'],
    cwd: skillRoot,
    env: {},
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'ok');
  assert.equal(result.timing.source, 'child-process');
  assert.ok(result.timing.durationMs >= 0);
  assert.match(result.timing.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(result.timing.endedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('suite runner: pins the repository once, isolates diagrams, and generates timing/report receipts', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  const outputRoot = path.join(tmp, 'output');
  fs.mkdirSync(repoRoot);
  const workflowCandidate = staticCandidate(tmp, 'workflow');
  const manifestPath = writeManifest(tmp, [
    {
      id: 'workflow',
      type: 'workflow',
      candidate: workflowCandidate,
      artifact: 'workflow.html',
      commands: qualityCommands(),
    },
    {
      id: 'sequence',
      type: 'sequence',
      candidate: '{diagramOutput}/candidate.json',
      artifact: 'sequence.html',
      commands: [
        { id: 'prepare', kind: 'exec', argv: ['prepare-candidate', '{candidate}'], receipt: 'json', cwd: 'diagram' },
        ...qualityCommands(),
      ],
    },
  ]);
  const commandRunner = fakeRunner({ visualReceiptClaimsHumanPass: true });

  const summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot,
    archifyCli,
    concurrency: 2,
    commandRunner,
  });

  assert.equal(summary.status, 'automated-pass-awaiting-human-review');
  assert.deepEqual(summary.diagrams.map((diagram) => diagram.status), ['completed', 'completed']);
  assert.equal(commandRunner.requests.filter((request) => request.kind === 'repository-revision').length, 1);
  assert.equal(commandRunner.requests.filter((request) => request.kind === 'chrome-capability').length, 1);
  assert.equal(Object.hasOwn(commandRunner.requests.find((request) => request.kind === 'chrome-capability').env, 'ARCHIFY_CHROME_NO_SANDBOX'), false);
  assert.equal(commandRunner.requests.filter((request) => request.kind === 'validate').every((request) => request.args.includes('--preflight')), true);
  const visualBatchRequests = commandRunner.requests.filter((request) => request.kind === 'visual-check-batch');
  assert.equal(visualBatchRequests.length, 1);
  assert.equal(commandRunner.requests.filter((request) => request.kind === 'visual-check').length, 0);
  assert.ok(commandRunner.maximumConcurrency() >= 2, 'diagram command execution should overlap at concurrency 2');
  for (const diagram of summary.diagrams) {
    assert.ok(visualBatchRequests[0].args.includes(diagram.artifact));
    assert.equal(path.dirname(diagram.timing), path.join(outputRoot, diagram.id));
    assert.equal(path.dirname(diagram.events), path.join(outputRoot, diagram.id));
    assert.equal(path.dirname(diagram.artifact), path.join(outputRoot, diagram.id));
    const timing = JSON.parse(fs.readFileSync(diagram.timing, 'utf8'));
    assert.equal(timing.kind, 'archify.run-timing');
    assert.equal(timing.run.repository.revision, revision);
    assert.equal(timing.stages.at(-1).name, 'visual');
    assert.equal(timing.stages.at(-1).metadata.sharedBatch, true);
    assert.equal(timing.stages.at(-1).metadata.sharedBatchDurationMs, summary.visualCheckBatch.durationMs);
    for (let index = 1; index < timing.stages.length; index += 1) {
      assert.ok(timing.stages[index - 1].endOffsetMs <= timing.stages[index].startOffsetMs);
    }
    assert.equal(timing.finalReceipt.commands.at(-1).kind, 'visual-check');
    const review = JSON.parse(fs.readFileSync(diagram.visualReview, 'utf8'));
    assert.equal(review.status, 'pending', 'browser receipt must not promote human visual review');
  }

  const report = fs.readFileSync(summary.report, 'utf8');
  assert.match(report, /automated-pass-awaiting-human-review/);
  assert.match(report, /Chrome capability gate: `pass`/);
  assert.match(report, /pass \(4\/4 viewports\)/);
  assert.match(report, /pending \(human required\)/);
  assert.match(report, /runner never promotes it to `passed`/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(outputRoot, 'suite-result.json'), 'utf8')).status, summary.status);
  const suiteTiming = JSON.parse(fs.readFileSync(summary.timing, 'utf8'));
  assert.equal(suiteTiming.stages[0].name, 'chromeCapability');
  assert.equal(suiteTiming.stages.filter((stage) => stage.name === 'visualCheckBatch').length, 1);
  assert.equal(suiteTiming.stages.find((stage) => stage.name === 'visualCheckBatch').status, 'passed');
  assert.equal(suiteTiming.finalReceipt.chromeCapability.receipt.status, 'pass');
  assert.equal(suiteTiming.finalReceipt.visualCheckBatch.artifacts.length, 2);
});

test('suite runner: frozen candidates share one pre-delivery browser session', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-shared-preflight-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  const outputRoot = path.join(tmp, 'output');
  fs.mkdirSync(repoRoot);
  const manifestPath = writeManifest(tmp, [
    { id: 'workflow', type: 'workflow', candidate: staticCandidate(tmp, 'workflow'), commands: qualityCommands() },
    { id: 'sequence', type: 'sequence', candidate: staticCandidate(tmp, 'sequence'), commands: qualityCommands() },
  ], { sharedViewportPreflight: true });
  const commandRunner = fakeRunner();
  const preflightCalls = [];

  const summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot,
    archifyCli,
    concurrency: 2,
    commandRunner,
    candidatePreflightRunner: sharedCandidatePreflightRunner(preflightCalls),
  });

  assert.equal(summary.status, 'automated-pass-awaiting-human-review');
  assert.equal(summary.sharedViewportPreflight, true);
  assert.equal(preflightCalls.length, 1);
  assert.equal(preflightCalls[0].candidates.length, 2);
  assert.equal(commandRunner.requests.filter((request) => request.kind === 'validate').every((request) => !request.args.includes('--preflight')), true);
  const timing = JSON.parse(fs.readFileSync(summary.timing, 'utf8'));
  assert.equal(timing.stages.filter((stage) => stage.name === 'candidatePreflightBatch').length, 1);
  assert.equal(timing.finalReceipt.candidatePreflightBatch.session.shared, true);
  const report = fs.readFileSync(summary.report, 'utf8');
  assert.match(report, /Shared candidate preflight: `enabled`/);
  assert.match(report, /Shared pre-delivery candidate check: `pass` \(2 candidates, one browser process\)/);
  for (const diagram of summary.diagrams) {
    const diagramTiming = JSON.parse(fs.readFileSync(diagram.timing, 'utf8'));
    const validate = diagramTiming.finalReceipt.commands.find((command) => command.kind === 'validate');
    assert.equal(validate.receipt.preflight.status, 'pass');
    assert.equal(diagramTiming.finalReceipt.quality.sharedViewportPreflight, true);
  }
});

test('suite runner: one unavailable Chrome capability probe stops every diagram command fail-closed', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-capability-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(repoRoot);
  const manifestPath = writeManifest(tmp, [
    { type: 'workflow', candidate: staticCandidate(tmp, 'workflow'), commands: qualityCommands() },
    { type: 'sequence', candidate: staticCandidate(tmp, 'sequence'), commands: qualityCommands() },
  ]);
  const commandRunner = fakeRunner({ capabilityStatus: 'unavailable' });
  const outputRoot = path.join(tmp, 'output');

  const summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot,
    archifyCli,
    concurrency: 2,
    commandRunner,
  });

  assert.equal(summary.status, 'automated-failure');
  assert.equal(commandRunner.requests.filter((request) => request.kind === 'chrome-capability').length, 1);
  assert.equal(commandRunner.requests.filter((request) => ['exec', 'validate', 'deliver', 'visual-check', 'visual-check-batch'].includes(request.kind)).length, 0);
  assert.deepEqual(summary.diagrams, []);
  assert.equal(summary.chromeCapability.receipt.status, 'unavailable');
  assert.ok(Number.isFinite(summary.chromeCapability.durationMs));
  const timing = JSON.parse(fs.readFileSync(summary.timing, 'utf8'));
  assert.equal(timing.status, 'failed');
  assert.equal(timing.stages[0].name, 'chromeCapability');
  assert.equal(timing.stages[0].status, 'failed');
  assert.equal(timing.finalReceipt.chromeCapability.receipt.status, 'unavailable');
  assert.match(fs.readFileSync(summary.report, 'utf8'), /Chrome capability gate: `unavailable`/);
});

test('suite runner: visual batch wrapper must agree with every child receipt', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-batch-wrapper-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(repoRoot);
  const manifestPath = writeManifest(tmp, [{
    type: 'workflow',
    candidate: staticCandidate(tmp, 'workflow'),
    commands: qualityCommands(),
  }]);
  const base = fakeRunner();
  const commandRunner = async (request) => {
    const result = await base(request);
    if (request.kind !== 'visual-check-batch') return result;
    const receipt = JSON.parse(result.stdout);
    receipt.status = 'fail';
    return jsonResult(receipt);
  };

  const summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'output'),
    archifyCli,
    commandRunner,
  });

  assert.equal(summary.status, 'automated-failure');
  assert.equal(base.requests.filter((request) => request.kind === 'visual-check-batch').length, 1);
  assert.equal(summary.diagrams[0].status, 'failed');
  const timing = JSON.parse(fs.readFileSync(summary.timing, 'utf8'));
  assert.equal(timing.stages.find((stage) => stage.name === 'visualCheckBatch').status, 'failed');
  assert.match(timing.finalReceipt.error.message, /wrapper contradicts its child receipts/);
});

test('suite runner: a failed typed command is retained in final receipts and still produces a pending human review', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-failure-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  const outputRoot = path.join(tmp, 'output');
  fs.mkdirSync(repoRoot);
  const manifestPath = writeManifest(tmp, [{
    id: 'lifecycle',
    type: 'lifecycle',
    candidate: staticCandidate(tmp, 'lifecycle'),
    commands: qualityCommands(),
  }]);

  const summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot,
    archifyCli,
    commandRunner: fakeRunner({ failDiagram: 'lifecycle' }),
  });

  assert.equal(summary.status, 'automated-failure');
  assert.equal(summary.diagrams[0].status, 'failed');
  assert.equal(summary.diagrams[0].artifact, null);
  const timing = JSON.parse(fs.readFileSync(summary.diagrams[0].timing, 'utf8'));
  assert.equal(timing.stages.length, 1);
  assert.equal(timing.stages[0].status, 'failed');
  assert.equal(timing.finalReceipt.commands[0].receipt.ok, false);
  assert.equal(timing.finalReceipt.error.code, 'ARCHIFY_SUITE_COMMAND_FAILED');
  assert.equal(JSON.parse(fs.readFileSync(summary.diagrams[0].visualReview, 'utf8')).status, 'pending');
  assert.match(fs.readFileSync(summary.report, 'utf8'), /automated-failure/);
});

test('suite runner: rejects symbolic or mismatched revisions before creating diagram output', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-revision-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(repoRoot);
  const manifestPath = writeManifest(tmp, [{
    type: 'dataflow',
    candidate: staticCandidate(tmp, 'dataflow'),
    commands: qualityCommands(),
  }]);

  await assert.rejects(runSuite({
    manifestPath,
    repoRoot,
    revision: 'HEAD',
    outputRoot: path.join(tmp, 'symbolic-output'),
    archifyCli,
    commandRunner: fakeRunner(),
  }), /full 40-64 character hexadecimal commit id/);

  const mismatchRunner = fakeRunner();
  await assert.rejects(runSuite({
    manifestPath,
    repoRoot,
    revision: 'ffffffffffffffffffffffffffffffffffffffff',
    outputRoot: path.join(tmp, 'mismatch-output'),
    archifyCli,
    commandRunner: mismatchRunner,
  }), /does not match repository HEAD/);
  assert.equal(fs.existsSync(path.join(tmp, 'symbolic-output')), false);
  assert.equal(fs.existsSync(path.join(tmp, 'mismatch-output')), false);
});

test('suite runner: manifest enforces validate-deliver-visual quality ordering', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-order-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(repoRoot);
  const manifestPath = writeManifest(tmp, [{
    type: 'architecture',
    candidate: staticCandidate(tmp, 'architecture'),
    commands: [
      { id: 'deliver', kind: 'deliver' },
      { id: 'visual', kind: 'visual-check' },
    ],
  }]);

  await assert.rejects(runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'output'),
    archifyCli,
    commandRunner: fakeRunner(),
  }), /requires a preceding validate/);
});

test('suite runner: shared candidate preflight rejects mutable exec candidates', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-shared-mutable-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(repoRoot);
  const manifestPath = writeManifest(tmp, [{
    type: 'workflow',
    candidate: staticCandidate(tmp, 'workflow'),
    commands: [
      { id: 'prepare', kind: 'exec', argv: ['prepare-candidate'] },
      ...qualityCommands(),
    ],
  }], { sharedViewportPreflight: true });

  await assert.rejects(runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'output'),
    archifyCli,
    commandRunner: fakeRunner(),
  }), /requires frozen candidates and does not permit exec commands/);
});

test('suite runner: rejects control-file and candidate/artifact aliases before execution', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-alias-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(repoRoot);
  let manifestPath = writeManifest(tmp, [{
    type: 'workflow',
    candidate: staticCandidate(tmp, 'workflow'),
    artifact: 'timing.json',
    commands: qualityCommands(),
  }]);
  await assert.rejects(runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'control-output'),
    archifyCli,
    commandRunner: fakeRunner(),
  }), /artifact conflicts with reserved orchestration file/);

  manifestPath = writeManifest(tmp, [{
    type: 'sequence',
    candidate: '{diagramOutput}/same.json',
    artifact: 'same.json',
    commands: qualityCommands(),
  }]);
  await assert.rejects(runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'same-output'),
    archifyCli,
    commandRunner: fakeRunner(),
  }), /candidate and artifact must be different files/);
});

test('suite runner: malformed or lower-profile quality receipts fail closed', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-receipt-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(repoRoot);
  const manifestPath = writeManifest(tmp, [{
    type: 'workflow',
    candidate: staticCandidate(tmp, 'workflow'),
    commands: qualityCommands(),
  }]);

  const malformedBase = fakeRunner();
  const malformedRunner = async (request) => request.kind === 'validate'
    ? jsonResult({ schemaVersion: 1, command: 'validate' })
    : malformedBase(request);
  let summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'malformed-output'),
    archifyCli,
    commandRunner: malformedRunner,
  });
  assert.equal(summary.status, 'automated-failure');
  let timing = JSON.parse(fs.readFileSync(summary.diagrams[0].timing, 'utf8'));
  assert.match(timing.finalReceipt.error.message, /boolean ok/);

  const lowerProfileBase = fakeRunner();
  const lowerProfileRunner = async (request) => {
    const result = await lowerProfileBase(request);
    if (request.kind !== 'validate') return result;
    const receipt = JSON.parse(result.stdout);
    receipt.composition.profile = 'standard';
    return jsonResult(receipt);
  };
  summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'lower-profile-output'),
    archifyCli,
    commandRunner: lowerProfileRunner,
  });
  assert.equal(summary.status, 'automated-failure');
  timing = JSON.parse(fs.readFileSync(summary.diagrams[0].timing, 'utf8'));
  assert.match(timing.finalReceipt.error.message, /does not match suite profile showcase/);

  const noPreflightBase = fakeRunner();
  const noPreflightRunner = async (request) => {
    const result = await noPreflightBase(request);
    if (request.kind !== 'validate') return result;
    const receipt = JSON.parse(result.stdout);
    delete receipt.preflight;
    return jsonResult(receipt);
  };
  summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'missing-preflight-output'),
    archifyCli,
    commandRunner: noPreflightRunner,
  });
  assert.equal(summary.status, 'automated-failure');
  timing = JSON.parse(fs.readFileSync(summary.diagrams[0].timing, 'utf8'));
  assert.match(timing.finalReceipt.error.message, /passing 4\/4 viewport preflight/);

  const duplicateViewportBase = fakeRunner();
  const duplicateViewportRunner = async (request) => {
    const result = await duplicateViewportBase(request);
    if (request.kind !== 'validate') return result;
    const receipt = JSON.parse(result.stdout);
    receipt.preflight.containment.viewports = Array.from({ length: 4 }, () => ({
      width: 1440,
      height: 900,
      theme: 'light',
      ok: true,
    }));
    return jsonResult(receipt);
  };
  summary = await runSuite({
    manifestPath,
    repoRoot,
    revision,
    outputRoot: path.join(tmp, 'duplicate-preflight-output'),
    archifyCli,
    commandRunner: duplicateViewportRunner,
  });
  assert.equal(summary.status, 'automated-failure');
  timing = JSON.parse(fs.readFileSync(summary.diagrams[0].timing, 'utf8'));
  assert.match(timing.finalReceipt.error.message, /passing 4\/4 viewport preflight/);
});

test('suite runner: optionally builds one revision-pinned project index shared by every diagram receipt', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-suite-index-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(repoRoot);
  fs.writeFileSync(path.join(repoRoot, 'index.js'), 'export const answer = 42;\n');
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  git('init');
  git('config', 'user.name', 'Archify Tests');
  git('config', 'user.email', 'archify@example.test');
  git('remote', 'add', 'origin', 'https://github.com/example/pi.git');
  git('add', '.');
  git('commit', '-m', 'fixture');
  const pinned = git('rev-parse', 'HEAD');
  const candidate = staticCandidate(tmp, 'workflow');
  const manifestPath = path.join(tmp, 'indexed-suite.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    id: 'indexed-suite',
    projectIndex: true,
    diagrams: [{ type: 'workflow', candidate, commands: qualityCommands() }],
  }));
  const outputRoot = path.join(tmp, 'output');

  const summary = await runSuite({
    manifestPath,
    repoRoot,
    revision: pinned,
    outputRoot,
    archifyCli,
    commandRunner: fakeRunner({ revisionValue: pinned }),
  });

  assert.equal(summary.projectIndex.repository.revision, pinned);
  assert.equal(summary.projectIndex.files, 1);
  assert.equal(summary.projectIndex.filesAnalyzed, 1);
  assert.match(summary.projectIndex.digest, /^[a-f0-9]{64}$/);
  assert.equal(summary.finalReceipt.projectIndex.digest, summary.projectIndex.digest);
  assert.equal(JSON.parse(fs.readFileSync(summary.projectIndex.path, 'utf8')).digest, summary.projectIndex.digest);
  const timing = JSON.parse(fs.readFileSync(summary.diagrams[0].timing, 'utf8'));
  assert.equal(timing.finalReceipt.projectIndex.digest, summary.projectIndex.digest);
  assert.match(fs.readFileSync(summary.report, 'utf8'), /Shared project index/);
});
