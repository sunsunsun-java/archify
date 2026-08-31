import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-share-card-density-'));

function densityRuntime() {
  const output = path.join(tmp, 'architecture.html');
  execFileSync(process.execPath, [
    path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'),
    path.join(skillRoot, 'examples/web-app.architecture.json'),
    output,
  ]);
  const html = fs.readFileSync(output, 'utf8');
  const runtime = html.match(/var SHARE_CARD_MIN_PRIMARY_TEXT_PX = [\s\S]*?(?=\n\n      function shareCardBounds)/)?.[0];
  assert.ok(runtime, 'rendered viewer must contain the share-card density planner');
  return vm.runInNewContext(`(() => { ${runtime}; return {
    SHARE_CARD_MIN_PRIMARY_TEXT_PX,
    SHARE_CARD_MIN_CONTEXT_TEXT_PX,
    planShareCardSimplification
  }; })()`);
}

test('dense share cards focus a guided subset and remove secondary text', () => {
  const {
    SHARE_CARD_MIN_PRIMARY_TEXT_PX,
    SHARE_CARD_MIN_CONTEXT_TEXT_PX,
    planShareCardSimplification,
  } = densityRuntime();
  const plan = planShareCardSimplification({
    sourceBounds: { x: 0, y: 0, width: 1720, height: 900 },
    contentBounds: { x: 20, y: 45, width: 1340, height: 478 },
    focusCandidates: [{
      source: 'authored',
      order: 0,
      nodeCount: 7,
      focusIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      focusEdgeKeys: ['a->b'],
      bounds: { x: 120, y: 250, width: 820, height: 180 },
    }],
    availableWidth: 1128,
    availableHeight: 482,
    primaryFontPx: 11,
    sourceContextFontPx: 9,
    focusContextFontPx: 9,
  });

  assert.equal(plan.mode, 'focus');
  assert.equal(plan.hideContext, true);
  assert.equal(plan.hideFine, true);
  assert.equal(plan.hideLegend, true);
  assert.equal(plan.cropTo, 'focus');
  assert.ok(plan.projectedPrimaryFontPx >= SHARE_CARD_MIN_PRIMARY_TEXT_PX);
  assert.ok(plan.projectedContextFontPx >= SHARE_CARD_MIN_CONTEXT_TEXT_PX);
  assert.deepEqual(Array.from(plan.focusIds), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(Array.from(plan.focusEdgeKeys), ['a->b']);
});

test('dense share cards without a guided subset compact the full diagram', () => {
  const { planShareCardSimplification } = densityRuntime();
  const plan = planShareCardSimplification({
    sourceBounds: { x: 0, y: 0, width: 1720, height: 900 },
    contentBounds: { x: 120, y: 120, width: 1480, height: 610 },
    availableWidth: 1128,
    availableHeight: 482,
    primaryFontPx: 11,
    sourceContextFontPx: 9,
    focusContextFontPx: 9,
    focusCandidates: [],
  });

  assert.equal(plan.mode, 'compact');
  assert.equal(plan.cropTo, 'content');
  assert.equal(plan.hideContext, true);
  assert.equal(plan.hideFine, true);
  assert.equal(plan.hideLegend, true);
});

test('readable share cards preserve the complete authored diagram', () => {
  const { planShareCardSimplification } = densityRuntime();
  const plan = planShareCardSimplification({
    sourceBounds: { x: 0, y: 0, width: 1000, height: 500 },
    contentBounds: { x: 20, y: 20, width: 960, height: 460 },
    availableWidth: 1128,
    availableHeight: 482,
    primaryFontPx: 11,
    sourceContextFontPx: 9,
    focusContextFontPx: 9,
    focusCandidates: [],
  });

  assert.equal(plan.mode, 'full');
  assert.equal(plan.cropTo, 'source');
  assert.equal(plan.hideContext, false);
  assert.equal(plan.hideFine, false);
  assert.equal(plan.hideLegend, false);
});

test('the planner evaluates every authored view before falling back to automatic focus', () => {
  const { planShareCardSimplification } = densityRuntime();
  const plan = planShareCardSimplification({
    sourceBounds: { x: 0, y: 0, width: 3000, height: 1400 },
    contentBounds: { x: 40, y: 40, width: 2800, height: 1200 },
    availableWidth: 1128,
    availableHeight: 482,
    primaryFontPx: 11,
    sourceContextFontPx: 9,
    focusContextFontPx: 9,
    focusCandidates: [
      { source: 'authored', order: 0, nodeCount: 8, focusIds: ['wide'], focusEdgeKeys: [], bounds: { x: 0, y: 0, width: 1800, height: 800 } },
      { source: 'authored', order: 1, nodeCount: 5, focusIds: ['readable'], focusEdgeKeys: ['edge'], bounds: { x: 200, y: 200, width: 650, height: 220 } },
      { source: 'auto', order: 0, nodeCount: 6, focusIds: ['auto'], focusEdgeKeys: [], bounds: { x: 100, y: 100, width: 600, height: 200 } },
    ],
  });

  assert.equal(plan.mode, 'focus');
  assert.equal(plan.focusSource, 'authored');
  assert.deepEqual(Array.from(plan.focusIds), ['readable']);
});

test('the share-card export applies the density plan to the serialized SVG', () => {
  const output = path.join(tmp, 'integration.html');
  execFileSync(process.execPath, [
    path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'),
    path.join(skillRoot, 'examples/web-app.architecture.json'),
    output,
  ]);
  const html = fs.readFileSync(output, 'utf8');

  assert.match(html, /function planShareCardForSvg\(svg, availableWidth, availableHeight, authoredCandidates\)/);
  assert.match(html, /function automaticShareCardFocusSets\(nodes, edges\)/);
  assert.match(html, /function planFullShareCardForSvg\(svg, availableWidth, availableHeight\)/);
  assert.match(html, /function applyShareCardSimplification\(clone, plan\)/);
  assert.match(html, /serializeSvg\(sourceScale, \{[\s\S]*?shareCardPlan: densityPlan/);
  assert.match(html, /clone\.setAttribute\('data-share-card-density', plan\.mode\)/);
  assert.match(html, /data-last-share-card-density/);
});

process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
