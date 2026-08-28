import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildProjectIndex } from '../evidence/project-index.mjs';
import { RunRecorder, recoverRunTiming } from './run-recorder.mjs';
import { renderSuiteReport } from './report.mjs';

const DIAGRAM_TYPES = new Set(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle']);
const COMMAND_KINDS = new Set(['exec', 'validate', 'deliver', 'visual-check']);
const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/;
const PINNED_REVISION = /^[0-9a-f]{40,64}$/i;
const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;
const PREFLIGHT_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 1600, height: 1000 }),
  Object.freeze({ width: 1920, height: 1080 }),
  Object.freeze({ width: 2048, height: 1320 }),
]);

function jsonClone(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new TypeError(`${label} must be JSON-serializable: ${error.message}`);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function assertSafeId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new TypeError(`${label} must match ${SAFE_ID}.`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function outputChild(root, relative, label) {
  if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) {
    throw new TypeError(`${label} must be a relative path.`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved === resolvedRoot || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes its isolated diagram directory.`);
  }
  return resolved;
}

function expand(value, replacements, label) {
  assertString(value, label);
  const unknown = [...value.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((name) => !Object.hasOwn(replacements, name));
  if (unknown.length) throw new Error(`${label} contains unknown placeholder {${unknown[0]}}.`);
  return value.replace(/\{([^}]+)\}/g, (_match, name) => replacements[name]);
}

function writeNewFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, contents, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function writeNewJson(file, value) {
  writeNewFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function commandOrder(commands, diagramLabel) {
  let candidateValidated = false;
  let artifactDelivered = false;
  let qualityCommands = 0;

  for (const command of commands) {
    if (command.kind === 'exec') {
      candidateValidated = false;
      artifactDelivered = false;
      continue;
    }
    qualityCommands += 1;
    if (command.kind === 'validate') {
      candidateValidated = true;
      artifactDelivered = false;
      continue;
    }
    if (command.kind === 'deliver') {
      if (!candidateValidated) {
        throw new Error(`${diagramLabel}: deliver command ${command.id} requires a preceding validate after the last exec command.`);
      }
      artifactDelivered = true;
      continue;
    }
    if (command.kind === 'visual-check' && !artifactDelivered) {
      throw new Error(`${diagramLabel}: visual-check command ${command.id} requires a preceding deliver command.`);
    }
  }

  if (qualityCommands === 0 || commands.filter((command) => command.kind !== 'exec').at(-1)?.kind !== 'visual-check') {
    throw new Error(`${diagramLabel}: the final typed quality command must be visual-check.`);
  }
}

function normalizeManifest(manifest, manifestPath, outputRoot) {
  assertObject(manifest, 'manifest');
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported suite manifest schema ${JSON.stringify(manifest.schemaVersion)}.`);
  const id = assertSafeId(manifest.id, 'manifest.id');
  const qualityProfile = manifest.qualityProfile ?? 'showcase';
  if (!['showcase', 'standard'].includes(qualityProfile)) {
    throw new Error(`manifest.qualityProfile must be "showcase" or "standard".`);
  }
  if (!Array.isArray(manifest.diagrams) || manifest.diagrams.length === 0) {
    throw new Error('manifest.diagrams must contain at least one diagram.');
  }
  if (manifest.projectIndex !== undefined && typeof manifest.projectIndex !== 'boolean') {
    throw new Error('manifest.projectIndex must be boolean when specified.');
  }
  if (manifest.viewportPreflight !== undefined && typeof manifest.viewportPreflight !== 'boolean') {
    throw new Error('manifest.viewportPreflight must be boolean when specified.');
  }

  const manifestDirectory = path.dirname(manifestPath);
  const seenDiagramIds = new Set();
  const diagrams = manifest.diagrams.map((rawDiagram, diagramIndex) => {
    const diagram = assertObject(rawDiagram, `manifest.diagrams[${diagramIndex}]`);
    const type = assertString(diagram.type, `manifest.diagrams[${diagramIndex}].type`);
    if (!DIAGRAM_TYPES.has(type)) throw new Error(`Unknown diagram type ${JSON.stringify(type)}.`);
    const diagramId = assertSafeId(diagram.id ?? type, `manifest.diagrams[${diagramIndex}].id`);
    if (seenDiagramIds.has(diagramId)) throw new Error(`Duplicate diagram id ${JSON.stringify(diagramId)}.`);
    seenDiagramIds.add(diagramId);
    const outputDirectory = outputChild(outputRoot, diagramId, `diagram ${diagramId} output directory`);
    const artifactPath = outputChild(
      outputDirectory,
      diagram.artifact ?? `${diagramId}.html`,
      `diagram ${diagramId} artifact`,
    );
    const replacements = {
      manifestDirectory,
      diagramOutput: outputDirectory,
      outputRoot,
      diagramType: type,
    };
    const rawCandidate = diagram.candidate ?? '{diagramOutput}/candidate.json';
    const expandedCandidate = expand(rawCandidate, replacements, `diagram ${diagramId} candidate`);
    const candidatePath = path.isAbsolute(expandedCandidate)
      ? path.normalize(expandedCandidate)
      : path.resolve(manifestDirectory, expandedCandidate);
    const reserved = [
      path.join(outputDirectory, 'timing.events.jsonl'),
      path.join(outputDirectory, 'timing.json'),
      path.join(outputDirectory, 'visual-review.json'),
    ];
    if (reserved.includes(candidatePath)) {
      throw new Error(`diagram ${diagramId} candidate conflicts with reserved orchestration file ${candidatePath}.`);
    }
    if (reserved.includes(artifactPath)) {
      throw new Error(`diagram ${diagramId} artifact conflicts with reserved orchestration file ${artifactPath}.`);
    }
    if (candidatePath === artifactPath) {
      throw new Error(`diagram ${diagramId} candidate and artifact must be different files.`);
    }

    if (!Array.isArray(diagram.commands) || diagram.commands.length === 0) {
      throw new Error(`diagram ${diagramId} commands must contain at least one command.`);
    }
    const seenCommandIds = new Set();
    const commands = diagram.commands.map((rawCommand, commandIndex) => {
      const command = assertObject(rawCommand, `diagram ${diagramId} command ${commandIndex}`);
      const kind = assertString(command.kind, `diagram ${diagramId} command ${commandIndex} kind`);
      if (!COMMAND_KINDS.has(kind)) throw new Error(`diagram ${diagramId}: unknown command kind ${JSON.stringify(kind)}.`);
      const commandId = assertSafeId(command.id ?? `${kind}-${commandIndex + 1}`, `diagram ${diagramId} command id`);
      if (seenCommandIds.has(commandId)) throw new Error(`diagram ${diagramId}: duplicate command id ${JSON.stringify(commandId)}.`);
      seenCommandIds.add(commandId);
      if (kind === 'exec') {
        if (!Array.isArray(command.argv) || command.argv.length === 0 || command.argv.some((arg) => typeof arg !== 'string')) {
          throw new Error(`diagram ${diagramId}: exec command ${commandId} requires a non-empty string argv array.`);
        }
        if (command.cwd && !['repository', 'diagram', 'manifest'].includes(command.cwd)) {
          throw new Error(`diagram ${diagramId}: exec command ${commandId} has unsupported cwd ${JSON.stringify(command.cwd)}.`);
        }
        if (command.receipt && command.receipt !== 'json') {
          throw new Error(`diagram ${diagramId}: exec command ${commandId} receipt must be "json" when specified.`);
        }
      } else if (command.quality && command.quality !== qualityProfile) {
        throw new Error(`diagram ${diagramId}: ${commandId} quality must match suite qualityProfile ${qualityProfile}.`);
      }
      return {
        id: commandId,
        kind,
        ...(kind === 'exec' ? {
          argv: [...command.argv],
          cwd: command.cwd ?? 'repository',
          receipt: command.receipt ?? null,
        } : {}),
      };
    });
    commandOrder(commands, `diagram ${diagramId}`);

    return {
      id: diagramId,
      type,
      candidatePath,
      artifactPath,
      outputDirectory,
      commands,
    };
  });

  return {
    id,
    qualityProfile,
    projectIndex: manifest.projectIndex === true,
    viewportPreflight: manifest.viewportPreflight !== false,
    diagrams,
    manifestPath,
    manifestDirectory,
  };
}

function commandRequest({ command, diagram, suite, archifyCli }) {
  const replacements = {
    manifestDirectory: suite.manifestDirectory,
    diagramOutput: diagram.outputDirectory,
    outputRoot: suite.outputRoot,
    diagramType: diagram.type,
    candidate: diagram.candidatePath,
    artifact: diagram.artifactPath,
    repoRoot: suite.repository.root,
    revision: suite.repository.revision,
    archifyCli,
  };
  const environment = {
    ARCHIFY_SUITE_ID: suite.id,
    ARCHIFY_SUITE_DIAGRAM_ID: diagram.id,
    ARCHIFY_SUITE_DIAGRAM_TYPE: diagram.type,
    ARCHIFY_SUITE_REPOSITORY_REVISION: suite.repository.revision,
  };

  if (command.kind === 'exec') {
    const argv = command.argv.map((arg, index) => expand(arg, replacements, `${diagram.id}.${command.id}.argv[${index}]`));
    const cwd = {
      repository: suite.repository.root,
      diagram: diagram.outputDirectory,
      manifest: suite.manifestDirectory,
    }[command.cwd];
    return {
      id: command.id,
      kind: command.kind,
      executable: argv[0],
      args: argv.slice(1),
      cwd,
      env: environment,
    };
  }

  if (command.kind === 'validate') {
    return {
      id: command.id,
      kind: command.kind,
      executable: process.execPath,
      args: [
        archifyCli,
        'validate',
        diagram.type,
        diagram.candidatePath,
        '--quality',
        suite.qualityProfile,
        ...(diagram.type === 'architecture' ? ['--repo-root', suite.repository.root] : []),
        ...(suite.viewportPreflight ? ['--preflight'] : []),
        '--json',
      ],
      cwd: diagram.outputDirectory,
      env: environment,
    };
  }

  if (command.kind === 'deliver') {
    return {
      id: command.id,
      kind: command.kind,
      executable: process.execPath,
      args: [
        archifyCli,
        'deliver',
        diagram.type,
        diagram.candidatePath,
        diagram.artifactPath,
        '--quality',
        suite.qualityProfile,
        ...(diagram.type === 'architecture' ? ['--repo-root', suite.repository.root] : []),
        '--json',
      ],
      cwd: diagram.outputDirectory,
      env: environment,
    };
  }

  throw new Error('Per-diagram visual-check commands must be executed through the shared batch seam.');
}

function capabilityRequest(suite, archifyCli) {
  return {
    id: 'chrome-capability',
    kind: 'chrome-capability',
    executable: process.execPath,
    args: [archifyCli, 'visual-check', '--probe', '--json'],
    cwd: suite.outputRoot,
    env: {
      ARCHIFY_SUITE_ID: suite.id,
      ARCHIFY_SUITE_REPOSITORY_REVISION: suite.repository.revision,
    },
  };
}

function parseCapabilityReceipt(result) {
  let receipt;
  try {
    receipt = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Chrome capability probe did not emit one JSON receipt: ${error.message}`);
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || receipt.command !== 'visual-capability-probe'
    || typeof receipt.ok !== 'boolean') {
    throw new Error('Chrome capability probe emitted an invalid receipt.');
  }
  return receipt;
}

async function runCapabilityGate({ suite, archifyCli, commandRunner, recorder }) {
  let receipt = null;
  let failure = null;
  try {
    await recorder.stage('chromeCapability', async (stage) => {
      await stage.attempt('probe', async (attempt) => {
        const result = await attempt.span('command', async () => commandRunner(capabilityRequest(suite, archifyCli)));
        receipt = await attempt.span('receipt', async () => parseCapabilityReceipt(result));
        attempt.milestone('chromeCapabilityResult', { receipt, exitCode: result.exitCode });
        if (result.exitCode !== 0
          || receipt.ok !== true
          || receipt.status !== 'pass'
          || receipt.chrome?.status !== 'available'
          || receipt.cdp?.status !== 'available'
          || receipt.chrome?.sandbox?.automaticOptOut !== false) {
          const error = new Error(`Chrome capability gate ${receipt.status || 'failed'} with exit code ${result.exitCode}.`);
          error.code = 'ARCHIFY_SUITE_CHROME_CAPABILITY';
          error.exitCode = result.exitCode;
          throw error;
        }
      });
    });
  } catch (error) {
    failure = error;
  }
  if (!receipt) {
    receipt = {
      schemaVersion: 1,
      ok: false,
      command: 'visual-capability-probe',
      status: 'fail',
      error: failure?.message || 'Chrome capability probe failed without a receipt.',
    };
  }
  const snapshot = recoverRunTiming(recorder.eventsPath, recorder.timingPath);
  const stage = snapshot.stages.find((candidate) => candidate.name === 'chromeCapability');
  return {
    ok: !failure && receipt.ok === true && receipt.status === 'pass',
    receipt,
    durationMs: stage?.durationMs ?? null,
    ...(failure ? { error: failure } : {}),
  };
}

function visualBatchRequest(suite, contexts, archifyCli) {
  return {
    id: 'visual-check-batch',
    kind: 'visual-check-batch',
    executable: process.execPath,
    args: [
      archifyCli,
      'visual-check',
      ...contexts.map((context) => context.diagram.artifactPath),
      '--json',
    ],
    cwd: suite.outputRoot,
    env: {
      ARCHIFY_SUITE_ID: suite.id,
      ARCHIFY_SUITE_REPOSITORY_REVISION: suite.repository.revision,
    },
  };
}

function parseVisualBatchReceipt(result, expectedCount) {
  let receipt;
  try {
    receipt = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Visual-check batch did not emit one JSON receipt: ${error.message}`);
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('Visual-check batch emitted a non-object JSON receipt.');
  }
  const artifacts = receipt.command === 'visual-check' ? [receipt] : receipt.artifacts;
  if (!['visual-check', 'visual-check-batch'].includes(receipt.command)
    || typeof receipt.ok !== 'boolean'
    || !Array.isArray(artifacts)
    || artifacts.length !== expectedCount) {
    throw new Error('Visual-check batch emitted an invalid artifact receipt set.');
  }
  if (artifacts.some((artifact) => artifact?.command !== 'visual-check'
    || typeof artifact?.ok !== 'boolean'
    || typeof artifact?.status !== 'string')) {
    throw new Error('Visual-check batch emitted malformed child receipts.');
  }
  const childrenPass = artifacts.every((artifact) => artifact.ok === true && artifact.status === 'pass');
  if (receipt.ok !== childrenPass
    || (childrenPass ? receipt.status !== 'pass' : receipt.status === 'pass')) {
    throw new Error('Visual-check batch wrapper contradicts its child receipts.');
  }
  return { receipt, artifacts };
}

async function runVisualBatch({ suite, contexts, archifyCli, commandRunner, recorder }) {
  let parsed = null;
  let commandResult = null;
  let failure = null;
  try {
    await recorder.stage('visualCheckBatch', async (stage) => {
      await stage.attempt('visual-check-batch', async (attempt) => {
        commandResult = await attempt.span('command', async () => commandRunner(
          visualBatchRequest(suite, contexts, archifyCli),
        ));
        parsed = await attempt.span('receipt', async () => parseVisualBatchReceipt(
          commandResult,
          contexts.length,
        ));
        attempt.milestone('visualCheckBatchResult', {
          receipt: parsed.receipt,
          exitCode: commandResult.exitCode,
        });
        if (commandResult.exitCode !== 0
          || parsed.receipt.ok !== true
          || parsed.receipt.status !== 'pass') {
          const error = new Error(`Visual-check batch ${parsed.receipt.status || 'failed'} with exit code ${commandResult.exitCode}.`);
          error.code = 'ARCHIFY_SUITE_VISUAL_BATCH';
          error.exitCode = commandResult.exitCode;
          throw error;
        }
      });
    });
  } catch (error) {
    failure = error;
  }
  const snapshot = recoverRunTiming(recorder.eventsPath, recorder.timingPath);
  const stage = snapshot.stages.find((candidate) => candidate.name === 'visualCheckBatch');
  return {
    receipt: parsed?.receipt || null,
    artifacts: parsed?.artifacts || [],
    exitCode: commandResult?.exitCode ?? 1,
    durationMs: stage?.durationMs ?? null,
    ...(failure ? { error: failure } : {}),
  };
}

function mappedVisualReceipt(context, batch) {
  const expected = context.diagram.artifactPath;
  const matches = batch.artifacts.filter((receipt) => {
    const receiptPath = receipt?.artifact?.path;
    return typeof receiptPath === 'string' && path.resolve(receiptPath) === expected;
  });
  if (matches.length === 1
    && matches[0].command === 'visual-check'
    && typeof matches[0].ok === 'boolean') {
    const receipt = matches[0];
    return {
      receipt,
      exitCode: receipt.ok ? 0 : receipt.status === 'skipped' ? 2 : 1,
    };
  }
  return {
    exitCode: 1,
    receipt: {
      schemaVersion: 1,
      ok: false,
      command: 'visual-check',
      status: 'fail',
      visualReview: 'pending',
      artifact: { path: expected },
      error: batch.error?.message || `Visual-check batch did not return exactly one receipt for ${expected}.`,
    },
  };
}

function digestText(value) {
  const data = Buffer.from(value || '', 'utf8');
  return {
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

function parseCommandReceipt(command, result) {
  if (command.kind === 'exec' && command.receipt !== 'json') {
    return {
      schemaVersion: 1,
      ok: result.exitCode === 0,
      command: 'exec',
      stdout: digestText(result.stdout),
      stderr: digestText(result.stderr),
    };
  }
  let receipt;
  try {
    receipt = JSON.parse(result.stdout);
  } catch (error) {
    const parseError = new Error(`${command.kind} command ${command.id} did not emit one JSON receipt: ${error.message}`);
    parseError.code = 'ARCHIFY_SUITE_RECEIPT_INVALID';
    throw parseError;
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error(`${command.kind} command ${command.id} emitted a non-object JSON receipt.`);
  }
  if (command.kind !== 'exec' && receipt.command !== command.kind) {
    throw new Error(`${command.kind} command ${command.id} emitted receipt for ${JSON.stringify(receipt.command)}.`);
  }
  if (command.kind !== 'exec' && typeof receipt.ok !== 'boolean') {
    throw new Error(`${command.kind} command ${command.id} receipt must contain boolean ok.`);
  }
  return receipt;
}

function commandFailure(command, result, receipt) {
  const failed = result.exitCode !== 0 || receipt?.ok === false;
  if (!failed) return null;
  const error = new Error(`${command.kind} command ${command.id} failed with exit code ${result.exitCode}.`);
  error.code = 'ARCHIFY_SUITE_COMMAND_FAILED';
  error.exitCode = result.exitCode;
  return error;
}

function verifyQualityReceipt(diagram, command, receipt, qualityProfile, viewportPreflight) {
  if (!receipt?.ok || command.kind === 'exec') return;
  if (command.kind === 'validate') {
    if (!Array.isArray(receipt.checks) || receipt.checks.length < 9 || receipt.checks.some((check) => check?.ok !== true)) {
      throw new Error(`validate success receipt does not preserve the 9/9 deterministic quality floor.`);
    }
    if (receipt.composition?.summary?.errors !== 0 || receipt.composition?.summary?.warnings !== 0) {
      throw new Error('validate success receipt must contain 0 composition errors and 0 warnings.');
    }
    if (receipt.composition?.profile !== qualityProfile) {
      throw new Error(`validate receipt profile ${JSON.stringify(receipt.composition?.profile)} does not match suite profile ${qualityProfile}.`);
    }
    if (viewportPreflight) {
      const preflight = receipt.preflight;
      const viewports = preflight?.containment?.viewports;
      const actualViewports = Array.isArray(viewports)
        ? new Set(viewports.map((viewport) => `${viewport.width}x${viewport.height}`))
        : new Set();
      const expectedViewports = new Set(PREFLIGHT_VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`));
      if (preflight?.ok !== true
        || preflight?.status !== 'pass'
        || preflight?.containment?.status !== 'pass'
        || !Array.isArray(viewports)
        || viewports.length !== PREFLIGHT_VIEWPORTS.length
        || actualViewports.size !== expectedViewports.size
        || [...expectedViewports].some((viewport) => !actualViewports.has(viewport))
        || viewports.some((viewport) => viewport?.ok !== true || viewport?.theme !== 'light')) {
        throw new Error('validate success receipt must contain a passing 4/4 viewport preflight.');
      }
    }
    return;
  }
  if (command.kind === 'deliver') {
    const validation = receipt.validation;
    if (!validation || validation.checkCount < 9 || validation.checksPassed !== validation.checkCount) {
      throw new Error('deliver success receipt does not preserve the 9/9 deterministic quality floor.');
    }
    if (validation.errors !== 0 || validation.warnings !== 0) {
      throw new Error('deliver success receipt must contain 0 errors and 0 warnings.');
    }
    if (validation.compositionProfile !== qualityProfile) {
      throw new Error(`deliver receipt profile ${JSON.stringify(validation.compositionProfile)} does not match suite profile ${qualityProfile}.`);
    }
    return;
  }
  const viewports = receipt.containment?.viewports;
  if (receipt.containment?.status !== 'pass'
    || !Array.isArray(viewports)
    || viewports.length < 4
    || viewports.some((viewport) => viewport?.ok !== true)) {
    throw new Error('visual-check success receipt must pass all four desktop containment viewports.');
  }
  const screenshots = receipt.captures?.screenshots;
  if (receipt.captures?.status !== 'pass'
    || !Array.isArray(screenshots)
    || screenshots.length < 4
    || screenshots.some((screenshot) => screenshot?.ok !== true)) {
    throw new Error('visual-check success receipt must include four passing light/dark screenshots.');
  }
  const themes = new Set(screenshots.map((screenshot) => screenshot.theme));
  if (!themes.has('light') || !themes.has('dark')) {
    throw new Error('visual-check screenshots must include both light and dark themes.');
  }
  for (const screenshot of screenshots) {
    const file = screenshot.file;
    if (typeof file !== 'string' || !file || !fs.existsSync(path.resolve(diagram.outputDirectory, file))) {
      throw new Error(`visual-check screenshot is missing: ${String(file)}`);
    }
  }
}

function verifyReceiptArtifact(diagram, command, receipt) {
  if (!['deliver', 'visual-check'].includes(command.kind) || !receipt?.ok) return;
  if (!fs.existsSync(diagram.artifactPath)) {
    throw new Error(`${command.kind} reported success but artifact is missing: ${diagram.artifactPath}`);
  }
  const expectedSha = receipt.artifact?.sha256;
  if (!expectedSha) throw new Error(`${command.kind} success receipt has no artifact.sha256.`);
  const actualSha = createHash('sha256').update(fs.readFileSync(diagram.artifactPath)).digest('hex');
  if (actualSha !== expectedSha) {
    throw new Error(`${command.kind} artifact sha256 does not match its receipt.`);
  }
}

function verifyCandidateRevision(diagram, revision) {
  let candidate;
  try {
    candidate = JSON.parse(fs.readFileSync(diagram.candidatePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read candidate ${diagram.candidatePath}: ${error.message}`);
  }
  const declared = candidate?.meta?.repository?.revision;
  if (declared && String(declared).toLowerCase() !== revision.toLowerCase()) {
    throw new Error(`Candidate repository revision ${declared} does not match pinned revision ${revision}.`);
  }
}

function pendingVisualReview(diagram, artifactPath) {
  return {
    schemaVersion: 1,
    kind: 'archify.visual-review',
    diagram: { id: diagram.id, type: diagram.type },
    artifact: { path: artifactPath },
    status: 'pending',
    reviewer: null,
    reviewedAt: null,
    notes: null,
  };
}

function finalReceipt({ suite, diagram, commandReceipts, status, error = null }) {
  return {
    schemaVersion: 1,
    kind: 'archify.diagram-run',
    status,
    repository: suite.repository,
    quality: {
      profile: suite.qualityProfile,
      viewportPreflight: suite.viewportPreflight,
    },
    ...(suite.projectIndexReceipt ? { projectIndex: suite.projectIndexReceipt } : {}),
    diagram: {
      id: diagram.id,
      type: diagram.type,
      candidate: diagram.candidatePath,
      artifact: diagram.artifactPath,
    },
    commands: commandReceipts,
    ...(error ? {
      error: {
        name: error.name || 'Error',
        message: error.message || String(error),
        ...(error.code ? { code: error.code } : {}),
      },
    } : {}),
  };
}

function diagramResult(context, timing, artifactPath) {
  return {
    diagram: context.diagram,
    timing,
    timingPath: context.timingPath,
    eventsPath: context.eventsPath,
    artifactPath,
    visualReview: context.visualReview,
    visualReviewPath: context.visualReviewPath,
  };
}

function finalizeDiagramFailure(context, error) {
  const receipt = finalReceipt({
    suite: context.suite,
    diagram: context.diagram,
    commandReceipts: context.commandReceipts,
    status: 'failed',
    error,
  });
  const timing = context.recorder.finalize({ status: 'failed', finalReceipt: receipt });
  return diagramResult(
    context,
    timing,
    fs.existsSync(context.diagram.artifactPath) ? context.diagram.artifactPath : null,
  );
}

async function runDiagramUntilVisual({ suite, diagram, archifyCli, commandRunner }) {
  fs.mkdirSync(diagram.outputDirectory, { recursive: true });
  const eventsPath = path.join(diagram.outputDirectory, 'timing.events.jsonl');
  const timingPath = path.join(diagram.outputDirectory, 'timing.json');
  const visualReviewPath = path.join(diagram.outputDirectory, 'visual-review.json');
  const visualReview = pendingVisualReview(diagram, diagram.artifactPath);
  writeNewJson(visualReviewPath, visualReview);

  const recorder = RunRecorder.open({
    run: {
      id: `${suite.id}/${diagram.id}`,
      suiteId: suite.id,
      diagramId: diagram.id,
      diagramType: diagram.type,
      repository: suite.repository,
      outputDirectory: diagram.outputDirectory,
    },
    eventsPath,
    timingPath,
  });
  const commandReceipts = [];
  const context = {
    suite,
    diagram,
    recorder,
    commandReceipts,
    timingPath,
    eventsPath,
    visualReview,
    visualReviewPath,
    visualCommand: diagram.commands.at(-1),
    pendingVisual: true,
  };

  try {
    for (const command of diagram.commands.slice(0, -1)) {
      const request = commandRequest({ command, diagram, suite, archifyCli });
      await recorder.stage(command.id, async (stage) => {
        await stage.attempt(command.kind, async (attempt) => {
          if (['validate', 'deliver'].includes(command.kind)) {
            await attempt.span('candidate-revision', async () => verifyCandidateRevision(diagram, suite.repository.revision));
          }
          const result = await attempt.span('command', async () => commandRunner(request));
          const receipt = await attempt.span('receipt', async () => parseCommandReceipt(command, result));
          commandReceipts.push({
            id: command.id,
            kind: command.kind,
            exitCode: result.exitCode,
            receipt,
          });
          verifyQualityReceipt(
            diagram,
            command,
            receipt,
            suite.qualityProfile,
            suite.viewportPreflight,
          );
          verifyReceiptArtifact(diagram, command, receipt);
          const failure = commandFailure(command, result, receipt);
          if (failure) throw failure;
        }, { kind: command.kind });

        if (command.kind === 'validate') stage.milestone('deterministicValidationPassed');
        if (command.kind === 'deliver') stage.milestone('artifactReady');
      }, { kind: command.kind });
    }
    return context;
  } catch (error) {
    return finalizeDiagramFailure(context, error);
  }
}

async function completeDiagramVisual(context, { receipt, exitCode, batchDurationMs }) {
  const { suite, diagram, recorder, commandReceipts, visualCommand } = context;
  try {
    await recorder.stage(visualCommand.id, async (stage) => {
      await stage.attempt('visual-check', async (attempt) => {
        await attempt.span('shared-batch-receipt', async () => {
          commandReceipts.push({
            id: visualCommand.id,
            kind: 'visual-check',
            exitCode,
            sharedBatch: true,
            receipt,
          });
          verifyQualityReceipt(
            diagram,
            visualCommand,
            receipt,
            suite.qualityProfile,
            suite.viewportPreflight,
          );
          verifyReceiptArtifact(diagram, visualCommand, receipt);
          const failure = commandFailure(visualCommand, { exitCode }, receipt);
          if (failure) throw failure;
        });
      }, { kind: 'visual-check', sharedBatchDurationMs: batchDurationMs });
      stage.milestone('reviewReady', { sharedBatchDurationMs: batchDurationMs });
    }, { kind: 'visual-check', sharedBatch: true, sharedBatchDurationMs: batchDurationMs });

    const final = finalReceipt({
      suite,
      diagram,
      commandReceipts,
      status: 'completed',
    });
    const timing = recorder.finalize({ status: 'completed', finalReceipt: final });
    return diagramResult(context, timing, diagram.artifactPath);
  } catch (error) {
    return finalizeDiagramFailure(context, error);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

/** Production adapter for the injected command-runner seam. */
export function spawnCommandRunner(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      env: { ...process.env, ...request.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    const collect = (target) => (chunk) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        return;
      }
      target.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        reject(new Error(`Command ${request.id} exceeded ${MAX_COMMAND_OUTPUT_BYTES} output bytes.`));
        return;
      }
      resolve({
        exitCode: Number.isInteger(exitCode) ? exitCode : 1,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

async function verifyPinnedRevision(repoRoot, revision, commandRunner) {
  if (!PINNED_REVISION.test(revision)) {
    throw new Error('revision must be a full 40-64 character hexadecimal commit id.');
  }
  const result = await commandRunner({
    id: 'repository-revision',
    kind: 'repository-revision',
    executable: 'git',
    args: ['-C', repoRoot, 'rev-parse', 'HEAD'],
    cwd: repoRoot,
    env: {},
  });
  if (result.exitCode !== 0) {
    throw new Error(`Could not resolve repository HEAD: ${result.stderr.trim() || `exit ${result.exitCode}`}`);
  }
  const actual = result.stdout.trim();
  if (actual.toLowerCase() !== revision.toLowerCase()) {
    throw new Error(`Pinned revision ${revision} does not match repository HEAD ${actual}.`);
  }
  return actual.toLowerCase();
}

function ensureFreshOutput(outputRoot, diagrams) {
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const name of [
    'README.md',
    'suite-result.json',
    'project-index.json',
    'suite-timing.events.jsonl',
    'suite-timing.json',
  ]) {
    if (fs.existsSync(path.join(outputRoot, name))) {
      throw new Error(`Suite output already exists: ${path.join(outputRoot, name)}`);
    }
  }
  for (const diagram of diagrams) {
    if (fs.existsSync(diagram.outputDirectory) && fs.readdirSync(diagram.outputDirectory).length > 0) {
      throw new Error(`Diagram output directory is not empty: ${diagram.outputDirectory}`);
    }
  }
}

/**
 * Deep suite orchestration module. The external interface supplies one
 * manifest, one repository pin, one output root, and one command-runner
 * adapter; command typing, isolation, timing, receipts, and reporting stay
 * local to the implementation.
 */
export async function runSuite({
  manifestPath,
  repoRoot,
  revision,
  outputRoot,
  archifyCli,
  concurrency = 1,
  commandRunner = spawnCommandRunner,
}) {
  const absoluteManifest = path.resolve(assertString(manifestPath, 'manifestPath'));
  const absoluteRepo = path.resolve(assertString(repoRoot, 'repoRoot'));
  const absoluteOutput = path.resolve(assertString(outputRoot, 'outputRoot'));
  const absoluteCli = path.resolve(assertString(archifyCli, 'archifyCli'));
  if (!fs.statSync(absoluteRepo).isDirectory()) throw new Error(`repoRoot is not a directory: ${absoluteRepo}`);
  if (!fs.statSync(absoluteCli).isFile()) throw new Error(`archifyCli is not a file: ${absoluteCli}`);
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('concurrency must be a positive integer.');

  const manifest = jsonClone(JSON.parse(fs.readFileSync(absoluteManifest, 'utf8')), 'manifest');
  const normalized = normalizeManifest(manifest, absoluteManifest, absoluteOutput);
  const pinnedRevision = await verifyPinnedRevision(absoluteRepo, assertString(revision, 'revision'), commandRunner);
  const suite = {
    ...normalized,
    outputRoot: absoluteOutput,
    repository: { root: absoluteRepo, revision: pinnedRevision },
  };
  ensureFreshOutput(absoluteOutput, suite.diagrams);
  const suiteEventsPath = path.join(absoluteOutput, 'suite-timing.events.jsonl');
  const suiteTimingPath = path.join(absoluteOutput, 'suite-timing.json');
  const suiteRecorder = RunRecorder.open({
    run: {
      id: suite.id,
      suiteId: suite.id,
      repository: suite.repository,
      outputDirectory: absoluteOutput,
    },
    eventsPath: suiteEventsPath,
    timingPath: suiteTimingPath,
  });

  const capability = await runCapabilityGate({
    suite,
    archifyCli: absoluteCli,
    commandRunner,
    recorder: suiteRecorder,
  });
  suite.chromeCapability = {
    receipt: capability.receipt,
    durationMs: capability.durationMs,
  };
  let suiteError = capability.error || null;
  let prepared = [];
  let results = [];

  if (!suiteError && suite.projectIndex) {
    try {
      await suiteRecorder.stage('projectIndex', async (stage) => {
        const index = await stage.span('build', async () => buildProjectIndex({
          repoRoot: absoluteRepo,
          revision: pinnedRevision,
        }));
        const indexPath = path.join(absoluteOutput, 'project-index.json');
        writeNewJson(indexPath, index);
        suite.projectIndexReceipt = {
          schemaVersion: index.schemaVersion,
          path: indexPath,
          digest: index.digest,
          repository: {
            origin: index.repository.origin,
            revision: index.repository.revision,
          },
          files: index.files.length,
          filesAnalyzed: index.analysis.filesAnalyzed,
          packages: index.packages.length,
        };
        stage.milestone('projectIndexReady', suite.projectIndexReceipt);
      });
    } catch (error) {
      suiteError = error;
    }
  }

  if (!suiteError) {
    try {
      prepared = await suiteRecorder.stage('diagramRuns', async (stage) => mapWithConcurrency(
        suite.diagrams,
        concurrency,
        (diagram) => stage.span(
          diagram.id,
          async () => runDiagramUntilVisual({ suite, diagram, archifyCli: absoluteCli, commandRunner }),
          { diagramType: diagram.type },
        ),
      ));
    } catch (error) {
      suiteError = error;
    }
  }

  if (!suiteError) {
    const pendingVisual = prepared.filter((entry) => entry.pendingVisual === true);
    const alreadyFinalized = prepared.filter((entry) => entry.pendingVisual !== true);
    let finalizedVisual = [];
    if (pendingVisual.length > 0) {
      const batch = await runVisualBatch({
        suite,
        contexts: pendingVisual,
        archifyCli: absoluteCli,
        commandRunner,
        recorder: suiteRecorder,
      });
      suite.visualCheckBatch = {
        receipt: batch.receipt,
        durationMs: batch.durationMs,
        artifacts: pendingVisual.map((context) => context.diagram.artifactPath),
      };
      finalizedVisual = await suiteRecorder.stage('visualReceiptFanout', async (stage) => Promise.all(
        pendingVisual.map((context) => stage.span(
          context.diagram.id,
          async () => completeDiagramVisual(context, {
            ...mappedVisualReceipt(context, batch),
            batchDurationMs: batch.durationMs,
          }),
          { diagramType: context.diagram.type, sharedBatchDurationMs: batch.durationMs },
        )),
      ));
      if (batch.error) suiteError = batch.error;
    }
    const finalizedById = new Map([...alreadyFinalized, ...finalizedVisual]
      .map((result) => [result.diagram.id, result]));
    results = suite.diagrams.map((diagram) => finalizedById.get(diagram.id)).filter(Boolean);
  }

  suite.automationError = suiteError ? {
    name: suiteError.name || 'Error',
    message: suiteError.message || String(suiteError),
    ...(suiteError.code ? { code: suiteError.code } : {}),
  } : null;
  suite.suiteTimingPath = suiteTimingPath;
  suite.suiteEventsPath = suiteEventsPath;
  let report;
  await suiteRecorder.stage('reporting', async () => {
    report = renderSuiteReport({ suite, results, outputRoot: absoluteOutput });
    writeNewFile(path.join(absoluteOutput, 'README.md'), report.markdown);
  });

  const finalReceipt = {
    schemaVersion: 1,
    kind: 'archify.suite-run',
    status: suiteError || results.some((result) => result.timing.status !== 'completed')
      ? 'failed'
      : 'completed',
    repository: suite.repository,
    quality: {
      profile: suite.qualityProfile,
      viewportPreflight: suite.viewportPreflight,
    },
    chromeCapability: suite.chromeCapability,
    ...(suite.visualCheckBatch ? { visualCheckBatch: suite.visualCheckBatch } : {}),
    ...(suite.projectIndexReceipt ? { projectIndex: suite.projectIndexReceipt } : {}),
    plannedDiagrams: suite.diagrams.map((diagram) => ({ id: diagram.id, type: diagram.type })),
    diagrams: results.map((result) => ({
      id: result.diagram.id,
      type: result.diagram.type,
      status: result.timing.status,
      timing: result.timingPath,
      finalReceipt: result.timing.finalReceipt,
    })),
    ...(suite.automationError ? { error: suite.automationError } : {}),
  };
  const suiteTiming = suiteRecorder.finalize({
    status: finalReceipt.status === 'completed' ? 'completed' : 'failed',
    finalReceipt,
  });
  const summary = {
    schemaVersion: 1,
    kind: 'archify.suite-result',
    id: suite.id,
    status: report.status,
    repository: suite.repository,
    qualityProfile: suite.qualityProfile,
    viewportPreflight: suite.viewportPreflight,
    chromeCapability: suite.chromeCapability,
    ...(suite.visualCheckBatch ? { visualCheckBatch: suite.visualCheckBatch } : {}),
    ...(suite.projectIndexReceipt ? { projectIndex: suite.projectIndexReceipt } : {}),
    report: path.join(absoluteOutput, 'README.md'),
    timing: suiteTimingPath,
    events: suiteEventsPath,
    diagrams: results.map((result) => ({
      id: result.diagram.id,
      type: result.diagram.type,
      status: result.timing.status,
      timing: result.timingPath,
      events: result.eventsPath,
      artifact: result.artifactPath,
      visualReview: result.visualReviewPath,
    })),
    finalReceipt: suiteTiming.finalReceipt,
  };
  writeNewJson(path.join(absoluteOutput, 'suite-result.json'), summary);
  return summary;
}
