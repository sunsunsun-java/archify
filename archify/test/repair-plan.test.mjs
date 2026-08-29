import assert from 'node:assert/strict';
import test from 'node:test';
import { createRepairPlan } from '../authoring/repair-plan.mjs';

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
