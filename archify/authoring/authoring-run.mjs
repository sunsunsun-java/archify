import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  normalizeAuthoringTiming,
  RunRecorder,
} from '../orchestration/run-recorder.mjs';
import { renderAuthoringReport } from '../orchestration/report.mjs';
import {
  QUALITY_CONTRACT,
  qualityContractIdentity,
} from './quality-contract.mjs';

const HANDOFF_SCHEMA_VERSION = 1;
const HANDOFF_KIND = 'archify.authoring-handoff';
const ENVELOPE_SCHEMA_VERSION = 1;
const ENVELOPE_KIND = 'archify.authoring-run-envelope';
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function productionClock() {
  return {
    monotonicMs: () => performance.now(),
    steadyMs: () => Number(process.hrtime.bigint()) / 1_000_000,
    wallMs: () => Date.now(),
  };
}

function steadyNow(clock) {
  const read = typeof clock.steadyMs === 'function'
    ? clock.steadyMs
    : clock.monotonicMs;
  if (typeof read !== 'function') {
    throw new TypeError('clock must provide steadyMs() or monotonicMs().');
  }
  const value = read.call(clock);
  if (!Number.isFinite(value)) throw new TypeError('steady clock must return a finite number.');
  return value;
}

function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJsonReceipt(file, label) {
  const absolute = path.resolve(file);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new TypeError(`${label} must be a regular file.`);
  const bytes = fs.readFileSync(absolute);
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} must contain JSON: ${error.message}`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError(`${label} must contain a JSON object.`);
  }
  return {
    path: absolute,
    bytes: bytes.byteLength,
    sha256: digestBytes(bytes),
    document,
  };
}

function writeNewFile(file, contents) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, contents, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function digestDescriptor(receipt) {
  return {
    path: receipt.path,
    sha256: receipt.sha256,
    bytes: receipt.bytes,
  };
}

function authoringPaths(outputDirectory) {
  const root = path.resolve(outputDirectory);
  return {
    envelopePath: path.join(root, 'authoring-run.json'),
    timingPath: path.join(root, 'timing.json'),
    handoffPath: path.join(root, 'handoff.json'),
    reportPath: path.join(root, 'authoring-report.md'),
  };
}

function assertRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)
    || typeof run.id !== 'string' || !run.id.trim()) {
    throw new TypeError('run must contain a non-empty id.');
  }
  if (typeof run.diagramType !== 'string' || !run.diagramType.trim()) {
    throw new TypeError('run must contain a non-empty diagramType.');
  }
  return JSON.parse(JSON.stringify(run));
}

function buildHandoff({ run, candidatePath, evidencePath, validationPath, createdAt }) {
  const candidate = readJsonReceipt(candidatePath, 'candidate');
  const evidence = readJsonReceipt(evidencePath, 'evidence ledger');
  const validation = readJsonReceipt(validationPath, 'validation receipt');
  if (validation.document.command !== 'validate' || validation.document.ok !== true) {
    throw new Error('validation receipt must be a passing validate receipt.');
  }
  const checks = Array.isArray(validation.document.checks) ? validation.document.checks : [];
  const checksPassed = checks.filter((check) => check?.ok === true).length;
  const errors = validation.document.composition?.summary?.errors;
  const warnings = validation.document.composition?.summary?.warnings;
  const guards = QUALITY_CONTRACT.guards;
  if (checks.length !== guards.deterministicChecksRequired
    || checksPassed !== guards.deterministicChecksRequired
    || validation.document.composition?.profile !== guards.qualityProfile
    || !Number.isInteger(errors) || !Number.isInteger(warnings)
    || errors !== guards.compositionErrors || warnings !== guards.compositionWarnings) {
    throw new Error(`validation receipt must contain exactly ${guards.deterministicChecksRequired} passing checks under ${guards.qualityProfile} with ${guards.compositionErrors} errors and ${guards.compositionWarnings} warnings.`);
  }
  const facts = Array.isArray(evidence.document.facts) ? evidence.document.facts : [];
  const evidenceRepository = evidence.document.repository;
  if (run.repository?.revision && evidenceRepository?.revision
    && run.repository.revision !== evidenceRepository.revision) {
    throw new Error('authoring run repository revision does not match the evidence ledger.');
  }
  const repository = evidenceRepository && typeof evidenceRepository === 'object'
    ? evidenceRepository
    : run.repository;
  const body = {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    kind: HANDOFF_KIND,
    status: 'ready',
    createdAt,
    diagram: {
      id: run.id,
      type: run.diagramType,
    },
    contract: qualityContractIdentity({ skillRoot: moduleRoot }),
    ...(repository ? { repository } : {}),
    candidate: digestDescriptor(candidate),
    evidence: {
      ...digestDescriptor(evidence),
      ledgerDigest: evidence.document.ledgerDigest || null,
      indexDigest: evidence.document.repository?.indexDigest || null,
      factCount: facts.length,
    },
    validation: {
      ...digestDescriptor(validation),
      profile: validation.document.composition?.profile || null,
      checksPassed,
      checksTotal: checks.length,
      errors,
      warnings,
    },
  };
  return {
    ...body,
    digest: digestBytes(Buffer.from(JSON.stringify(body), 'utf8')),
  };
}

/**
 * Start the cross-process CLI authoring envelope. The local clock is the only
 * source of the start marker; agents cannot supply duration fields.
 */
export function startAuthoringRun({ run, outputDirectory, clock = productionClock() }) {
  const safeRun = assertRun(run);
  const paths = authoringPaths(outputDirectory);
  for (const target of Object.values(paths)) {
    if (fs.existsSync(target)) {
      const error = new Error(`Authoring output already exists: ${target}`);
      error.code = 'EEXIST';
      throw error;
    }
  }
  const startedAtMs = clock.wallMs();
  if (!Number.isFinite(startedAtMs)) throw new TypeError('clock.wallMs() must return a finite number.');
  const startedSteadyMs = steadyNow(clock);
  const body = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    kind: ENVELOPE_KIND,
    status: 'started',
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    startedSteadyMs,
    run: { ...safeRun, measurementDomain: 'agent-authoring' },
  };
  const envelope = {
    ...body,
    digest: digestBytes(Buffer.from(JSON.stringify(body), 'utf8')),
  };
  writeNewFile(paths.envelopePath, `${JSON.stringify(envelope, null, 2)}\n`);
  return { envelope, paths };
}

/**
 * Finish a cross-process authoring envelope from frozen machine receipts.
 * Timing, handoff, and Markdown are all derived here; no agent-authored
 * duration or report is accepted by this interface.
 */
export function finalizeAuthoringRun({
  envelopePath,
  candidatePath,
  evidencePath,
  validationPath,
  clock = productionClock(),
}) {
  const envelopeReceipt = readJsonReceipt(envelopePath, 'authoring run envelope');
  const envelope = envelopeReceipt.document;
  const { digest, ...body } = envelope;
  if (envelope.schemaVersion !== ENVELOPE_SCHEMA_VERSION
    || envelope.kind !== ENVELOPE_KIND
    || envelope.status !== 'started'
    || typeof digest !== 'string'
    || digest !== digestBytes(Buffer.from(JSON.stringify(body), 'utf8'))) {
    throw new Error('authoring run envelope is invalid or has been modified.');
  }
  const run = assertRun(envelope.run);
  if (!Number.isFinite(envelope.startedAtMs)
    || !Number.isFinite(envelope.startedSteadyMs)
    || new Date(envelope.startedAtMs).toISOString() !== envelope.startedAt) {
    throw new Error('authoring run envelope has invalid start markers.');
  }
  const endedSteadyMs = steadyNow(clock);
  if (endedSteadyMs < envelope.startedSteadyMs) {
    throw new Error('authoring run steady end marker precedes its start marker.');
  }
  const durationMs = Math.round(endedSteadyMs - envelope.startedSteadyMs);
  const endedAtMs = envelope.startedAtMs + durationMs;
  const paths = authoringPaths(path.dirname(envelopeReceipt.path));
  for (const target of [paths.timingPath, paths.handoffPath, paths.reportPath]) {
    if (fs.existsSync(target)) {
      const error = new Error(`Authoring output already exists: ${target}`);
      error.code = 'EEXIST';
      throw error;
    }
  }
  const handoff = buildHandoff({
    run,
    candidatePath,
    evidencePath,
    validationPath,
    createdAt: new Date(endedAtMs).toISOString(),
  });
  const timing = normalizeAuthoringTiming({
    runId: run.id,
    diagramType: run.diagramType,
    agentStartMs: envelope.startedAtMs,
    agentEndMs: endedAtMs,
    status: 'completed',
    stages: [],
    ...(run.repository ? { repository: run.repository } : {}),
  });
  if (handoff.repository) {
    timing.run.repository = JSON.parse(JSON.stringify(handoff.repository));
  }
  timing.finalReceipt = handoff;
  timing.accounting.durationSource = 'monotonic-envelope-endpoints';
  timing.eventLog = {
    path: envelopeReceipt.path,
    eventCount: 1,
    durableAppend: false,
    truncatedTail: false,
    migratedFrom: 'authoring-run-envelope',
  };
  const report = renderAuthoringReport({ timing, outputRoot: path.dirname(envelopeReceipt.path) });
  writeNewFile(paths.handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
  writeNewFile(paths.reportPath, report.markdown);
  writeNewFile(paths.timingPath, `${JSON.stringify(timing, null, 2)}\n`);
  return { timing, handoff, report, paths };
}

/**
 * Deep authoring-run module. Callers only execute named stages and provide the
 * three final receipt paths; timing, digests, handoff, and report are owned by
 * this module and cannot be hand-filled by an agent.
 */
export class AuthoringRun {
  static open({ run, outputDirectory, clock = productionClock() }) {
    return new AuthoringRun({ run, outputDirectory, clock });
  }

  constructor({ run, outputDirectory, clock }) {
    this.run = assertRun(run);
    this.clock = clock;
    this.startedMonoMs = clock.monotonicMs();
    this.startedWallMs = clock.wallMs();
    this.outputDirectory = path.resolve(outputDirectory);
    this.paths = {
      eventsPath: path.join(this.outputDirectory, 'timing.events.jsonl'),
      timingPath: path.join(this.outputDirectory, 'timing.json'),
      handoffPath: path.join(this.outputDirectory, 'handoff.json'),
      reportPath: path.join(this.outputDirectory, 'authoring-report.md'),
    };
    for (const target of [this.paths.handoffPath, this.paths.reportPath]) {
      if (fs.existsSync(target)) {
        const error = new Error(`Authoring output already exists: ${target}`);
        error.code = 'EEXIST';
        throw error;
      }
    }
    this.recorder = RunRecorder.open({
      run: { ...this.run, measurementDomain: 'agent-authoring' },
      eventsPath: this.paths.eventsPath,
      timingPath: this.paths.timingPath,
      clock,
    });
    this.finalized = false;
  }

  stage(name, operation, metadata = {}) {
    return this.recorder.stage(name, operation, metadata);
  }

  finalize({ candidatePath, evidencePath, validationPath }) {
    if (this.finalized) throw new Error('AuthoringRun is already finalized.');
    const elapsedMs = this.clock.monotonicMs() - this.startedMonoMs;
    const handoff = buildHandoff({
      run: this.run,
      candidatePath,
      evidencePath,
      validationPath,
      createdAt: new Date(this.startedWallMs + elapsedMs).toISOString(),
    });
    const timing = this.recorder.finalize({ status: 'completed', finalReceipt: handoff });
    const report = renderAuthoringReport({
      timing,
      outputRoot: this.outputDirectory,
    });
    writeNewFile(this.paths.handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
    writeNewFile(this.paths.reportPath, report.markdown);
    this.finalized = true;
    return {
      timing,
      handoff,
      report,
      paths: { ...this.paths },
    };
  }
}

export const authoringHandoffV1 = Object.freeze({
  schemaVersion: HANDOFF_SCHEMA_VERSION,
  kind: HANDOFF_KIND,
});
