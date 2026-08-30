import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRepairPlan,
  diagnosticFingerprint,
  evaluateRepairProgress,
} from '../authoring/repair-plan.mjs';
import { QUALITY_CONTRACT } from '../authoring/quality-contract.mjs';

test('repair plan turns viewport overflow into exact semantic-preserving viewBox bounds', () => {
  const plan = createRepairPlan({
    type: 'workflow',
    stage: 'preflight',
    candidate: { meta: { viewBox: [900, 700] } },
    diagnostics: [{
      code: 'visual/overflow',
      subject: { viewport: '1440x900' },
      evidence: { overflowYBy: 320 },
      supportedFixes: ['compact the composition'],
    }],
    preflight: {
      containment: {
        viewports: [{
          width: 1440,
          height: 900,
          ok: false,
          overflowXBy: 0,
          overflowYBy: 320,
          diagramWidth: 1200,
          readerLayout: { availableSvgHeight: 700 },
        }],
      },
    },
  });

  assert.equal(plan.status, 'repair-required');
  assert.equal(plan.causes[0], 'desktop-height-budget-exceeded');
  assert.deepEqual(plan.currentViewBox, [900, 700]);
  assert.deepEqual(plan.containment.worstOverflow, { x: 0, y: 320 });
  assert.deepEqual(plan.containment.viewBoxOptions.compactHeight, [900, 514]);
  assert.deepEqual(plan.containment.viewBoxOptions.preserveHeight, [1225, 700]);
  assert.equal(plan.qualityGuards.semanticDeletionAllowed, false);
  assert.match(plan.forbiddenActions.join(' '), /delete a semantic node/);
});

test('repair plan preserves structured deterministic diagnostics without inventing an automatic edit', () => {
  const diagnostic = {
    code: 'composition/label-route-clearance',
    subject: { relationship: { from: 'a', to: 'b' } },
    evidence: { clearance: 2, threshold: 8 },
    supportedFixes: ['adjust labelAt'],
  };
  const plan = createRepairPlan({
    type: 'architecture',
    stage: 'check',
    candidate: { meta: { viewBox: [1200, 620] } },
    diagnostics: [diagnostic],
  });

  assert.deepEqual(plan.causes, ['composition/label-route-clearance']);
  assert.deepEqual(plan.actions[0].subject, diagnostic.subject);
  assert.deepEqual(plan.actions[0].evidence, diagnostic.evidence);
  assert.deepEqual(plan.actions[0].supportedFixes, ['adjust labelAt']);
  assert.equal(plan.containment, undefined);
});

test('repair plan exposes the same fail-closed guards as the authoring contract', () => {
  const plan = createRepairPlan({
    type: 'workflow',
    stage: 'render',
    candidate: { meta: { viewBox: [1000, 540] } },
  });

  assert.deepEqual(plan.qualityGuards, QUALITY_CONTRACT.guards);
  assert.equal(plan.qualityGuards.overflowHidingAllowed, false);
});

test('repair plan reports an infeasible viewBox width interval instead of recommending 992px', () => {
  const plan = createRepairPlan({
    type: 'dataflow',
    stage: 'check',
    candidate: { meta: { viewBox: [1080, 600] } },
    diagnostics: [
      {
        code: 'layout/dataflow-stage-width',
        subject: { path: '/meta/viewBox/0' },
        evidence: { minViewBoxWidth: 1068 },
        supportedFixes: ['increase the viewBox width to at least 1068px'],
      },
      {
        code: 'composition/desktop-readability',
        subject: { path: '/meta/viewBox/0' },
        evidence: { maxReadableViewBoxWidth: 992 },
        supportedFixes: ['reduce the viewBox width to at most 992px'],
      },
    ],
  });

  assert.equal(plan.status, 'constraint-conflict');
  assert.deepEqual(plan.constraints.viewBoxWidth, {
    status: 'conflict',
    minViewBoxWidth: 1068,
    maxReadableViewBoxWidth: 992,
  });
  assert.equal(plan.actions[0].code, 'layout/viewbox-width-constraint-conflict');
  assert.match(plan.actions[0].supportedFixes.join(' '), /reflow|wrap|copy/i);
  assert.doesNotMatch(JSON.stringify(plan.actions.map(({ supportedFixes }) => supportedFixes)), /at most 992/i);
});

test('bounded repair progress requests structural reflow before it can stop repeated churn', () => {
  const routeDiagnostic = {
    code: 'composition/label-route-clearance',
    subject: { relationship: { from: 'a', to: 'b' } },
    evidence: { clearance: 2, threshold: 8 },
    message: 'first wording',
  };
  assert.equal(
    diagnosticFingerprint([routeDiagnostic]),
    diagnosticFingerprint([{ ...routeDiagnostic, message: 'different wording' }]),
  );

  const progress = evaluateRepairProgress([
    { stage: 'render', diagnostics: [routeDiagnostic] },
    { stage: 'check', diagnostics: [routeDiagnostic, { code: 'composition/micro-segment', subject: { edge: 'b-c' } }] },
    { stage: 'check', diagnostics: [routeDiagnostic, { code: 'composition/micro-segment', subject: { edge: 'b-c' } }] },
    { stage: 'check', diagnostics: [routeDiagnostic, { code: 'composition/micro-segment', subject: { edge: 'b-c' } }] },
  ]);

  assert.equal(progress.best.stage, 'check');
  assert.equal(progress.consecutiveNonImprovingAttempts, 2);
  assert.equal(progress.shouldStop, false);
  assert.equal(progress.shouldReflow, true);
  assert.match(progress.reason, /structural reflow/i);
});

