import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRepairPlan } from './repair-plan.mjs';
import { VisualCheckSession } from '../bin/visual-check.mjs';

const TYPES = new Set(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle']);
const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/;

function failureDiagnostic(code, message, evidence = {}) {
  return { code, severity: 'error', message, subject: {}, evidence, supportedFixes: [] };
}

function rendererFailure(result) {
  try {
    const parsed = JSON.parse((result.stderr || '').trim());
    if (parsed?.ok === false && Array.isArray(parsed.diagnostics)) return parsed.diagnostics;
  } catch {
    // Fall through to one bounded process diagnostic.
  }
  return [failureDiagnostic(
    result.error ? 'internal/renderer-process' : 'internal/unclassified',
    result.error?.message || 'Renderer failed before emitting structured diagnostics.',
    { exitCode: result.status ?? 1 },
  )];
}

function checkerDiagnostics(checker) {
  const issues = (checker?.composition?.issues || []).filter((issue) => issue?.severity === 'error');
  if (issues.length) {
    return issues.map((issue) => ({
      code: issue.code || 'composition/constraint',
      severity: 'error',
      message: issue.message || `Final artifact failed ${issue.code || 'a composition constraint'}.`,
      subject: issue.subject || {},
      evidence: issue.evidence || Object.fromEntries(Object.entries(issue).filter(([key]) => !['code', 'severity', 'message', 'subject', 'supportedFixes'].includes(key))),
      supportedFixes: issue.supportedFixes || [],
    }));
  }
  return [failureDiagnostic('artifact/check-failed', 'Final artifact check failed.', {
    checks: (checker?.checks || []).filter((check) => check?.ok !== true).map((check) => check.name),
  })];
}

function ephemeralPreflight(receipt) {
  return {
    ...receipt,
    artifact: { ...receipt.artifact, ephemeral: true },
    captures: { ...receipt.captures, retained: false },
    sidecars: { ...receipt.sidecars, retained: false },
  };
}

function normalizeCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Candidate preflight requires a non-empty candidates array.');
  }
  const ids = new Set();
  return candidates.map((candidate, index) => {
    const id = candidate?.id ?? `candidate-${index + 1}`;
    if (!SAFE_ID.test(id) || ids.has(id)) throw new Error(`Candidate id must be unique and match ${SAFE_ID}: ${id}`);
    ids.add(id);
    if (!TYPES.has(candidate?.type)) throw new Error(`Unknown candidate type ${JSON.stringify(candidate?.type)}.`);
    if (typeof candidate?.input !== 'string' || !candidate.input.trim()) throw new Error(`Candidate ${id} requires input.`);
    if (candidate.repoRoot && candidate.type !== 'architecture') {
      throw new Error(`Candidate ${id}: repoRoot is supported for architecture only.`);
    }
    return {
      id,
      type: candidate.type,
      input: path.resolve(candidate.input),
      ...(candidate.repoRoot ? { repoRoot: path.resolve(candidate.repoRoot) } : {}),
    };
  });
}

function failedReceipt({ candidate, stage, diagnostics, checker, preflight, specification, specificationReceipt, timing }) {
  return {
    schemaVersion: 1,
    ok: false,
    command: 'validate',
    id: candidate.id,
    type: candidate.type,
    input: candidate.input,
    ...(specificationReceipt ? { specification: specificationReceipt } : {}),
    stage,
    diagnostics,
    repairPlan: createRepairPlan({
      type: candidate.type,
      candidate: specification,
      stage,
      diagnostics,
      preflight,
    }),
    ...(checker ? { checker } : {}),
    ...(preflight ? { preflight } : {}),
    ...(timing ? { timing } : {}),
  };
}

function elapsed(started) {
  return Number((performance.now() - started).toFixed(3));
}

function finishCandidateTiming(timing) {
  const durationMs = timing.inputMs + timing.renderMs + timing.checkMs + timing.preflightMs;
  return { ...timing, durationMs: Number(durationMs.toFixed(3)) };
}

