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
  const constant = html.match(/var SHARE_CARD_MIN_PRIMARY_TEXT_PX = [^;]+;\s*var SHARE_CARD_MIN_CONTEXT_TEXT_PX = [^;]+;/)?.[0];
  const fn = html.match(/function planShareCardSimplification\(metrics\) \{[\s\S]*?\n      \}/)?.[0];
  assert.ok(constant && fn, 'rendered viewer must contain the share-card density planner');
  return vm.runInNewContext(`(() => { ${constant} ${fn}; return {
    SHARE_CARD_MIN_PRIMARY_TEXT_PX,
    planShareCardSimplification
  }; })()`);
}

test('dense share cards focus a guided subset and remove secondary text', () => {
  const { SHARE_CARD_MIN_PRIMARY_TEXT_PX, planShareCardSimplification } = densityRuntime();
  const plan = planShareCardSimplification({
    sourceBounds: { x: 0, y: 0, width: 1720, height: 900 },
    contentBounds: { x: 20, y: 45, width: 1340, height: 478 },
    focusBounds: { x: 20, y: 250, width: 1340, height: 74 },
    availableWidth: 1128,
    availableHeight: 482,
    primaryFontPx: 11,
    contextFontPx: 9,
    nodeCount: 10,
    focusNodeCount: 7,
  });

  assert.equal(plan.mode, 'focus');
  assert.equal(plan.hideContext, true);
  assert.equal(plan.hideFine, true);
  assert.equal(plan.hideLegend, true);
  assert.equal(plan.cropTo, 'focus');
  assert.ok(plan.projectedPrimaryFontPx >= SHARE_CARD_MIN_PRIMARY_TEXT_PX);
});

test('dense share cards without a guided subset compact the full diagram', () => {
  const { planShareCardSimplification } = densityRuntime();
  const plan = planShareCardSimplification({
    sourceBounds: { x: 0, y: 0, width: 1720, height: 900 },
    contentBounds: { x: 120, y: 120, width: 1480, height: 610 },
    availableWidth: 1128,
    availableHeight: 482,
    primaryFontPx: 11,
    contextFontPx: 9,
    nodeCount: 12,
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
    focusBounds: { x: 100, y: 150, width: 700, height: 100 },
    availableWidth: 1128,
    availableHeight: 482,
    primaryFontPx: 11,
    contextFontPx: 9,
    nodeCount: 7,
    focusNodeCount: 5,
  });

  assert.equal(plan.mode, 'full');
  assert.equal(plan.cropTo, 'source');
  assert.equal(plan.hideContext, false);
  assert.equal(plan.hideFine, false);
  assert.equal(plan.hideLegend, false);
});

test('the share-card export applies the density plan to the serialized SVG', () => {
  const output = path.join(tmp, 'integration.html');
  execFileSync(process.execPath, [
    path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'),
    path.join(skillRoot, 'examples/web-app.architecture.json'),
    output,
  ]);
  const html = fs.readFileSync(output, 'utf8');

  assert.match(html, /function planShareCardForSvg\(svg, availableWidth, availableHeight, focusIds\)/);
  assert.match(html, /function applyShareCardSimplification\(clone, plan\)/);
  assert.match(html, /serializeSvg\(sourceScale, \{[\s\S]*?shareCardPlan: densityPlan/);
  assert.match(html, /clone\.setAttribute\('data-share-card-density', plan\.mode\)/);
  assert.match(html, /data-last-share-card-density/);
});

process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