test('repair progress stops only after structural reflows are exhausted and the same failure repeats', () => {
  const diagnostic = {
    code: 'composition/label-route-clearance',
    subject: { relationship: { from: 'a', to: 'b' } },
    evidence: { clearance: 2, threshold: 8 },
  };
  const attempts = [
    { stage: 'check', diagnostics: [diagnostic] },
    { stage: 'check', diagnostics: [diagnostic] },
    { stage: 'check', diagnostics: [diagnostic] },
    { stage: 'check', repairMode: 'structural-reflow', diagnostics: [diagnostic] },
    { stage: 'check', diagnostics: [diagnostic] },
    { stage: 'check', diagnostics: [diagnostic] },
    { stage: 'check', repairMode: 'structural-reflow', diagnostics: [diagnostic] },
    { stage: 'check', diagnostics: [diagnostic] },
    { stage: 'check', diagnostics: [diagnostic] },
    { stage: 'check', diagnostics: [diagnostic] },
    { stage: 'check', diagnostics: [diagnostic] },
  ];
  const progress = evaluateRepairProgress(attempts);

  assert.equal(progress.structuralReflowCount, 2);
  assert.equal(progress.consecutiveIdenticalAttempts, 5);
  assert.equal(progress.shouldReflow, false);
  assert.equal(progress.shouldStop, true);
  assert.match(progress.reason, /reflow/i);
});

test('repair progress requests structural reflow after six improving but unresolved focused attempts', () => {
  const attempts = [8, 7, 6, 5, 4, 3].map((errorCount) => ({
    stage: 'check',
    errorCount,
    diagnostics: [{ code: 'composition/label-route-clearance', subject: { errorCount } }],
  }));
  const progress = evaluateRepairProgress(attempts);

  assert.equal(progress.shouldStop, false);
  assert.equal(progress.shouldReflow, true);
  assert.equal(progress.focusedAttemptCount, 6);
  assert.match(progress.reason, /structural reflow/i);
});

test('repair progress does not let an unclassified infrastructure failure hide real improvement', () => {
  const unclassified = {
    code: 'internal/unclassified',
    subject: {},
    evidence: { exitCode: 1 },
  };
  const attempts = [
    { stage: 'render', diagnostics: [unclassified] },
    ...[36, 20, 6].map((errorCount) => ({
      stage: 'render',
      errorCount,
      diagnostics: [{ code: 'composition/proper-crossing', subject: { errorCount } }],
    })),
  ];

  const progress = evaluateRepairProgress(attempts);

  assert.equal(progress.best.errorCount, 6);
  assert.equal(progress.consecutiveNonImprovingAttempts, 0);
  assert.equal(progress.shouldStop, false);
  assert.equal(progress.ignoredInfrastructureAttempts, 1);
});

test('repair plan carries structural-reflow progress without treating unresolved errors as success', () => {
  const diagnostic = {
    code: 'composition/label-route-clearance',
    subject: { relationship: { from: 'a', to: 'b' } },
  };
  const plan = createRepairPlan({
    type: 'workflow',
    stage: 'check',
    candidate: { meta: { viewBox: [1000, 540] } },
    diagnostics: [diagnostic],
    attemptHistory: [
      { stage: 'render', diagnostics: [diagnostic] },
      { stage: 'check', diagnostics: [diagnostic] },
      { stage: 'check', diagnostics: [diagnostic] },
    ],
  });

  assert.equal(plan.status, 'structural-reflow-required');
  assert.equal(plan.progress.shouldStop, false);
  assert.equal(plan.progress.shouldReflow, true);
  assert.equal(plan.diagnosticFingerprint, diagnosticFingerprint([diagnostic]));
  assert.match(plan.acceptance.join(' '), /0 errors and 0 warnings/);
});

test('repair plan does not duplicate a renderer-classified width conflict', () => {
  const plan = createRepairPlan({
    type: 'dataflow',
    stage: 'render',
    candidate: { meta: { viewBox: [1080, 600] } },
    diagnostics: [{
      code: 'layout/viewbox-width-constraint-conflict',
      subject: { path: '/meta/viewBox/0' },
      evidence: { minViewBoxWidth: 1068, maxReadableViewBoxWidth: 992 },
      supportedFixes: ['reflow /nodes/3/sublabel while preserving every source-backed fact'],
    }],
  });

  assert.equal(plan.status, 'constraint-conflict');
  assert.equal(
    plan.actions.filter(({ code }) => code === 'layout/viewbox-width-constraint-conflict').length,
    1,
  );
  assert.deepEqual(plan.actions[0].subject, { path: '/meta/viewBox/0' });
});