/** Render/check several candidates, then preflight every temporary artifact in one Chrome session. */
export async function runCandidatePreflightBatch({
  candidates,
  skillRoot,
  quality = 'showcase',
  session,
} = {}) {
  const batchStartedAt = new Date().toISOString();
  const batchStarted = performance.now();
  const normalized = normalizeCandidates(candidates);
  if (!['standard', 'showcase'].includes(quality)) throw new Error('quality must be standard or showcase.');
  const root = path.resolve(skillRoot);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-candidate-preflight-'));
  const prepared = [];
  const receipts = [];
  let activeSession = session;
  const ownsSession = !session;
  try {
    for (const candidate of normalized) {
      const timing = { source: 'candidate-preflight', inputMs: 0, renderMs: 0, checkMs: 0, preflightMs: 0 };
      let specification = null;
      let specificationReceipt = null;
      const inputStarted = performance.now();
      try {
        const bytes = fs.readFileSync(candidate.input);
        specification = JSON.parse(bytes.toString('utf8'));
        specificationReceipt = {
          bytes: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        };
        timing.inputMs = elapsed(inputStarted);
      } catch (error) {
        timing.inputMs = elapsed(inputStarted);
        const diagnostics = [failureDiagnostic('input/read', `Input could not be read: ${error.message}`)];
        receipts.push(failedReceipt({
          candidate,
          stage: 'input',
          diagnostics,
          specification,
          timing: finishCandidateTiming(timing),
        }));
        continue;
      }
      const artifactPath = path.join(temporary, `${candidate.id}.html`);
      const renderer = path.join(root, 'renderers', candidate.type, `render-${candidate.type}.mjs`);
      const renderStarted = performance.now();
      const render = spawnSync(process.execPath, [renderer, candidate.input, artifactPath], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          ARCHIFY_QUALITY_PROFILE: quality,
          ARCHIFY_DIAGNOSTIC_FORMAT: 'json',
          ...(candidate.repoRoot ? { ARCHIFY_REPO_ROOT: candidate.repoRoot } : {}),
        },
      });
      timing.renderMs = elapsed(renderStarted);
      if (render.status !== 0) {
        receipts.push(failedReceipt({
          candidate,
          stage: 'render',
          diagnostics: rendererFailure(render),
          specification,
          specificationReceipt,
          timing: finishCandidateTiming(timing),
        }));
        continue;
      }
      const checkStarted = performance.now();
      const check = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-render-output.mjs'), artifactPath], {
        cwd: root,
        encoding: 'utf8',
      });
      timing.checkMs = elapsed(checkStarted);
      let checker = null;
      try {
        checker = JSON.parse(check.stdout);
      } catch {
        checker = { ok: false, checks: [], composition: null };
      }
      if (check.status !== 0 || checker?.ok !== true) {
        receipts.push(failedReceipt({
          candidate,
          stage: 'check',
          diagnostics: checkerDiagnostics(checker),
          checker,
          specification,
          specificationReceipt,
          timing: finishCandidateTiming(timing),
        }));
        continue;
      }
      prepared.push({ candidate, specification, specificationReceipt, artifactPath, checker, timing });
    }

    if (prepared.length > 0) {
      activeSession ||= new VisualCheckSession();
      for (const [index, entry] of prepared.entries()) {
        const preflightStarted = performance.now();
        const result = await activeSession.preflight({
          artifactPath: entry.artifactPath,
          finalArtifact: index === prepared.length - 1,
        });
        entry.timing.preflightMs = elapsed(preflightStarted);
        const timing = finishCandidateTiming(entry.timing);
        const preflight = ephemeralPreflight(result.receipt);
        if (result.exitCode !== 0) {
          receipts.push(failedReceipt({
            candidate: entry.candidate,
            stage: 'preflight',
            diagnostics: preflight.diagnostics || [],
            checker: entry.checker,
            preflight,
            specification: entry.specification,
            specificationReceipt: entry.specificationReceipt,
            timing,
          }));
        } else {
          receipts.push({
            schemaVersion: 1,
            ok: true,
            command: 'validate',
            id: entry.candidate.id,
            type: entry.candidate.type,
            input: entry.candidate.input,
            specification: entry.specificationReceipt,
            checks: entry.checker.checks,
            composition: entry.checker.composition,
            preflight,
            timing,
          });
        }
      }
    }

    const order = new Map(normalized.map((candidate, index) => [candidate.id, index]));
    receipts.sort((left, right) => order.get(left.id) - order.get(right.id));

    const ok = receipts.length === normalized.length && receipts.every((receipt) => receipt.ok === true);
    const skipped = receipts.some((receipt) => receipt.preflight?.status === 'skipped');
    const endedAt = new Date().toISOString();
    return {
      exitCode: ok ? 0 : skipped ? 2 : 1,
      receipt: {
        schemaVersion: 1,
        ok,
        command: 'validate-batch',
        status: ok ? 'pass' : skipped ? 'skipped' : 'fail',
        quality,
        session: {
          shared: true,
          candidates: normalized.length,
          expectedBrowserResets: Math.max(0, normalized.length - 1),
        },
        timing: {
          source: 'validate-batch',
          startedAt: batchStartedAt,
          endedAt,
          durationMs: elapsed(batchStarted),
        },
        candidates: receipts,
      },
    };
  } finally {
    if (ownsSession && activeSession) await activeSession.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
