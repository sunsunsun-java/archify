import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';
import { MIN_PROJECTED_NODE_TEXT_PX } from '../renderers/shared/desktop-readability.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-viewer-chrome-layout-'));
const chromePath = process.env.ARCHIFY_CHROME ? findChrome() : null;

const CASES = {
  architecture: 'web-app.architecture.json',
  workflow: 'agent-tool-call.workflow.json',
  sequence: 'cache-miss-request.sequence.json',
  dataflow: 'product-analytics.dataflow.json',
  lifecycle: 'agent-run.lifecycle.json',
};

function render(mode, example) {
  const output = path.join(tmp, `${mode}.html`);
  execFileSync(process.execPath, [
    path.join(skillRoot, 'bin', 'archify.mjs'),
    'render',
    mode,
    path.join(skillRoot, 'examples', example),
    output,
  ]);
  return output;
}

function renderWithoutLegend() {
  const source = JSON.parse(fs.readFileSync(
    path.join(skillRoot, 'examples', CASES.architecture),
    'utf8',
  ));
  source.meta = { ...source.meta, legend: { mode: 'hidden' } };
  const input = path.join(tmp, 'architecture-no-legend.json');
  const output = path.join(tmp, 'architecture-no-legend.html');
  fs.writeFileSync(input, `${JSON.stringify(source, null, 2)}\n`);
  execFileSync(process.execPath, [
    path.join(skillRoot, 'bin', 'archify.mjs'),
    'render',
    'architecture',
    input,
    output,
  ]);
  return output;
}

function renderRelationshipExplorationStress() {
  const source = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Relationship exploration stress',
      quality_profile: 'showcase',
      viewBox: [1220, 640],
    },
    components: [
      { id: 'hub', type: 'backend', label: 'Hub', pos: [1044, 278], size: [142, 68] },
      { id: 'in-left', type: 'external', label: 'Incoming left', pos: [34, 18], size: [142, 68] },
      { id: 'in-right', type: 'external', label: 'Incoming middle', pos: [540, 92], size: [142, 68] },
      { id: 'out-left', type: 'cloud', label: 'Outgoing left', pos: [34, 554], size: [142, 68] },
      { id: 'out-right', type: 'cloud', label: 'Outgoing middle', pos: [540, 470], size: [142, 68] },
    ],
    boundaries: [],
    connections: [
      { id: 'in-left-hub', from: 'in-left', to: 'hub', label: 'left input' },
      { id: 'in-right-hub', from: 'in-right', to: 'hub', label: 'right input' },
      { id: 'hub-out-left', from: 'hub', to: 'out-left', label: 'left output' },
      { id: 'hub-out-right', from: 'hub', to: 'out-right', label: 'right output' },
    ],
    cards: [],
  };
  const input = path.join(tmp, 'relationship-exploration-stress.json');
  const output = path.join(tmp, 'relationship-exploration-stress.html');
  fs.writeFileSync(input, `${JSON.stringify(source, null, 2)}\n`);
  execFileSync(process.execPath, [
    path.join(skillRoot, 'bin', 'archify.mjs'),
    'render',
    'architecture',
    input,
    output,
  ]);
  return output;
}

function renderRelationshipHoverStabilityStress() {
  const source = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Relationship hover stability stress',
      quality_profile: 'showcase',
      viewBox: [1220, 640],
    },
    components: [
      { id: 'operator', type: 'external', label: 'Operator', pos: [34, 278], size: [126, 68] },
      { id: 'entry', type: 'frontend', label: 'Entry', pos: [208, 278], size: [152, 68] },
      { id: 'session', type: 'backend', label: 'Session', pos: [412, 278], size: [158, 68] },
      {
        id: 'agent-kernel',
        type: 'backend',
        label: 'Agent Core',
        pos: [622, 278],
        size: [158, 68],
      },
      { id: 'ai-router', type: 'backend', label: 'pi-ai runtime', pos: [832, 278], size: [164, 68] },
      { id: 'models', type: 'cloud', label: 'Models', pos: [1044, 278], size: [142, 68] },
      { id: 'resources', type: 'cloud', label: 'Resources', pos: [412, 92], size: [158, 68] },
      { id: 'extensions', type: 'messagebus', label: 'Extensions', pos: [622, 92], size: [158, 68] },
      { id: 'store', type: 'database', label: 'Store', pos: [412, 470], size: [158, 68] },
      { id: 'tools', type: 'security', label: 'Tools', pos: [622, 470], size: [158, 68] },
    ],
    boundaries: [{
      kind: 'region',
      label: 'Local runtime',
      wraps: ['entry', 'session', 'agent-kernel', 'ai-router', 'resources', 'extensions', 'store', 'tools'],
      pad: 24,
    }],
    connections: [
      { id: 'request', from: 'operator', to: 'entry', variant: 'emphasis' },
      { id: 'entry-session', from: 'entry', to: 'session' },
      { id: 'session-agent', from: 'session', to: 'agent-kernel', variant: 'emphasis', route: 'straight' },
      { id: 'agent-ai', from: 'agent-kernel', to: 'ai-router', label: 'stream', labelAt: [806, 260], variant: 'emphasis' },
      { id: 'ai-models', from: 'ai-router', to: 'models', variant: 'emphasis' },
      { id: 'resources-session', from: 'resources', to: 'session' },
      { id: 'extensions-session', from: 'extensions', to: 'session', variant: 'dashed' },
      { id: 'session-store', from: 'session', to: 'store' },
      { id: 'agent-tools', from: 'agent-kernel', to: 'tools', variant: 'security' },
    ],
    cards: [],
  };
  const input = path.join(tmp, 'relationship-hover-stability-stress.json');
  const output = path.join(tmp, 'relationship-hover-stability-stress.html');
  fs.writeFileSync(input, `${JSON.stringify(source, null, 2)}\n`);
  execFileSync(process.execPath, [
    path.join(skillRoot, 'bin', 'archify.mjs'),
    'render',
    'architecture',
    input,
    output,
  ]);
  return output;
}

function renderRelationshipOverflowStress() {
  const repeatedConnections = (direction, count) => Array.from({ length: count }, (_, index) => ({
    id: `${direction}-${index + 1}`,
    from: direction === 'incoming' ? 'incoming' : 'hub',
    to: direction === 'incoming' ? 'hub' : 'outgoing',
    label: `${direction} relationship ${index + 1}`,
  }));
  const source = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Relationship overflow stress',
      quality_profile: 'standard',
      viewBox: [960, 520],
    },
    components: [
      { id: 'incoming', type: 'external', label: 'Incoming', pos: [30, 226], size: [150, 68] },
      { id: 'hub', type: 'backend', label: 'High-degree hub', pos: [405, 226], size: [150, 68] },
      { id: 'outgoing', type: 'cloud', label: 'Outgoing', pos: [780, 226], size: [150, 68] },
    ],
    boundaries: [],
    connections: [
      ...repeatedConnections('incoming', 12),
      ...repeatedConnections('outgoing', 12),
    ],
    cards: [],
  };
  const input = path.join(tmp, 'relationship-overflow-stress.json');
  const output = path.join(tmp, 'relationship-overflow-stress.html');
  fs.writeFileSync(input, `${JSON.stringify(source, null, 2)}\n`);
  execFileSync(process.execPath, [
    path.join(skillRoot, 'bin', 'archify.mjs'),
    'render',
    'architecture',
    input,
    output,
  ]);
  return output;
}

function renderLargeReachabilityStress() {
  const count = 30;
  const source = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Many reach nodes',
      quality_profile: 'standard',
      viewBox: [960, 3600],
    },
    components: Array.from({ length: count }, (_, index) => ({
      id: `n${index}`,
      type: index === 0 ? 'backend' : 'cloud',
      label: `Node ${index}`,
      pos: [405, 30 + index * 120],
      size: [150, 68],
    })),
    boundaries: [],
    connections: Array.from({ length: count - 1 }, (_, index) => ({
      id: `e${index}`,
      from: `n${index}`,
      to: `n${index + 1}`,
      label: `step ${index}`,
      labelDy: 24,
    })),
    cards: [],
  };
  const input = path.join(tmp, 'large-reachability-stress.json');
  const output = path.join(tmp, 'large-reachability-stress.html');
  fs.writeFileSync(input, `${JSON.stringify(source, null, 2)}\n`);
  execFileSync(process.execPath, [
    path.join(skillRoot, 'bin', 'archify.mjs'),
    'render',
    'architecture',
    input,
    output,
  ]);
  return output;
}

function canonicalSvg(html) {
  return html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0] || '';
}

async function evaluate(browser, sessionId, expression, awaitPromise = false) {
  const response = await browser.cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  }, sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || 'Runtime.evaluate failed');
  }
  return response.result?.value;
}

async function waitForLayout(browser, sessionId) {
  return evaluate(browser, sessionId, `(function () {
    var fontsReady = document.fonts && document.fonts.ready
      ? document.fonts.ready.catch(function () {})
      : Promise.resolve();
    return fontsReady.then(function () {
      return new Promise(function (resolve, reject) {
        var previous = '';
        var stableFrames = 0;
        var sampledFrames = 0;
        function rect(element) {
          if (!element) return 'missing';
          var value = element.getBoundingClientRect();
          return [value.left, value.top, value.right, value.bottom].map(function (entry) {
            return Math.round(entry * 100) / 100;
          }).join(',');
        }
        function sample() {
          sampledFrames += 1;
          var container = document.querySelector('.diagram-container');
          var current = [
            rect(container),
            rect(container && container.querySelector(':scope > svg')),
            rect(document.querySelector('.diagram-nav')),
            rect(document.querySelector('[data-legend]')),
            rect(document.getElementById('semantic-lens')),
            rect(document.getElementById('overview-map')),
            rect(document.getElementById('focus-chip')),
            container ? container.getAttribute('data-camera-transaction') || 'settled' : '',
            container ? getComputedStyle(container).getPropertyValue('--archify-nav-reserve') : ''
          ].join('|');
          if (current === previous) stableFrames += 1;
          else {
            previous = current;
            stableFrames = 0;
          }
          /* Final-artifact tests cannot inspect private scheduler flags. Eight
             equal frames cover the public three-frame contract plus any
             reader/viewer handoff queued after a ResizeObserver callback. */
          if (stableFrames >= 8) {
            resolve({ stable: true, snapshot: current, sampledFrames: sampledFrames });
            return;
          }
          if (sampledFrames >= 240) {
            reject(new Error('Final Viewer geometry did not stabilize.'));
            return;
          }
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
    });
  })()`, true);
}

async function finalGeometry(browser, sessionId) {
  return evaluate(browser, sessionId, `(function () {
    function area(a, b) {
      if (!a || !b || !a.width || !a.height || !b.width || !b.height) return 0;
      return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    }
    var container = document.querySelector('.diagram-container');
    var legend = document.querySelector('[data-legend]');
    var nav = document.querySelector('.diagram-nav');
    var svg = container && container.querySelector(':scope > svg');
    var lens = document.getElementById('semantic-lens');
    var radar = document.getElementById('overview-map');
    var passport = document.getElementById('focus-chip');
    var chromeReceipt = window.Archify && Archify.viewerChromeLayout
      && typeof Archify.viewerChromeLayout.receipt === 'function'
      ? Archify.viewerChromeLayout.receipt()
      : null;
    var viewBox = svg && svg.viewBox && svg.viewBox.baseVal;
    var projectedScale = svg && viewBox && viewBox.width > 0
      ? Math.min(1, svg.getBoundingClientRect().width / viewBox.width)
      : 0;
    var minimumProjectedNodeTextPx = null;
    if (svg && projectedScale > 0) {
      Array.from(svg.querySelectorAll('text[data-node-label], text[data-boundary-label], text[data-detail="context"]')).forEach(function (text) {
        if (text.hasAttribute('data-detail') && !text.closest('[data-node-id]')) return;
        var sourceFontPx = parseFloat(text.getAttribute('font-size') || '');
        if (!Number.isFinite(sourceFontPx)) return;
        var projectedFontPx = sourceFontPx * projectedScale;
        if (minimumProjectedNodeTextPx == null || projectedFontPx < minimumProjectedNodeTextPx) {
          minimumProjectedNodeTextPx = projectedFontPx;
        }
      });
    }
    var legendRect = legend && getComputedStyle(legend).display !== 'none' ? legend.getBoundingClientRect() : null;
    var navRect = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect() : null;
    var stageRect = window.Archify && Archify.viewerChromeLayout
      && typeof Archify.viewerChromeLayout.stageRect === 'function'
      ? Archify.viewerChromeLayout.stageRect()
      : null;
    var lensRect = lens && !lens.hidden && getComputedStyle(lens).display !== 'none' ? lens.getBoundingClientRect() : null;
    var radarRect = radar && !radar.hidden && getComputedStyle(radar).display !== 'none' ? radar.getBoundingClientRect() : null;
    var passportRect = passport && !passport.hidden && getComputedStyle(passport).display !== 'none' ? passport.getBoundingClientRect() : null;
    var stageDockIntersectionArea = area(stageRect, navRect);
    var semanticDockIntersectionArea = stageDockIntersectionArea > 0 && navRect && svg
      ? Array.from(svg.querySelectorAll('[data-node-id]')).reduce(function (maximum, node) {
          return Math.max(maximum, area(node.getBoundingClientRect(), navRect));
        }, 0)
      : 0;
    return {
      reserve: parseFloat(getComputedStyle(container).getPropertyValue('--archify-nav-reserve')) || 0,
      receiptReserve: chromeReceipt ? chromeReceipt.reserve : null,
      receiptEligible: chromeReceipt ? chromeReceipt.eligible : null,
      receiptStageIntersectionArea: chromeReceipt ? chromeReceipt.stageIntersectionArea : null,
      minimumProjectedNodeTextPx: minimumProjectedNodeTextPx,
      stageGap: navRect && stageRect ? navRect.top - stageRect.bottom : null,
      dockStageIntersectionArea: stageDockIntersectionArea,
      legendDockIntersectionArea: stageDockIntersectionArea > 0 ? area(legendRect, navRect) : 0,
      semanticDockIntersectionArea: semanticDockIntersectionArea,
      legendLensIntersectionArea: area(legendRect, lensRect),
      navLensIntersectionArea: area(navRect, lensRect),
      legendRadarIntersectionArea: area(legendRect, radarRect),
      navRadarIntersectionArea: area(navRect, radarRect),
      legendPassportIntersectionArea: area(legendRect, passportRect),
      navPassportIntersectionArea: area(navRect, passportRect),
      radarPassportIntersectionArea: area(radarRect, passportRect),
      legendRect: legendRect ? { left: legendRect.left, right: legendRect.right, top: legendRect.top, bottom: legendRect.bottom } : null,
      navRect: navRect ? { left: navRect.left, right: navRect.right, top: navRect.top, bottom: navRect.bottom } : null,
      passportRect: passportRect ? { left: passportRect.left, right: passportRect.right, top: passportRect.top, bottom: passportRect.bottom } : null,
      radarRect: radarRect ? { left: radarRect.left, right: radarRect.right, top: radarRect.top, bottom: radarRect.bottom } : null,
      hasLegend: Boolean(legendRect && legendRect.width && legendRect.height),
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      containerBottom: container ? container.getBoundingClientRect().bottom : null,
      containerHeight: container ? container.clientHeight : null,
      receiptGap: chromeReceipt ? chromeReceipt.gap : null,
      navBottom: navRect ? navRect.bottom : null
    };
  })()`);
}

async function edgePaintHitsUnderDock(browser, sessionId, selector) {
  return evaluate(browser, sessionId, `(function () {
    var edge = document.querySelector(${JSON.stringify(selector)});
    var nav = document.querySelector('.diagram-nav');
    if (!edge || !nav || typeof edge.getTotalLength !== 'function') return null;
    var navRect = nav.getBoundingClientRect();
    var matrix = edge.getScreenCTM();
    var length = edge.getTotalLength();
    var hits = [];
    for (var offset = 0; offset <= length; offset += 0.25) {
      var point = edge.getPointAtLength(offset).matrixTransform(matrix);
      if (point.x < navRect.left || point.x > navRect.right || point.y < navRect.top || point.y > navRect.bottom) continue;
      if (document.elementsFromPoint(point.x, point.y).includes(edge)) {
        hits.push({ x: point.x, y: point.y });
        if (hits.length >= 5) break;
      }
    }
    return hits;
  })()`);
}

async function highlightedGeometry(browser, sessionId, selector) {
  return evaluate(browser, sessionId, `(function () {
    var passport = document.getElementById('focus-chip');
    var passportRect = passport.getBoundingClientRect();
    var containerRect = document.querySelector('.diagram-container').getBoundingClientRect();
    var visible = {
      left: Math.max(0, containerRect.left),
      top: Math.max(0, containerRect.top),
      right: Math.min(window.innerWidth, containerRect.right),
      bottom: Math.min(window.innerHeight, containerRect.bottom)
    };
    var matches = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    function area(first, second) {
      return Math.max(0, Math.min(first.right + 12, second.right) - Math.max(first.left - 12, second.left)) *
        Math.max(0, Math.min(first.bottom + 12, second.bottom) - Math.max(first.top - 12, second.top));
    }
    return {
      compact: passport.getAttribute('data-exploration-compact'),
      expanded: passport.getAttribute('data-exploration-expanded'),
      camera: Archify.view.state(),
      passport: {
        left: passportRect.left, top: passportRect.top,
        right: passportRect.right, bottom: passportRect.bottom
      },
      ids: matches.map(function (node) { return node.getAttribute('data-node-id'); }).sort(),
      overlaps: matches.map(function (node) { return area(passportRect, node.getBoundingClientRect()); }),
      nodeRects: matches.map(function (node) {
        var rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute('data-node-id'),
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom
        };
      }),
      fullyVisible: matches.map(function (node) {
        var rect = node.getBoundingClientRect();
        return rect.left >= visible.left - 0.5 && rect.top >= visible.top - 0.5 &&
          rect.right <= visible.right + 0.5 && rect.bottom <= visible.bottom + 0.5;
      })
    };
  })()`);
}

async function focusSelector(browser, sessionId, selector) {
  const document = await browser.cdp.send('DOM.getDocument', { depth: 1 }, sessionId);
  const match = await browser.cdp.send('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector,
  }, sessionId);
  assert.ok(match.nodeId, `Expected focus target: ${selector}`);
  await browser.cdp.send('DOM.focus', { nodeId: match.nodeId }, sessionId);
}

async function load(browser, artifactPath, { width = 1440, height = 900, query = '' } = {}) {
  const sessionId = await browser.sessionPromise;
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);
  const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId);
  const navigation = await browser.cdp.send('Page.navigate', {
    url: pathToFileURL(artifactPath).href + query,
  }, sessionId);
  if (navigation.errorText) throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
  await loaded;
  await evaluate(browser, sessionId, `document.documentElement.setAttribute('data-motion', 'still')`);
  await waitForLayout(browser, sessionId);
  return sessionId;
}

test('the public CLI gives all typed renderers one final Viewer contract', () => {
  const directChildSvg = /<div class="diagram-container"[^>]*>\s*<svg\b/;
  assert.doesNotMatch(
    '<div class="diagram-container"><section></section><svg>',
    directChildSvg,
    'the direct-child assertion must not cross an intervening wrapper',
  );
  for (const [mode, example] of Object.entries(CASES)) {
    const output = render(mode, example);
    const html = fs.readFileSync(output, 'utf8');
    assert.match(html, /class="[^"]*\bdiagram-nav\b[^"]*"/, mode);
    assert.match(html, /data-legend/, mode);
    assert.match(html, directChildSvg, `${mode} keeps the SVG as a direct child`);
    assert.doesNotMatch(html, /class="diagram-stage"/, `${mode} does not re-nest the exported SVG`);
    assert.doesNotMatch(canonicalSvg(html), /nav-safe-rail|archify-nav-reserve|viewerChromeLayout/, mode);
    execFileSync(process.execPath, [path.join(skillRoot, 'bin', 'archify.mjs'), 'check', output]);
  }
});

test('Viewer chrome remains outside the canonical SVG export boundary', () => {
  const html = fs.readFileSync(render('architecture', CASES.architecture), 'utf8');
  const svg = canonicalSvg(html);
  assert.match(svg, /data-legend/);
  assert.doesNotMatch(svg, /diagram-nav|data-nav-stage-rail|viewerChromeLayout/);
});

test('high-degree relationship list stays inside the visible Passport', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const artifact = renderRelationshipOverflowStress();
    const sessionId = await load(browser, artifact, {
      width: 721,
      height: 300,
    });
    await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      window.scrollTo(0, Math.max(0, container.offsetTop));
      Archify.focus.set('hub', { toggle: false, updateUrl: false });
    })()`);
    await waitForLayout(browser, sessionId);

    const initial = await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var chip = document.getElementById('focus-chip');
      var body = chip.querySelector('.relationship-lens-body');
      var header = chip.querySelector('.relationship-lens-head');
      var containerRect = container.getBoundingClientRect();
      var chipRect = chip.getBoundingClientRect();
      return {
        visibleTop: Math.max(0, containerRect.top),
        visibleBottom: Math.min(window.innerHeight, containerRect.bottom),
        chip: { top: chipRect.top, bottom: chipRect.bottom },
        chipScrollHeight: chip.scrollHeight,
        chipClientHeight: chip.clientHeight,
        bodyExists: !!body,
        bodyOverflowY: body ? getComputedStyle(body).overflowY : '',
        bodyScrollHeight: body ? body.scrollHeight : 0,
        bodyClientHeight: body ? body.clientHeight : 0,
        scrollingDescendants: Array.from(chip.querySelectorAll('*')).filter(function (element) {
          var style = getComputedStyle(element);
          return (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            element.scrollHeight > element.clientHeight + 1;
        }).map(function (element) { return element.id || element.className; }),
        headerTop: header.getBoundingClientRect().top,
        outgoingRows: chip.querySelectorAll('.relationship-lens-row[data-direction="out"]').length,
        incomingRows: chip.querySelectorAll('.relationship-lens-row[data-direction="in"]').length,
        groups: Array.from(chip.querySelectorAll('[data-relationship-group-toggle]')).map(function (toggle) {
          return {
            direction: toggle.getAttribute('data-relationship-group-toggle'),
            expanded: toggle.getAttribute('aria-expanded'),
            hidden: document.getElementById(toggle.getAttribute('aria-controls')).hidden
          };
        }),
        scrollMore: chip.getAttribute('data-relationship-scroll-more')
      };
    })()`);
    const initialMessage = JSON.stringify(initial);
    assert.equal(initial.outgoingRows, 12, initialMessage);
    assert.equal(initial.incomingRows, 12, initialMessage);
    assert.equal(initial.bodyExists, true, initialMessage);
    assert.ok(['auto', 'scroll'].includes(initial.bodyOverflowY), initialMessage);
    assert.ok(initial.bodyScrollHeight > initial.bodyClientHeight, initialMessage);
    assert.deepEqual(initial.scrollingDescendants, ['relationship-lens-body'], initialMessage);
    assert.ok(initial.chip.top >= initial.visibleTop - 0.5, initialMessage);
    assert.ok(initial.chip.bottom <= initial.visibleBottom + 0.5, initialMessage);
    assert.ok(initial.chipScrollHeight <= initial.chipClientHeight + 1, initialMessage);
    assert.equal(initial.scrollMore, 'true', initialMessage);
    assert.deepEqual(initial.groups.slice(0, 2), [
      { direction: 'out', expanded: 'true', hidden: false },
      { direction: 'in', expanded: 'false', hidden: true },
    ], initialMessage);

    const focusClearance = await evaluate(browser, sessionId, `(function () {
      var chip = document.getElementById('focus-chip');
      var body = document.getElementById('relationship-lens-body');
      var rows = Array.from(chip.querySelectorAll('.relationship-lens-row[data-direction="out"]'));
      body.scrollTop = 0;
      rows[5].focus();
      rows[5].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var bodyRect = body.getBoundingClientRect();
            var rowRect = rows[5].getBoundingClientRect();
            var fadeHeight = parseFloat(getComputedStyle(chip, '::after').height) || 0;
            resolve({
              scrollMore: chip.getAttribute('data-relationship-scroll-more'),
              rowBottom: rowRect.bottom,
              safeBottom: bodyRect.bottom - fadeHeight,
              focused: document.activeElement === rows[5]
            });
          });
        });
      });
    })()`, true);
    const focusClearanceMessage = JSON.stringify(focusClearance);
    assert.equal(focusClearance.scrollMore, 'true', focusClearanceMessage);
    assert.equal(focusClearance.focused, true, focusClearanceMessage);
    assert.ok(focusClearance.rowBottom <= focusClearance.safeBottom + 1, focusClearanceMessage);

    await evaluate(browser, sessionId, `(function () {
      var toggle = document.querySelector('[data-relationship-group-toggle="in"]');
      toggle.focus();
      toggle.click();
    })()`);
    await waitForLayout(browser, sessionId);
    const accordion = await evaluate(browser, sessionId, `(function () {
      var active = document.activeElement;
      return {
        activeDirection: active && active.getAttribute('data-relationship-group-toggle'),
        groups: Array.from(document.querySelectorAll('[data-relationship-group-toggle]')).slice(0, 2).map(function (toggle) {
          return {
            direction: toggle.getAttribute('data-relationship-group-toggle'),
            expanded: toggle.getAttribute('aria-expanded'),
            hidden: document.getElementById(toggle.getAttribute('aria-controls')).hidden
          };
        })
      };
    })()`);
    assert.deepEqual(accordion.groups, [
      { direction: 'out', expanded: 'false', hidden: true },
      { direction: 'in', expanded: 'true', hidden: false },
    ], JSON.stringify(accordion));
    assert.equal(accordion.activeDirection, 'in', JSON.stringify(accordion));

    const scrolled = await evaluate(browser, sessionId, `(function () {
      var chip = document.getElementById('focus-chip');
      var body = chip.querySelector('.relationship-lens-body');
      var header = chip.querySelector('.relationship-lens-head');
      body.scrollTop = body.scrollHeight;
      body.dispatchEvent(new Event('scroll'));
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var bodyRect = body.getBoundingClientRect();
            var visibleRows = Array.from(chip.querySelectorAll('.relationship-lens-row')).filter(function (row) {
              return row.offsetParent !== null;
            });
            var lastRow = visibleRows[visibleRows.length - 1];
            lastRow.focus();
            lastRow.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            var lastRect = lastRow.getBoundingClientRect();
            resolve({
              headerTop: header.getBoundingClientRect().top,
              bodyTop: bodyRect.top,
              bodyBottom: bodyRect.bottom,
              lastTop: lastRect.top,
              lastBottom: lastRect.bottom,
              lastHeight: lastRect.height,
              lastFocused: document.activeElement === lastRow,
              previewKey: document.querySelector('svg').getAttribute('data-relationship-preview-active'),
              rowKey: lastRow.getAttribute('data-relationship-key'),
              scrollMore: chip.getAttribute('data-relationship-scroll-more')
            });
          });
        });
      });
    })()`, true);
    const scrolledMessage = JSON.stringify({ initial, scrolled });
    assert.ok(Math.abs(scrolled.headerTop - initial.headerTop) <= 0.5, scrolledMessage);
    assert.ok(scrolled.lastTop >= scrolled.bodyTop - 0.5, scrolledMessage);
    assert.ok(scrolled.lastBottom <= scrolled.bodyBottom + 0.5, scrolledMessage);
    assert.ok(scrolled.lastHeight > 0, scrolledMessage);
    assert.equal(scrolled.lastFocused, true, scrolledMessage);
    assert.equal(scrolled.previewKey, scrolled.rowKey, scrolledMessage);
    assert.equal(scrolled.scrollMore, null, scrolledMessage);

    await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      window.scrollTo(0, Math.max(0, container.offsetTop + 80));
      window.dispatchEvent(new Event('scroll'));
    })()`);
    await waitForLayout(browser, sessionId);
    const clippedContainer = await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var chip = document.getElementById('focus-chip');
      var containerRect = container.getBoundingClientRect();
      var chipRect = chip.getBoundingClientRect();
      return {
        containerTop: containerRect.top,
        visibleTop: Math.max(0, containerRect.top),
        visibleBottom: Math.min(window.innerHeight, containerRect.bottom),
        chipTop: chipRect.top,
        chipBottom: chipRect.bottom
      };
    })()`);
    const clippedMessage = JSON.stringify(clippedContainer);
    assert.ok(clippedContainer.containerTop < 0, clippedMessage);
    assert.ok(clippedContainer.chipTop >= clippedContainer.visibleTop - 0.5, clippedMessage);
    assert.ok(clippedContainer.chipBottom <= clippedContainer.visibleBottom + 0.5, clippedMessage);

    const mobileSessionId = await load(browser, artifact, { width: 390, height: 500 });
    await evaluate(browser, mobileSessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      window.scrollTo(0, Math.max(0, container.offsetTop));
      Archify.focus.set('hub', { toggle: false, updateUrl: false });
      document.getElementById('btn-focus-relations').click();
    })()`);
    await waitForLayout(browser, mobileSessionId);
    const mobile = await evaluate(browser, mobileSessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var chip = document.getElementById('focus-chip');
      var body = document.getElementById('relationship-lens-body');
      var containerRect = container.getBoundingClientRect();
      var chipRect = chip.getBoundingClientRect();
      return {
        visibleTop: Math.max(0, containerRect.top),
        visibleBottom: Math.min(window.innerHeight, containerRect.bottom),
        chipTop: chipRect.top,
        chipBottom: chipRect.bottom,
        bodyOverflowY: getComputedStyle(body).overflowY,
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
        scrollingDescendants: Array.from(chip.querySelectorAll('*')).filter(function (element) {
          var style = getComputedStyle(element);
          return (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            element.scrollHeight > element.clientHeight + 1;
        }).map(function (element) { return element.id || element.className; }),
        headerTop: chip.querySelector('.relationship-lens-head').getBoundingClientRect().top,
        outgoingRows: chip.querySelectorAll('.relationship-lens-row[data-direction="out"]').length,
        incomingRows: chip.querySelectorAll('.relationship-lens-row[data-direction="in"]').length,
        groups: Array.from(chip.querySelectorAll('[data-relationship-group-toggle]')).slice(0, 2).map(function (toggle) {
          return {
            direction: toggle.getAttribute('data-relationship-group-toggle'),
            expanded: toggle.getAttribute('aria-expanded'),
            hidden: document.getElementById(toggle.getAttribute('aria-controls')).hidden
          };
        }),
        scrollMore: chip.getAttribute('data-relationship-scroll-more')
      };
    })()`);
    const mobileMessage = JSON.stringify(mobile);
    assert.equal(mobile.outgoingRows, 12, mobileMessage);
    assert.equal(mobile.incomingRows, 12, mobileMessage);
    assert.ok(['auto', 'scroll'].includes(mobile.bodyOverflowY), mobileMessage);
    assert.ok(mobile.bodyScrollHeight > mobile.bodyClientHeight, mobileMessage);
    assert.deepEqual(mobile.scrollingDescendants, ['relationship-lens-body'], mobileMessage);
    assert.ok(mobile.chipTop >= mobile.visibleTop - 0.5, mobileMessage);
    assert.ok(mobile.chipBottom <= mobile.visibleBottom + 0.5, mobileMessage);
    assert.equal(mobile.scrollMore, 'true', mobileMessage);
    assert.deepEqual(mobile.groups, [
      { direction: 'out', expanded: 'true', hidden: false },
      { direction: 'in', expanded: 'false', hidden: true },
    ], mobileMessage);

    const mobileScrolled = await evaluate(browser, mobileSessionId, `(function () {
      var chip = document.getElementById('focus-chip');
      var body = document.getElementById('relationship-lens-body');
      document.querySelector('[data-relationship-group-toggle="in"]').click();
      body.scrollTop = body.scrollHeight;
      body.dispatchEvent(new Event('scroll'));
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var header = chip.querySelector('.relationship-lens-head');
            var bodyRect = body.getBoundingClientRect();
            var rows = Array.from(chip.querySelectorAll('.relationship-lens-row')).filter(function (row) {
              return row.offsetParent !== null;
            });
            var lastRow = rows[rows.length - 1];
            lastRow.focus();
            var lastRect = lastRow.getBoundingClientRect();
            resolve({
              headerTop: header.getBoundingClientRect().top,
              bodyTop: bodyRect.top,
              bodyBottom: bodyRect.bottom,
              lastTop: lastRect.top,
              lastBottom: lastRect.bottom,
              lastHeight: lastRect.height,
              lastFocused: document.activeElement === lastRow,
              scrollMore: chip.getAttribute('data-relationship-scroll-more'),
              groups: Array.from(chip.querySelectorAll('[data-relationship-group-toggle]')).slice(0, 2).map(function (toggle) {
                return {
                  direction: toggle.getAttribute('data-relationship-group-toggle'),
                  expanded: toggle.getAttribute('aria-expanded'),
                  hidden: document.getElementById(toggle.getAttribute('aria-controls')).hidden
                };
              })
            });
          });
        });
      });
    })()`, true);
    const mobileScrolledMessage = JSON.stringify({ mobile, mobileScrolled });
    assert.ok(Math.abs(mobileScrolled.headerTop - mobile.headerTop) <= 0.5, mobileScrolledMessage);
    assert.ok(mobileScrolled.lastTop >= mobileScrolled.bodyTop - 0.5, mobileScrolledMessage);
    assert.ok(mobileScrolled.lastBottom <= mobileScrolled.bodyBottom + 0.5, mobileScrolledMessage);
    assert.ok(mobileScrolled.lastHeight > 0, mobileScrolledMessage);
    assert.equal(mobileScrolled.lastFocused, true, mobileScrolledMessage);
    assert.equal(mobileScrolled.scrollMore, null, mobileScrolledMessage);
    assert.deepEqual(mobileScrolled.groups, [
      { direction: 'out', expanded: 'false', hidden: true },
      { direction: 'in', expanded: 'true', hidden: false },
    ], mobileScrolledMessage);
  } finally {
    await browser.close();
  }
});

test('large reachability exploration fits every highlighted node outside the Passport', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const artifact = renderLargeReachabilityStress();
    for (const viewport of [
      { width: 721, height: 500, label: 'narrow desktop' },
      { width: 390, height: 500, label: 'mobile compact' },
    ]) {
      const sessionId = await load(browser, artifact, viewport);
      await evaluate(browser, sessionId, `(function () {
        var container = document.querySelector('.diagram-container');
        window.scrollTo(0, Math.max(0, container.offsetTop));
        Archify.focus.set('n0', { toggle: false, updateUrl: false });
        document.getElementById('btn-reach-downstream').click();
      })()`);
      await waitForLayout(browser, sessionId);
      const receipt = await highlightedGeometry(browser, sessionId, '[data-node-id][data-reach-match]');
      const message = `${viewport.label}: ${JSON.stringify(receipt)}`;
      assert.equal(receipt.ids.length, 30, message);
      assert.ok(receipt.overlaps.every((area) => area === 0), message);
      assert.ok(receipt.fullyVisible.every(Boolean), message);
      assert.equal(receipt.camera.mode, 'semantic', message);
    }

    const expandedSessionId = await load(browser, artifact, { width: 390, height: 500 });
    await evaluate(browser, expandedSessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      window.scrollTo(0, Math.max(0, container.offsetTop));
      Archify.focus.set('n0', { toggle: false, updateUrl: false });
      document.getElementById('btn-reach-downstream').click();
      document.getElementById('btn-focus-details').click();
    })()`);
    await waitForLayout(browser, expandedSessionId);
    const expanded = await highlightedGeometry(browser, expandedSessionId, '[data-node-id][data-reach-match]');
    const expandedMessage = JSON.stringify(expanded);
    assert.equal(expanded.expanded, 'true', expandedMessage);
    assert.equal(expanded.ids.length, 30, expandedMessage);
    assert.ok(expanded.overlaps.every((area) => area === 0), expandedMessage);
    assert.ok(expanded.fullyVisible.every(Boolean), expandedMessage);

    for (const viewport of [
      { width: 721, height: 500, label: 'partially visible narrow desktop' },
      { width: 390, height: 500, label: 'partially visible mobile' },
    ]) {
      const sessionId = await load(browser, artifact, viewport);
      const before = await evaluate(browser, sessionId, `(function () {
        var spacer = document.createElement('div');
        spacer.style.height = '1000px';
        document.body.appendChild(spacer);
        var container = document.querySelector('.diagram-container');
        window.scrollTo(0, container.offsetTop + container.offsetHeight - 200);
        Archify.focus.set('n0', { toggle: false, updateUrl: false });
        document.getElementById('btn-reach-downstream').click();
        return { scrollY: window.scrollY, containerTop: container.getBoundingClientRect().top };
      })()`);
      await waitForLayout(browser, sessionId);
      const receipt = await highlightedGeometry(browser, sessionId, '[data-node-id][data-reach-match]');
      const after = await evaluate(browser, sessionId, `(function () {
        var container = document.querySelector('.diagram-container');
        return { scrollY: window.scrollY, containerTop: container.getBoundingClientRect().top };
      })()`);
      const message = `${viewport.label}: ${JSON.stringify({ before, after, receipt })}`;
      assert.ok(before.containerTop < 0, message);
      assert.ok(Math.abs(after.containerTop) <= 1, message);
      assert.equal(receipt.ids.length, 30, message);
      assert.ok(receipt.overlaps.every((area) => area === 0), message);
      assert.ok(receipt.fullyVisible.every(Boolean), message);
    }
  } finally {
    await browser.close();
  }
});

test('extremely short viewports collapse the Passport before its fixed header is clipped', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const artifact = renderRelationshipOverflowStress();
    for (const height of [120, 160]) {
      const sessionId = await load(browser, artifact, { width: 390, height });
      await evaluate(browser, sessionId, `(function () {
        var container = document.querySelector('.diagram-container');
        window.scrollTo(0, Math.max(0, container.offsetTop));
        Archify.focus.set('hub', { toggle: false, updateUrl: false });
        document.getElementById('btn-focus-relations').click();
      })()`);
      await waitForLayout(browser, sessionId);
      const receipt = await evaluate(browser, sessionId, `(function () {
        var chip = document.getElementById('focus-chip');
        var head = chip.querySelector('.relationship-lens-head');
        var body = document.getElementById('relationship-lens-body');
        var chipRect = chip.getBoundingClientRect();
        var headRect = head.getBoundingClientRect();
        return {
          viewportCompact: chip.getAttribute('data-viewport-compact'),
          chipTop: chipRect.top,
          chipBottom: chipRect.bottom,
          headTop: headRect.top,
          headBottom: headRect.bottom,
          bodyDisplay: getComputedStyle(body).display
        };
      })()`);
      const message = `${height}px: ${JSON.stringify(receipt)}`;
      assert.equal(receipt.viewportCompact, 'true', message);
      assert.ok(receipt.headTop >= receipt.chipTop - 0.5, message);
      assert.ok(receipt.headBottom <= receipt.chipBottom + 0.5, message);
      assert.equal(receipt.bodyDisplay, 'none', message);
    }

    const resizeSessionId = await load(browser, artifact, { width: 390, height: 300 });
    await evaluate(browser, resizeSessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      window.scrollTo(0, Math.max(0, container.offsetTop));
      Archify.focus.set('hub', { toggle: false, updateUrl: false });
      document.getElementById('btn-focus-relations').click();
      document.querySelector('.relationship-lens-row[data-direction="out"]').focus();
    })()`);
    await browser.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 120,
      deviceScaleFactor: 1,
      mobile: false,
    }, resizeSessionId);
    await evaluate(browser, resizeSessionId, `window.dispatchEvent(new Event('resize'))`);
    await waitForLayout(browser, resizeSessionId);
    const resized = await evaluate(browser, resizeSessionId, `(function () {
      return {
        viewportCompact: document.getElementById('focus-chip').getAttribute('data-viewport-compact'),
        activeId: document.activeElement && document.activeElement.id,
        bodyDisplay: getComputedStyle(document.getElementById('relationship-lens-body')).display
      };
    })()`);
    assert.deepEqual(resized, {
      viewportCompact: 'true',
      activeId: 'btn-focus-clear',
      bodyDisplay: 'none',
    }, JSON.stringify(resized));

    const reachSessionId = await load(browser, artifact, { width: 390, height: 120 });
    await evaluate(browser, reachSessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      window.scrollTo(0, Math.max(0, container.offsetTop));
      Archify.focus.set('hub', { toggle: false, updateUrl: false });
      document.getElementById('btn-reach-downstream').click();
    })()`);
    await waitForLayout(browser, reachSessionId);
    const reachCompact = await evaluate(browser, reachSessionId, `(function () {
      var details = document.getElementById('btn-focus-details');
      return {
        viewportCompact: document.getElementById('focus-chip').getAttribute('data-viewport-compact'),
        detailsDisplay: getComputedStyle(details).display,
        detailsExpanded: details.getAttribute('aria-expanded'),
        bodyDisplay: getComputedStyle(document.getElementById('relationship-lens-body')).display
      };
    })()`);
    assert.deepEqual(reachCompact, {
      viewportCompact: 'true',
      detailsDisplay: 'none',
      detailsExpanded: 'false',
      bodyDisplay: 'none',
    }, JSON.stringify(reachCompact));
  } finally {
    await browser.close();
  }
});

test('Dock Safe Rail keeps typed renderers clear across themes, Presentation, and low-height desktops', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const matrix = Object.keys(CASES).flatMap((mode) => [
    { mode, theme: 'light', width: 1440, height: 820, present: false },
    { mode, theme: 'dark', width: 1440, height: 900, present: true },
  ]);
  try {
    for (const entry of matrix) {
      const query = `?theme=${entry.theme}${entry.present ? '&present=1' : ''}`;
      const sessionId = await load(browser, render(entry.mode, CASES[entry.mode]), {
        width: entry.width,
        height: entry.height,
        query,
      });
      const receipt = await finalGeometry(browser, sessionId);
      const message = `${entry.mode}: ${JSON.stringify({ entry, receipt })}`;
      assert.ok(receipt.reserve > 0, message);
      assert.ok(receipt.stageGap >= 9, message);
      assert.equal(receipt.dockStageIntersectionArea, 0, message);
      assert.ok(receipt.scrollWidth <= receipt.innerWidth, message);
      assert.ok(receipt.navBottom <= receipt.containerBottom + 0.5, message);
      /* Normal artifacts intentionally keep supporting cards in document
         flow on low-height pages. Presentation removes that document scroll
         while every mode keeps the Viewer itself vertically contained. */
      if (entry.present) {
        assert.ok(receipt.scrollHeight <= receipt.innerHeight, message);
      }
      assert.ok(receipt.minimumProjectedNodeTextPx >= MIN_PROJECTED_NODE_TEXT_PX, message);
    }
  } finally {
    await browser.close();
  }
});

test('an artifact with no Legend still receives the desktop stage rail', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, renderWithoutLegend());
    const receipt = await finalGeometry(browser, sessionId);

    assert.equal(receipt.hasLegend, false, JSON.stringify(receipt));
    assert.ok(receipt.reserve > 0, JSON.stringify(receipt));
    assert.ok(receipt.stageGap >= 9, JSON.stringify(receipt));
    assert.ok(receipt.navBottom <= receipt.containerBottom + 0.5, JSON.stringify(receipt));
  } finally {
    await browser.close();
  }
});

test('Dock Safe Rail resolves a forced Legend collision across the shared diagram viewer', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    for (const [mode, example] of Object.entries(CASES)) {
      const sessionId = await load(browser, render(mode, example));
      const setup = await evaluate(browser, sessionId, `(function () {
        var nav = document.querySelector('.diagram-nav');
        var legendElement = document.querySelector('[data-legend]');
        if (!legendElement) {
          return { noLegend: true };
        }
        var initialLegend = legendElement.getBoundingClientRect();
        var containerRect = document.querySelector('.diagram-container').getBoundingClientRect();
        nav.style.right = 'auto';
        nav.style.left = Math.max(0, initialLegend.left - containerRect.left) + 'px';
        nav.style.bottom = Math.max(0, containerRect.bottom - initialLegend.bottom) + 'px';
        nav.style.width = Math.max(240, initialLegend.width) + 'px';
        window.dispatchEvent(new Event('resize'));
        return { noLegend: false };
      })()`);

      if (setup.noLegend) {
        const receipt = await finalGeometry(browser, sessionId);
        assert.ok(receipt.reserve > 0, mode);
        assert.ok(receipt.stageGap >= 9, mode);
        continue;
      }
      await waitForLayout(browser, sessionId);
      const receipt = await finalGeometry(browser, sessionId);
      assert.ok(receipt.reserve > 0, `${mode}: ${JSON.stringify(receipt)}`);
      assert.equal(receipt.legendDockIntersectionArea, 0, `${mode}: ${JSON.stringify(receipt)}`);
      assert.ok(receipt.stageGap >= 9, `${mode}: ${JSON.stringify(receipt)}`);
    }
  } finally {
    await browser.close();
  }
});

test('Maka remains collision-free at the reported Retina-equivalent viewport', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const output = path.join(tmp, 'maka-architecture.html');
  execFileSync(process.execPath, [
    path.join(skillRoot, 'bin', 'archify.mjs'),
    'render',
    'architecture',
    path.resolve(skillRoot, '..', 'examples', 'maka-architecture.architecture.json'),
    output,
  ]);
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, output, { width: 1484, height: 724 });
    const receipt = await evaluate(browser, sessionId, `(function () {
      var legend = document.querySelector('[data-legend]').getBoundingClientRect();
      var dock = document.querySelector('.diagram-nav').getBoundingClientRect();
      var width = Math.max(0, Math.min(legend.right, dock.right) - Math.max(legend.left, dock.left));
      var height = Math.max(0, Math.min(legend.bottom, dock.bottom) - Math.max(legend.top, dock.top));
      return {
        intersectionArea: width * height,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      };
    })()`);

    assert.equal(receipt.intersectionArea, 0, JSON.stringify(receipt));
    assert.ok(receipt.scrollWidth <= receipt.innerWidth, JSON.stringify(receipt));
  } finally {
    await browser.close();
  }
});

test('a real 5px Legend gap keeps the stage rail and Legend clear', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture));
    await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var legend = document.querySelector('[data-legend]');
      var nav = document.querySelector('.diagram-nav');
      var legendRect = legend.getBoundingClientRect();
      var containerRect = container.getBoundingClientRect();
      nav.style.right = 'auto';
      nav.style.left = (legendRect.right - containerRect.left + 5) + 'px';
      nav.style.bottom = Math.max(0, containerRect.bottom - legendRect.bottom) + 'px';
      window.dispatchEvent(new Event('resize'));
    })()`);
    await waitForLayout(browser, sessionId);
    const receipt = await finalGeometry(browser, sessionId);

    assert.equal(receipt.legendDockIntersectionArea, 0, JSON.stringify(receipt));
    assert.ok(receipt.reserve > 0, JSON.stringify(receipt));
    assert.ok(receipt.stageGap >= 9, JSON.stringify(receipt));
  } finally {
    await browser.close();
  }
});

test('Presentation keeps its visible Dock clear of a colliding Legend', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture), { query: '?present=1' });
    await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var legend = document.querySelector('[data-legend]');
      var nav = document.querySelector('.diagram-nav');
      var legendRect = legend.getBoundingClientRect();
      var containerRect = container.getBoundingClientRect();
      nav.style.right = 'auto';
      nav.style.left = Math.max(0, legendRect.left - containerRect.left) + 'px';
      nav.style.bottom = Math.max(0, containerRect.bottom - legendRect.bottom) + 'px';
      nav.style.width = Math.max(240, legendRect.width) + 'px';
      window.dispatchEvent(new Event('resize'));
    })()`);
    await waitForLayout(browser, sessionId);
    const receipt = await finalGeometry(browser, sessionId);

    assert.equal(receipt.legendDockIntersectionArea, 0, JSON.stringify(receipt));
    assert.ok(receipt.reserve > 0, JSON.stringify(receipt));
  } finally {
    await browser.close();
  }
});

test('manual zoom and pan reschedules Legend and Dock collision measurement', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture));
    await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var zoomIn = document.querySelector('[data-view="in"]');
      for (var index = 0; index < 8; index += 1) zoomIn.click();
      var svg = container.querySelector(':scope > svg');
      var rect = svg.getBoundingClientRect();
      var pointer = { bubbles: true, pointerId: 7, button: 0 };
      var startX = rect.left + rect.width / 2;
      var startY = rect.top + rect.height / 2;
      container.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: startX, clientY: startY }, pointer)));
      container.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: startX + 210, clientY: startY - 500 }, pointer)));
      container.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: startX + 210, clientY: startY - 500 }, pointer)));
    })()`);
    await waitForLayout(browser, sessionId);
    const receipt = await finalGeometry(browser, sessionId);

    assert.equal(receipt.legendDockIntersectionArea, 0, JSON.stringify(receipt));
    assert.equal(receipt.semanticDockIntersectionArea, 0, JSON.stringify(receipt));
    assert.ok(receipt.reserve > 0, JSON.stringify(receipt));
  } finally {
    await browser.close();
  }
});

test('camera pan clips authored relationship paint at the protected stage boundary', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture));
    await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var zoomIn = document.querySelector('[data-view="in"]');
      for (var index = 0; index < 8; index += 1) zoomIn.click();
      var svg = container.querySelector(':scope > svg');
      var rect = svg.getBoundingClientRect();
      var pointer = { bubbles: true, pointerId: 11, button: 0 };
      var startX = rect.left + rect.width / 2;
      var startY = rect.top + rect.height / 2;
      container.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: startX, clientY: startY }, pointer)));
      container.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: startX, clientY: startY + 500 }, pointer)));
      container.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: startX, clientY: startY + 500 }, pointer)));
    })()`);
    await waitForLayout(browser, sessionId);
    const hits = await edgePaintHitsUnderDock(
      browser,
      sessionId,
      'path[data-edge-id="jwt-verification"][data-edge-from="auth"][data-edge-to="api"]',
    );

    assert.deepEqual(hits, [], JSON.stringify(hits));
  } finally {
    await browser.close();
  }
});

test('live camera transitions keep authored relationship paint outside the Dock on every frame', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const artifact = render('architecture', CASES.architecture);
  const scenarios = [
    { name: 'zoom-in', setupZoomClicks: 7, action: 'in', duration: 260, clearsClip: false },
    { name: 'zoom-out', setupZoomClicks: 8, action: 'out', duration: 260, clearsClip: false },
    { name: 'reset', setupZoomClicks: 8, action: 'reset', duration: 420, clearsClip: true },
    { name: 'interrupted zoom', setupZoomClicks: 8, action: 'interrupt', duration: 420, clearsClip: false },
  ];
  try {
    for (const scenario of scenarios) {
      const sessionId = await load(browser, artifact);
      const result = await evaluate(browser, sessionId, `(function () {
        var scenario = ${JSON.stringify(scenario)};
        var container = document.querySelector('.diagram-container');
        var svg = container.querySelector(':scope > svg');
        var zoomIn = document.querySelector('[data-view="in"]');
        var zoomOut = document.querySelector('[data-view="out"]');
        for (var index = 0; index < scenario.setupZoomClicks; index += 1) zoomIn.click();

        var rect = svg.getBoundingClientRect();
        var pointer = { bubbles: true, pointerId: 17, button: 0 };
        var x = rect.left + rect.width / 2;
        var y = rect.top + rect.height / 2;
        container.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: x, clientY: y }, pointer)));
        container.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: x, clientY: y + 500 }, pointer)));
        container.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: x, clientY: y + 500 }, pointer)));

        document.documentElement.removeAttribute('data-motion');
        return new Promise(function (resolve) {
          requestAnimationFrame(function () {
            if (scenario.action === 'in') zoomIn.click();
            else if (scenario.action === 'out') zoomOut.click();
            else if (scenario.action === 'reset') document.querySelector('[data-view="reset"]').click();
            else {
              zoomOut.click();
              requestAnimationFrame(function () { zoomIn.click(); });
            }
            var edge = document.querySelector(
              'path[data-edge-id="jwt-verification"][data-edge-from="auth"][data-edge-to="api"]'
            );
            var hits = [];
            var started = performance.now();
            function sample(now) {
              var dock = document.querySelector('.diagram-nav').getBoundingClientRect();
              var matrix = edge.getScreenCTM();
              var length = edge.getTotalLength();
              for (var offset = 0; offset <= length; offset += 0.25) {
                var point = edge.getPointAtLength(offset).matrixTransform(matrix);
                if (
                  point.x >= dock.left && point.x <= dock.right &&
                  point.y >= dock.top && point.y <= dock.bottom &&
                  document.elementsFromPoint(point.x, point.y).includes(edge)
                ) {
                  hits.push({ ms: now - started, x: point.x, y: point.y });
                  break;
                }
              }
              if (now - started < scenario.duration) requestAnimationFrame(sample);
              else resolve({ hits: hits, clipPath: svg.style.getPropertyValue('clip-path') });
            }
            requestAnimationFrame(sample);
          });
        });
      })()`, true);

      assert.deepEqual(result.hits, [], `${scenario.name}: ${JSON.stringify(result.hits)}`);
      if (scenario.clearsClip) {
        assert.equal(result.clipPath, '', `${scenario.name} retains runtime clip-path`);
      }
    }
  } finally {
    await browser.close();
  }
});

test('zoom keeps the desktop rail stable and reports protected stage geometry', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture));
    const baseline = await finalGeometry(browser, sessionId);
    await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var zoomIn = document.querySelector('[data-view="in"]');
      for (var index = 0; index < 8; index += 1) zoomIn.click();
      var svg = container.querySelector(':scope > svg');
      var rect = svg.getBoundingClientRect();
      var pointer = { bubbles: true, pointerId: 13, button: 0 };
      var startX = rect.left + rect.width / 2;
      var startY = rect.top + rect.height / 2;
      container.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: startX, clientY: startY }, pointer)));
      container.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: startX + 210, clientY: startY - 500 }, pointer)));
      container.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: startX + 210, clientY: startY - 500 }, pointer)));
    })()`);
    await waitForLayout(browser, sessionId);
    const zoomed = await finalGeometry(browser, sessionId);

    assert.ok(Math.abs(zoomed.reserve - baseline.reserve) <= 1, JSON.stringify({ baseline, zoomed }));
    assert.equal(zoomed.dockStageIntersectionArea, 0, JSON.stringify({ baseline, zoomed }));
    assert.equal(zoomed.receiptStageIntersectionArea, 0, JSON.stringify({ baseline, zoomed }));
  } finally {
    await browser.close();
  }
});

test('Reset followed immediately by zoom and pan retains a collision-free desktop rail', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture));
    const baseline = await finalGeometry(browser, sessionId);
    await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      document.querySelector('[data-view="reset"]').click();
      var zoomIn = document.querySelector('[data-view="in"]');
      for (var index = 0; index < 8; index += 1) zoomIn.click();
      var svg = container.querySelector(':scope > svg');
      var rect = svg.getBoundingClientRect();
      var pointer = { bubbles: true, pointerId: 11, button: 0 };
      var startX = rect.left + rect.width / 2;
      var startY = rect.top + rect.height / 2;
      container.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: startX, clientY: startY }, pointer)));
      container.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: startX, clientY: startY + 500 }, pointer)));
      container.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: startX, clientY: startY + 500 }, pointer)));
    })()`);
    await waitForLayout(browser, sessionId);
    const receipt = await finalGeometry(browser, sessionId);

    assert.ok(receipt.reserve > 0, JSON.stringify({ baseline, receipt }));
    assert.ok(receipt.reserve <= baseline.reserve + 1, JSON.stringify({ baseline, receipt }));
    assert.equal(receipt.semanticDockIntersectionArea, 0, JSON.stringify({ baseline, receipt }));
  } finally {
    await browser.close();
  }
});

test('zoomed camera restores its bounded desktop rail after crossing the mobile breakpoint', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture));
    const baseline = await finalGeometry(browser, sessionId);
    await evaluate(browser, sessionId, `(function () {
      var zoomIn = document.querySelector('[data-view="in"]');
      for (var index = 0; index < 8; index += 1) zoomIn.click();
    })()`);
    await waitForLayout(browser, sessionId);
    const zoomed = await finalGeometry(browser, sessionId);

    await browser.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 720,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);
    await waitForLayout(browser, sessionId);
    const mobile = await finalGeometry(browser, sessionId);
    assert.equal(mobile.reserve, 0, JSON.stringify(mobile));

    await browser.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);
    await waitForLayout(browser, sessionId);
    const restored = await finalGeometry(browser, sessionId);

    assert.ok(Math.abs(restored.reserve - baseline.reserve) <= 1, JSON.stringify({ baseline, zoomed, restored }));
    assert.equal(restored.receiptReserve, restored.reserve, JSON.stringify(restored));
    assert.equal(restored.receiptEligible, true, JSON.stringify(restored));
    assert.ok(restored.scrollHeight <= restored.innerHeight, JSON.stringify(restored));
  } finally {
    await browser.close();
  }
});

test('localized multiline Legends remain clear across required viewports, themes, and presets', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const viewports = [[1440, 900], [1600, 1000], [1920, 1080], [2048, 1320]];
  const cases = viewports.flatMap(([width, height]) => (
    ['light', 'dark'].flatMap((theme) => (
      ['classic', 'signal-flow', 'blueprint', 'editorial'].map((preset) => ({
        width,
        height,
        theme,
        preset,
      }))
    ))
  ));
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture), { width: 1920, height: 1080 });
    await evaluate(browser, sessionId, `(function () {
      var text = document.querySelector('[data-legend] text');
      var x = text.getAttribute('x') || '0';
      var namespace = 'http://www.w3.org/2000/svg';
      text.textContent = '';
      var first = document.createElementNS(namespace, 'tspan');
      first.setAttribute('x', x);
      first.textContent = '应用与运行时编排服务（本地化长标签）';
      var second = document.createElementNS(namespace, 'tspan');
      second.setAttribute('x', x);
      second.setAttribute('dy', '14');
      second.textContent = '第二行语义说明';
      text.appendChild(first);
      text.appendChild(second);
    })()`);

    for (const entry of cases) {
      await browser.cdp.send('Emulation.setDeviceMetricsOverride', {
        width: entry.width,
        height: entry.height,
        deviceScaleFactor: 1,
        mobile: false,
      }, sessionId);
      await evaluate(browser, sessionId, `(function () {
        var html = document.documentElement;
        var nav = document.querySelector('.diagram-nav');
        html.setAttribute('data-preset', ${JSON.stringify(entry.preset)});
        html.setAttribute('data-theme', ${JSON.stringify(entry.theme)});
        document.querySelector('[data-view="reset"]').click();
        nav.removeAttribute('style');
        window.dispatchEvent(new Event('resize'));
      })()`);
      await waitForLayout(browser, sessionId);
      let receipt = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await evaluate(browser, sessionId, `(function () {
          var container = document.querySelector('.diagram-container');
          var legend = document.querySelector('[data-legend]').getBoundingClientRect();
          var nav = document.querySelector('.diagram-nav');
          var containerRect = container.getBoundingClientRect();
          nav.style.right = '0';
          nav.style.left = '0';
          nav.style.bottom = Math.max(0, containerRect.bottom - legend.bottom) + 'px';
          nav.style.width = 'auto';
          window.dispatchEvent(new Event('resize'));
        })()`);
        await waitForLayout(browser, sessionId);
        receipt = await finalGeometry(browser, sessionId);
        if (receipt.reserve > 0) break;
      }
      assert.equal(receipt.legendDockIntersectionArea, 0, JSON.stringify({ ...entry, receipt }));
      assert.ok(receipt.reserve > 0, JSON.stringify({ ...entry, receipt }));
      assert.equal(receipt.dockStageIntersectionArea, 0, JSON.stringify({ ...entry, receipt }));
      assert.ok(receipt.stageGap >= 9, JSON.stringify({ ...entry, receipt }));
    }
  } finally {
    await browser.close();
  }
});

test('Semantic Lens and Radar protect the final Legend and Dock rectangles', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const sessionId = await load(browser, render('architecture', CASES.architecture), { width: 1440, height: 900 });
    await evaluate(browser, sessionId, `document.getElementById('btn-semantic-lens').click()`);
    await waitForLayout(browser, sessionId);
    let receipt = await finalGeometry(browser, sessionId);
    assert.equal(receipt.legendLensIntersectionArea, 0, JSON.stringify(receipt));
    assert.equal(receipt.navLensIntersectionArea, 0, JSON.stringify(receipt));

    await evaluate(browser, sessionId, `(function () {
      document.getElementById('btn-semantic-lens').click();
      document.getElementById('btn-overview-map').click();
    })()`);
    await waitForLayout(browser, sessionId);
    receipt = await finalGeometry(browser, sessionId);
    assert.equal(receipt.legendRadarIntersectionArea, 0, JSON.stringify(receipt));
    assert.equal(receipt.navRadarIntersectionArea, 0, JSON.stringify(receipt));
  } finally {
    await browser.close();
  }
});

test('Radar, Passport, Legend, and Dock remain mutually clear on desktop and narrow viewports', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const artifact = render('architecture', CASES.architecture);
    for (const viewport of [
      { width: 1440, height: 900, label: 'desktop' },
      { width: 390, height: 600, label: 'narrow' },
    ]) {
      const sessionId = await load(browser, artifact, viewport);
      await evaluate(browser, sessionId, `(function () {
        var container = document.querySelector('.diagram-container');
        window.scrollTo(0, Math.max(0, container.offsetTop));
        Archify.focus.set('lb', { toggle: false });
        Archify.radar.open();
        window.dispatchEvent(new Event('resize'));
      })()`);
      await waitForLayout(browser, sessionId);
      const receipt = await finalGeometry(browser, sessionId);
      const message = viewport.label + ': ' + JSON.stringify(receipt);

      assert.equal(receipt.legendDockIntersectionArea, 0, message);
      assert.equal(receipt.legendPassportIntersectionArea, 0, message);
      assert.equal(receipt.navPassportIntersectionArea, 0, message);
      assert.equal(receipt.legendRadarIntersectionArea, 0, message);
      assert.equal(receipt.navRadarIntersectionArea, 0, message);
      assert.equal(receipt.radarPassportIntersectionArea, 0, message);
    }
  } finally {
    await browser.close();
  }
});

test('direct and reachable relationship exploration keeps highlighted nodes outside the Passport', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const artifact = renderRelationshipExplorationStress();
  const scenarios = [
    { label: 'outgoing', trigger: 'relationship', direction: 'out', match: '[data-node-id][data-relationship-preview-node]', expectedIds: ['hub', 'out-left'] },
    { label: 'incoming', trigger: 'relationship', direction: 'in', match: '[data-node-id][data-relationship-preview-node]', expectedIds: ['hub', 'in-left'] },
    { label: 'upstream', trigger: 'reach', direction: 'upstream', match: '[data-node-id][data-reach-match]', expectedIds: ['hub', 'in-left', 'in-right'] },
    { label: 'downstream', trigger: 'reach', direction: 'downstream', match: '[data-node-id][data-reach-match]', expectedIds: ['hub', 'out-left', 'out-right'] },
  ];
  try {
    for (const scenario of scenarios) {
      const sessionId = await load(browser, artifact, { width: 1440, height: 900 });
      await evaluate(browser, sessionId, `(function () {
        var container = document.querySelector('.diagram-container');
        window.scrollTo(0, Math.max(0, container.offsetTop));
        Archify.focus.set('hub', { toggle: false, updateUrl: false });
        Archify.view.reveal(['hub'], {
          includeNeighbors: true,
          reason: 'focus',
          instant: true
        });
      })()`);
      await waitForLayout(browser, sessionId);
      if (scenario.trigger === 'reach') {
        await evaluate(browser, sessionId, `document.getElementById('btn-reach-${scenario.direction}').click()`);
      } else {
        await evaluate(browser, sessionId, `(function () {
          var row = document.querySelector('#relationship-lens-list .relationship-lens-row[data-direction="${scenario.direction}"]');
          if (row && row.offsetParent === null) {
            row.closest('.relationship-lens-group').querySelector('[data-relationship-group-toggle]').click();
          }
        })()`);
        await waitForLayout(browser, sessionId);
        const point = await evaluate(browser, sessionId, `(function () {
          var row = document.querySelector('#relationship-lens-list .relationship-lens-row[data-direction="${scenario.direction}"]');
          var rect = row.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`);
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: point.x,
          y: point.y,
          button: 'none',
          buttons: 0,
        }, sessionId);
      }
      const receipt = await evaluate(browser, sessionId, `(function () {
        var scenario = ${JSON.stringify(scenario)};
        var container = document.querySelector('.diagram-container');
        return new Promise(function (resolve, reject) {
          var stableFrames = 0;
          var sampledFrames = 0;
          var previous = '';
          function intersectionArea(first, second, gap) {
            return Math.max(0, Math.min(first.right + gap, second.right) - Math.max(first.left - gap, second.left)) *
              Math.max(0, Math.min(first.bottom + gap, second.bottom) - Math.max(first.top - gap, second.top));
          }
          function rectSnapshot(rect) {
            return [rect.left, rect.top, rect.right, rect.bottom].map(function (value) {
              return Math.round(value * 100) / 100;
            }).join(',');
          }
          function sample() {
            sampledFrames += 1;
            var passport = document.getElementById('focus-chip');
            var matches = Array.from(document.querySelectorAll(scenario.match));
            var current = [
              container.hasAttribute('data-camera-transaction') ? 'moving' : 'settled',
              rectSnapshot(passport.getBoundingClientRect())
            ].concat(matches.map(function (node) {
              return node.getAttribute('data-node-id') + ':' + rectSnapshot(node.getBoundingClientRect());
            })).join('|');
            if (current === previous && !container.hasAttribute('data-camera-transaction')) stableFrames += 1;
            else stableFrames = 0;
            previous = current;
            if (stableFrames >= 6) {
              var passportRect = passport.getBoundingClientRect();
              var containerRect = container.getBoundingClientRect();
              var visible = {
                left: Math.max(0, containerRect.left),
                top: Math.max(0, containerRect.top),
                right: Math.min(window.innerWidth, containerRect.right),
                bottom: Math.min(window.innerHeight, containerRect.bottom)
              };
              var overlaps = matches.map(function (node) {
                var nodeRect = node.getBoundingClientRect();
                return {
                  id: node.getAttribute('data-node-id'),
                  area: intersectionArea(passportRect, nodeRect, 12),
                  fullyVisible: nodeRect.left >= visible.left - 0.5 &&
                    nodeRect.top >= visible.top - 0.5 &&
                    nodeRect.right <= visible.right + 0.5 &&
                    nodeRect.bottom <= visible.bottom + 0.5
                };
              });
              resolve({
                compact: passport.getAttribute('data-exploration-compact'),
                hidden: passport.hidden,
                matchCount: matches.length,
                overlaps: overlaps,
                camera: Archify.view.state()
              });
              return;
            }
            if (sampledFrames >= 180) {
              reject(new Error('Relationship exploration camera did not settle.'));
              return;
            }
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
      })()`, true);
      const message = `${scenario.label}: ${JSON.stringify(receipt)}`;
      assert.equal(receipt.hidden, false, message);
      assert.deepEqual(receipt.overlaps.map((entry) => entry.id).sort(), scenario.expectedIds.slice().sort(), message);
      assert.equal(receipt.matchCount, scenario.expectedIds.length, message);
      assert.ok(receipt.overlaps.every((entry) => entry.fullyVisible), message);
      assert.equal(Math.max(...receipt.overlaps.map((entry) => entry.area)), 0, message);
      if (scenario.trigger === 'relationship') assert.ok(receipt.camera.scale < 1, message);
      if (scenario.trigger === 'reach') assert.equal(receipt.compact, 'true', message);

      if (scenario.label === 'outgoing') {
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: 1420,
          y: 20,
          button: 'none',
          buttons: 0,
        }, sessionId);
        await waitForLayout(browser, sessionId);
        const restored = await evaluate(browser, sessionId, `(function () {
          var passport = document.getElementById('focus-chip');
          return {
            camera: Archify.view.state(),
            compact: passport.getAttribute('data-exploration-compact'),
            mode: passport.getAttribute('data-exploration-mode'),
            previewCount: document.querySelectorAll('[data-relationship-preview-node]').length,
            reachVisible: !document.getElementById('focus-reach').hidden &&
              getComputedStyle(document.getElementById('focus-reach')).display !== 'none',
            detailsHidden: document.getElementById('btn-focus-details').hidden
          };
        })()`);
        assert.equal(restored.previewCount, 0, JSON.stringify(restored));
        assert.equal(restored.compact, null, JSON.stringify(restored));
        assert.equal(restored.mode, null, JSON.stringify(restored));
        assert.equal(restored.reachVisible, true, JSON.stringify(restored));
        assert.equal(restored.detailsHidden, true, JSON.stringify(restored));
        assert.equal(restored.camera.mode, 'semantic', JSON.stringify(restored));
        assert.ok(restored.camera.scale >= 1, JSON.stringify(restored));
      }

      if (scenario.label === 'downstream') {
        await evaluate(browser, sessionId, `document.getElementById('btn-reach-downstream').click()`);
        await waitForLayout(browser, sessionId);
        const restored = await evaluate(browser, sessionId, `(function () {
          var passport = document.getElementById('focus-chip');
          return {
            camera: Archify.view.state(),
            compact: passport.getAttribute('data-exploration-compact'),
            reach: document.querySelector('.diagram-container > svg').getAttribute('data-reach-active')
          };
        })()`);
        assert.equal(restored.compact, null, JSON.stringify(restored));
        assert.equal(restored.reach, null, JSON.stringify(restored));
        assert.equal(restored.camera.mode, 'semantic', JSON.stringify(restored));
        assert.ok(restored.camera.scale >= 1, JSON.stringify(restored));
      }
    }
  } finally {
    await browser.close();
  }
});

test('relationship exploration deep links and translated 1x framing yield to manual pan', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const artifact = renderRelationshipExplorationStress();
  try {
    const sessionId = await load(browser, artifact, { width: 1440, height: 900, query: '#relation=hub-out-left' });
    await waitForLayout(browser, sessionId);
    const linked = await evaluate(browser, sessionId, `(function () {
      var passport = document.getElementById('focus-chip');
      var passportRect = passport.getBoundingClientRect();
      var matches = Array.from(document.querySelectorAll('[data-node-id][data-relationship-preview-node]'));
      var containerRect = document.querySelector('.diagram-container').getBoundingClientRect();
      var visible = {
        left: Math.max(0, containerRect.left),
        top: Math.max(0, containerRect.top),
        right: Math.min(window.innerWidth, containerRect.right),
        bottom: Math.min(window.innerHeight, containerRect.bottom)
      };
      function area(first, second) {
        return Math.max(0, Math.min(first.right + 12, second.right) - Math.max(first.left - 12, second.left)) *
          Math.max(0, Math.min(first.bottom + 12, second.bottom) - Math.max(first.top - 12, second.top));
      }
      return {
        hash: location.hash,
        compact: passport.getAttribute('data-exploration-compact'),
        pinned: document.querySelector('.diagram-container > svg').hasAttribute('data-relationship-pin-active'),
        camera: Archify.view.state(),
        ids: matches.map(function (node) { return node.getAttribute('data-node-id'); }).sort(),
        overlaps: matches.map(function (node) { return area(passportRect, node.getBoundingClientRect()); }),
        fullyVisible: matches.map(function (node) {
          var rect = node.getBoundingClientRect();
          return rect.left >= visible.left - 0.5 && rect.top >= visible.top - 0.5 &&
            rect.right <= visible.right + 0.5 && rect.bottom <= visible.bottom + 0.5;
        })
      };
    })()`);
    assert.equal(linked.hash, '#relation=hub-out-left');
    assert.equal(linked.compact, 'true');
    assert.equal(linked.pinned, true);
    assert.equal(linked.camera.mode, 'semantic', JSON.stringify(linked));
    assert.deepEqual(linked.ids, ['hub', 'out-left']);
    assert.ok(linked.overlaps.every((area) => area === 0), JSON.stringify(linked));
    assert.ok(linked.fullyVisible.every(Boolean), JSON.stringify(linked));

    await evaluate(browser, sessionId, `(function () {
      Archify.focus.set('hub', { toggle: false, updateUrl: false });
      Archify.view.reveal(['hub'], {
        includeNeighbors: false,
        maxScale: 1,
        minimumScale: 1,
        instant: true,
        reason: 'manual-pan-regression'
      });
    })()`);
    await waitForLayout(browser, sessionId);
    const panned = await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var before = Archify.view.state();
      var pannable = container.classList.contains('is-pannable');
      container.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        buttons: 1,
        pointerId: 17,
        clientX: 720,
        clientY: 520
      }));
      container.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        buttons: 1,
        pointerId: 17,
        clientX: 756,
        clientY: 536
      }));
      container.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        pointerId: 17,
        clientX: 756,
        clientY: 536
      }));
      return { before: before, after: Archify.view.state(), pannable: pannable };
    })()`);
    assert.equal(panned.before.scale, 1, JSON.stringify(panned));
    assert.equal(panned.pannable, true, JSON.stringify(panned));
    assert.equal(panned.after.mode, 'manual', JSON.stringify(panned));
    assert.ok(Math.abs(panned.after.x - panned.before.x) + Math.abs(panned.after.y - panned.before.y) > 3, JSON.stringify(panned));
  } finally {
    await browser.close();
  }
});

test('relationship hover stability fixture renders the reported topology before browser assertions run', () => {
  const html = fs.readFileSync(renderRelationshipHoverStabilityStress(), 'utf8');
  assert.match(html, /data-node-id="agent-kernel"/);
  assert.match(html, /data-node-id="ai-router"/);
  assert.match(html, /data-edge-from="agent-kernel"[^>]+data-edge-to="ai-router"/);
});

test('relationship hover only highlights while explicit activation owns camera movement', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const artifact = renderRelationshipHoverStabilityStress();
  try {
    for (const scenario of [
      { label: 'fully visible container', width: 1396, height: 894, scrollOffset: 0 },
      { label: 'partially visible container', width: 1396, height: 700, scrollOffset: 80 },
      { label: 'fine pointer at mobile breakpoint', width: 720, height: 700, scrollOffset: 0, expandRelationships: true },
      { label: 'fine pointer below mobile breakpoint', width: 719, height: 700, scrollOffset: 0, expandRelationships: true },
      { label: 'fine pointer on narrow mobile', width: 390, height: 700, scrollOffset: 0, expandRelationships: true },
    ]) {
      const sessionId = await load(browser, artifact, {
        width: scenario.width,
        height: scenario.height,
        query: `?case=${encodeURIComponent(scenario.label)}`,
      });
      await browser.cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
      }, sessionId);
      await browser.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sessionId);
      await evaluate(browser, sessionId, `(function () {
        document.documentElement.setAttribute('data-motion', 'full');
        var container = document.querySelector('.diagram-container');
        if (${scenario.scrollOffset > 0}) {
          var spacer = document.createElement('div');
          spacer.setAttribute('data-test-scroll-spacer', '');
          spacer.style.height = '400px';
          document.body.appendChild(spacer);
        }
        window.scrollTo(0, Math.max(0, container.offsetTop + ${scenario.scrollOffset}));
        Archify.focus.set('agent-kernel', { toggle: false, updateUrl: false });
        if (${scenario.expandRelationships === true}) document.getElementById('btn-focus-relations').click();
      })()`);
      await waitForLayout(browser, sessionId);
      const point = await evaluate(browser, sessionId, `(function () {
        var row = document.querySelector('.relationship-lens-row[data-relationship-target="ai-router"]');
        var rect = row.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          containerTop: document.querySelector('.diagram-container').getBoundingClientRect().top,
          finePointer: matchMedia('(hover: hover) and (pointer: fine)').matches,
          camera: Archify.view.state()
        };
      })()`);
      if (scenario.scrollOffset) assert.ok(point.containerTop < 0, JSON.stringify({ scenario, point }));
      if (scenario.expandRelationships) assert.equal(point.finePointer, true, JSON.stringify({ scenario, point }));
      await browser.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: point.x,
        y: point.y,
        button: 'none',
        buttons: 0,
      }, sessionId);
      const receipt = await evaluate(browser, sessionId, `(function () {
        var point = ${JSON.stringify(point)};
        var container = document.querySelector('.diagram-container');
        var svg = document.querySelector('.diagram-container > svg');
        var row = document.querySelector('.relationship-lens-row[data-relationship-target="ai-router"]');
        var rowKey = row.getAttribute('data-relationship-key');
        return new Promise(function (resolve) {
          var frames = 0;
          var previousActiveKey = svg.getAttribute('data-relationship-preview-active');
          var previousMoving = container.hasAttribute('data-camera-transaction');
          var previousUnder = true;
          var activeStarts = previousActiveKey ? 1 : 0;
          var clears = 0;
          var transactionStarts = previousMoving ? 1 : 0;
          var underTransitions = 0;
          var missedHitFrames = 0;
          var wrongKeyFrames = 0;
          var scaleDirectionChanges = 0;
          var xDirectionChanges = 0;
          var yDirectionChanges = 0;
          var previousScaleDirection = 0;
          var previousXDirection = 0;
          var previousYDirection = 0;
          var previousScale = point.camera.scale;
          var previousX = point.camera.x;
          var previousY = point.camera.y;
          var rowTops = [];
          var scales = [point.camera.scale];
          var xs = [point.camera.x];
          var ys = [point.camera.y];
          function recordDirection(delta, previousDirection, increment) {
            if (Math.abs(delta) <= 0.0001) return previousDirection;
            var direction = delta > 0 ? 1 : -1;
            if (previousDirection && direction !== previousDirection) increment();
            return direction;
          }
          function sample() {
            frames += 1;
            var activeKey = svg.getAttribute('data-relationship-preview-active');
            if (activeKey !== previousActiveKey) {
              if (activeKey) activeStarts += 1;
              else clears += 1;
            }
            previousActiveKey = activeKey;
            if (activeKey && activeKey !== rowKey) wrongKeyFrames += 1;
            var moving = container.hasAttribute('data-camera-transaction');
            if (moving && !previousMoving) transactionStarts += 1;
            previousMoving = moving;
            var rect = row.getBoundingClientRect();
            var under = point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
            if (under !== previousUnder) underTransitions += 1;
            previousUnder = under;
            var hit = document.elementFromPoint(point.x, point.y);
            if (!hit || hit.closest('[data-relationship-key]') !== row) missedHitFrames += 1;
            var camera = Archify.view.state();
            var scale = camera.scale;
            var delta = scale - previousScale;
            previousScaleDirection = recordDirection(delta, previousScaleDirection, function () { scaleDirectionChanges += 1; });
            previousXDirection = recordDirection(camera.x - previousX, previousXDirection, function () { xDirectionChanges += 1; });
            previousYDirection = recordDirection(camera.y - previousY, previousYDirection, function () { yDirectionChanges += 1; });
            previousScale = scale;
            previousX = camera.x;
            previousY = camera.y;
            rowTops.push(rect.top);
            scales.push(scale);
            xs.push(camera.x);
            ys.push(camera.y);
            if (frames >= 240) {
              var scaleTail = scales.slice(-30);
              var xTail = xs.slice(-30);
              var yTail = ys.slice(-30);
              var containerRect = container.getBoundingClientRect();
              var visible = {
                left: Math.max(0, containerRect.left),
                top: Math.max(0, containerRect.top),
                right: Math.min(window.innerWidth, containerRect.right),
                bottom: Math.min(window.innerHeight, containerRect.bottom)
              };
              var targetsVisible = ['agent-kernel', 'ai-router'].map(function (id) {
                var targetRect = svg.querySelector('[data-node-id="' + id + '"]').getBoundingClientRect();
                return targetRect.left >= visible.left - 0.5 && targetRect.top >= visible.top - 0.5 &&
                  targetRect.right <= visible.right + 0.5 && targetRect.bottom <= visible.bottom + 0.5;
              });
              resolve({
                activeStarts: activeStarts,
                clears: clears,
                finalActiveKey: activeKey,
                rowKey: rowKey,
                transactionStarts: transactionStarts,
                finalMoving: moving,
                underTransitions: underTransitions,
                missedHitFrames: missedHitFrames,
                wrongKeyFrames: wrongKeyFrames,
                scaleDirectionChanges: scaleDirectionChanges,
                xDirectionChanges: xDirectionChanges,
                yDirectionChanges: yDirectionChanges,
                minimumRowTop: Math.min.apply(Math, rowTops),
                maximumRowTop: Math.max.apply(Math, rowTops),
                minimumScale: Math.min.apply(Math, scales),
                maximumScale: Math.max.apply(Math, scales),
                minimumX: Math.min.apply(Math, xs),
                maximumX: Math.max.apply(Math, xs),
                minimumY: Math.min.apply(Math, ys),
                maximumY: Math.max.apply(Math, ys),
                settledScaleRange: Math.max.apply(Math, scaleTail) - Math.min.apply(Math, scaleTail),
                settledXRange: Math.max.apply(Math, xTail) - Math.min.apply(Math, xTail),
                settledYRange: Math.max.apply(Math, yTail) - Math.min.apply(Math, yTail),
                targetsVisible: targetsVisible
              });
              return;
            }
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
      })()`, true);
      const message = `${scenario.label}: ${JSON.stringify(receipt)}`;
      assert.equal(receipt.activeStarts, 1, message);
      assert.equal(receipt.clears, 0, message);
      assert.equal(receipt.finalActiveKey, receipt.rowKey, message);
      assert.equal(receipt.transactionStarts, 0, message);
      assert.equal(receipt.finalMoving, false, message);
      assert.equal(receipt.underTransitions, 0, message);
      assert.equal(receipt.missedHitFrames, 0, message);
      assert.equal(receipt.wrongKeyFrames, 0, message);
      assert.equal(receipt.scaleDirectionChanges, 0, message);
      assert.equal(receipt.xDirectionChanges, 0, message);
      assert.equal(receipt.yDirectionChanges, 0, message);
      assert.ok(receipt.maximumRowTop - receipt.minimumRowTop <= 1, message);
      assert.ok(Math.abs(receipt.minimumScale - point.camera.scale) <= 0.001, message);
      assert.ok(Math.abs(receipt.maximumScale - point.camera.scale) <= 0.001, message);
      assert.ok(Math.abs(receipt.minimumX - point.camera.x) <= 0.001, message);
      assert.ok(Math.abs(receipt.maximumX - point.camera.x) <= 0.001, message);
      assert.ok(Math.abs(receipt.minimumY - point.camera.y) <= 0.001, message);
      assert.ok(Math.abs(receipt.maximumY - point.camera.y) <= 0.001, message);
      assert.ok(receipt.settledScaleRange <= 0.001, message);
      assert.ok(receipt.settledXRange <= 0.001, message);
      assert.ok(receipt.settledYRange <= 0.001, message);
      if (scenario.expandRelationships) {
        const togglePoint = await evaluate(browser, sessionId, `(function () {
          var body = document.getElementById('relationship-lens-body');
          body.scrollTop = body.scrollHeight;
          return new Promise(function (resolve) {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                var toggle = document.querySelector('[data-relationship-group-toggle="in"]');
                var rect = toggle.getBoundingClientRect();
                var x = rect.left + rect.width / 2;
                var y = rect.top + rect.height / 2;
                var hit = document.elementFromPoint(x, y);
                resolve({
                  x: x,
                  y: y,
                  hitDirection: hit && hit.closest('[data-relationship-group-toggle]') &&
                    hit.closest('[data-relationship-group-toggle]').getAttribute('data-relationship-group-toggle'),
                  camera: Archify.view.state(),
                  focused: document.querySelector('.diagram-container > svg').getAttribute('data-focus-active')
                });
              });
            });
          });
        })()`, true);
        assert.equal(togglePoint.hitDirection, 'in', JSON.stringify({ scenario, togglePoint }));
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: togglePoint.x, y: togglePoint.y, button: 'none', buttons: 0,
        }, sessionId);
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed', x: togglePoint.x, y: togglePoint.y, button: 'left', buttons: 1, clickCount: 1,
        }, sessionId);
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: togglePoint.x, y: togglePoint.y, button: 'left', buttons: 0, clickCount: 1,
        }, sessionId);
        await waitForLayout(browser, sessionId);
        const toggled = await evaluate(browser, sessionId, `(function () {
          return {
            focused: document.querySelector('.diagram-container > svg').getAttribute('data-focus-active'),
            passportHidden: document.getElementById('focus-chip').hidden,
            incomingExpanded: document.querySelector('[data-relationship-group-toggle="in"]').getAttribute('aria-expanded'),
            camera: Archify.view.state()
          };
        })()`);
        assert.equal(toggled.focused, togglePoint.focused, JSON.stringify({ scenario, toggled }));
        assert.equal(toggled.passportHidden, false, JSON.stringify({ scenario, toggled }));
        assert.equal(toggled.incomingExpanded, 'true', JSON.stringify({ scenario, toggled }));
        assert.deepEqual(toggled.camera, togglePoint.camera, JSON.stringify({ scenario, toggled }));
        const activationPoint = await evaluate(browser, sessionId, `(function () {
          var row = document.querySelector('.relationship-lens-row[data-direction="in"]');
          var rect = row.getBoundingClientRect();
          var originalReveal = Archify.view.reveal;
          var originalReset = Archify.view.reset;
          window.__archifyRelationshipActivationProbe = {
            revealCalls: [],
            resetCalls: 0,
            originalReveal: originalReveal,
            originalReset: originalReset
          };
          Archify.view.reveal = function (ids, options) {
            window.__archifyRelationshipActivationProbe.revealCalls.push({
              ids: ids.slice(),
              reason: options && options.reason
            });
            return originalReveal.apply(Archify.view, arguments);
          };
          Archify.view.reset = function () {
            window.__archifyRelationshipActivationProbe.resetCalls += 1;
            return originalReset.apply(Archify.view, arguments);
          };
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            targetId: row.getAttribute('data-relationship-target')
          };
        })()`);
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: activationPoint.x, y: activationPoint.y, button: 'none', buttons: 0,
        }, sessionId);
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed', x: activationPoint.x, y: activationPoint.y,
          button: 'left', buttons: 1, clickCount: 1,
        }, sessionId);
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: activationPoint.x, y: activationPoint.y,
          button: 'left', buttons: 0, clickCount: 1,
        }, sessionId);
        await waitForLayout(browser, sessionId);
        const activation = await evaluate(browser, sessionId, `(function () {
          var probe = window.__archifyRelationshipActivationProbe;
          Archify.view.reveal = probe.originalReveal;
          Archify.view.reset = probe.originalReset;
          delete window.__archifyRelationshipActivationProbe;
          var container = document.querySelector('.diagram-container');
          var target = document.querySelector('[data-node-id="${activationPoint.targetId}"]');
          var targetRect = target.getBoundingClientRect();
          var passport = document.getElementById('focus-chip');
          var passportRect = passport.getBoundingClientRect();
          var containerRect = container.getBoundingClientRect();
          return {
            revealCalls: probe.revealCalls,
            resetCalls: probe.resetCalls,
            focused: document.querySelector('.diagram-container > svg').getAttribute('data-focus-active'),
            relationsExpanded: passport.getAttribute('data-relations-expanded'),
            overlap: Math.max(0, Math.min(targetRect.right, passportRect.right) - Math.max(targetRect.left, passportRect.left)) *
              Math.max(0, Math.min(targetRect.bottom, passportRect.bottom) - Math.max(targetRect.top, passportRect.top)),
            fullyVisible: targetRect.left >= containerRect.left - 0.5 && targetRect.top >= containerRect.top - 0.5 &&
              targetRect.right <= containerRect.right + 0.5 && targetRect.bottom <= containerRect.bottom + 0.5
          };
        })()`);
        assert.deepEqual(activation.revealCalls, [{
          ids: [activationPoint.targetId],
          reason: 'relationship'
        }], JSON.stringify({ scenario, activation }));
        assert.equal(activation.resetCalls, 0, JSON.stringify({ scenario, activation }));
        assert.equal(activation.focused, activationPoint.targetId, JSON.stringify({ scenario, activation }));
        assert.equal(activation.relationsExpanded, null, JSON.stringify({ scenario, activation }));
        assert.equal(activation.overlap, 0, JSON.stringify({ scenario, activation }));
        assert.equal(activation.fullyVisible, true, JSON.stringify({ scenario, activation }));
      }
    }

    const boundarySessionId = await load(browser, artifact, { width: 1396, height: 894 });
    await evaluate(browser, boundarySessionId, `(function () {
      document.documentElement.setAttribute('data-motion', 'full');
      Archify.focus.set('agent-kernel', { toggle: false, updateUrl: false });
    })()`);
    await waitForLayout(browser, boundarySessionId);
    const boundary = await evaluate(browser, boundarySessionId, `(function () {
      var rows = Array.from(document.querySelectorAll('.relationship-lens-row[data-direction="out"]'))
        .filter(function (row) { return row.offsetParent !== null; });
      var lastRowRect = rows[rows.length - 1].getBoundingClientRect();
      var incomingRect = document.querySelector('[data-relationship-group-toggle="in"]').getBoundingClientRect();
      var x = Math.max(lastRowRect.left, incomingRect.left) +
        (Math.min(lastRowRect.right, incomingRect.right) - Math.max(lastRowRect.left, incomingRect.left)) / 2;
      return {
        row: { x: x, y: lastRowRect.bottom - 6 },
        incoming: { x: x, y: incomingRect.top + 6 },
        lastTarget: rows[rows.length - 1].getAttribute('data-relationship-target'),
        camera: Archify.view.state()
      };
    })()`);
    assert.equal(boundary.lastTarget, 'tools', JSON.stringify(boundary));
    await evaluate(browser, boundarySessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var svg = document.querySelector('.diagram-container > svg');
      var probe = {
        active: true,
        previousMoving: container.hasAttribute('data-camera-transaction'),
        transactionStarts: container.hasAttribute('data-camera-transaction') ? 1 : 0,
        samples: []
      };
      probe.observer = new MutationObserver(function () {
        var moving = container.hasAttribute('data-camera-transaction');
        if (moving && !probe.previousMoving) probe.transactionStarts += 1;
        probe.previousMoving = moving;
      });
      probe.observer.observe(container, { attributes: true, attributeFilter: ['data-camera-transaction'] });
      function sample() {
        if (!probe.active) return;
        probe.samples.push({
          camera: Archify.view.state(),
          preview: svg.getAttribute('data-relationship-preview-active')
        });
        requestAnimationFrame(sample);
      }
      window.__archifyRelationshipBoundaryProbe = probe;
      requestAnimationFrame(sample);
    })()`);
    async function pauseBoundaryProbe(milliseconds) {
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
    }
    async function sweepBoundary(from, to) {
      for (let step = 0; step <= 6; step += 1) {
        const fraction = step / 6;
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
          button: 'none',
          buttons: 0,
        }, boundarySessionId);
        await pauseBoundaryProbe(20);
      }
    }
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await sweepBoundary(boundary.row, boundary.incoming);
      await pauseBoundaryProbe(150);
      await sweepBoundary(boundary.incoming, boundary.row);
      await pauseBoundaryProbe(150);
    }
    const boundaryProbe = await evaluate(browser, boundarySessionId, `(function () {
      var probe = window.__archifyRelationshipBoundaryProbe;
      probe.active = false;
      probe.observer.disconnect();
      delete window.__archifyRelationshipBoundaryProbe;
      var scales = probe.samples.map(function (sample) { return sample.camera.scale; });
      var xs = probe.samples.map(function (sample) { return sample.camera.x; });
      var ys = probe.samples.map(function (sample) { return sample.camera.y; });
      return {
        transactionStarts: probe.transactionStarts,
        previews: Array.from(new Set(probe.samples.map(function (sample) { return sample.preview; }))),
        minimumScale: Math.min.apply(Math, scales),
        maximumScale: Math.max.apply(Math, scales),
        minimumX: Math.min.apply(Math, xs),
        maximumX: Math.max.apply(Math, xs),
        minimumY: Math.min.apply(Math, ys),
        maximumY: Math.max.apply(Math, ys)
      };
    })()`);
    assert.equal(boundaryProbe.transactionStarts, 0, JSON.stringify(boundaryProbe));
    assert.ok(boundaryProbe.previews.some(Boolean), JSON.stringify(boundaryProbe));
    assert.ok(boundaryProbe.previews.some((preview) => !preview), JSON.stringify(boundaryProbe));
    assert.ok(Math.abs(boundaryProbe.minimumScale - boundary.camera.scale) <= 0.001, JSON.stringify(boundaryProbe));
    assert.ok(Math.abs(boundaryProbe.maximumScale - boundary.camera.scale) <= 0.001, JSON.stringify(boundaryProbe));
    assert.ok(Math.abs(boundaryProbe.minimumX - boundary.camera.x) <= 0.001, JSON.stringify(boundaryProbe));
    assert.ok(Math.abs(boundaryProbe.maximumX - boundary.camera.x) <= 0.001, JSON.stringify(boundaryProbe));
    assert.ok(Math.abs(boundaryProbe.minimumY - boundary.camera.y) <= 0.001, JSON.stringify(boundaryProbe));
    assert.ok(Math.abs(boundaryProbe.maximumY - boundary.camera.y) <= 0.001, JSON.stringify(boundaryProbe));

    const groupToggleState = await evaluate(browser, boundarySessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var starts = 0;
      var previousMoving = container.hasAttribute('data-camera-transaction');
      var cameras = [Archify.view.state()];
      var observer = new MutationObserver(function () {
        var moving = container.hasAttribute('data-camera-transaction');
        if (moving && !previousMoving) starts += 1;
        previousMoving = moving;
      });
      observer.observe(container, { attributes: true, attributeFilter: ['data-camera-transaction'] });
      document.querySelector('[data-relationship-group-toggle="in"]').click();
      document.querySelector('[data-relationship-group-toggle="out"]').click();
      return new Promise(function (resolve) {
        var frames = 0;
        function sample() {
          cameras.push(Archify.view.state());
          frames += 1;
          if (frames < 45) return requestAnimationFrame(sample);
          observer.disconnect();
          resolve({
            transactionStarts: starts,
            cameras: cameras,
            moving: container.hasAttribute('data-camera-transaction'),
            outgoingExpanded: document.querySelector('[data-relationship-group-toggle="out"]').getAttribute('aria-expanded'),
            incomingExpanded: document.querySelector('[data-relationship-group-toggle="in"]').getAttribute('aria-expanded')
          });
        }
        requestAnimationFrame(sample);
      });
    })()`, true);
    assert.equal(groupToggleState.transactionStarts, 0, JSON.stringify(groupToggleState));
    assert.equal(groupToggleState.moving, false, JSON.stringify(groupToggleState));
    assert.equal(groupToggleState.outgoingExpanded, 'true', JSON.stringify(groupToggleState));
    assert.equal(groupToggleState.incomingExpanded, 'false', JSON.stringify(groupToggleState));
    groupToggleState.cameras.forEach((camera) => {
      assert.ok(Math.abs(camera.scale - boundary.camera.scale) <= 0.001, JSON.stringify(camera));
      assert.ok(Math.abs(camera.x - boundary.camera.x) <= 0.001, JSON.stringify(camera));
      assert.ok(Math.abs(camera.y - boundary.camera.y) <= 0.001, JSON.stringify(camera));
    });

    const activated = await evaluate(browser, boundarySessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var resetCalls = 0;
      var revealCalls = [];
      var originalReset = Archify.view.reset;
      var originalReveal = Archify.view.reveal;
      Archify.view.reset = function () {
        resetCalls += 1;
        return originalReset.apply(Archify.view, arguments);
      };
      Archify.view.reveal = function (ids, options) {
        revealCalls.push({ ids: ids.slice(), reason: options && options.reason });
        return originalReveal.apply(Archify.view, arguments);
      };
      var previousMoving = container.hasAttribute('data-camera-transaction');
      var transactionStarts = previousMoving ? 1 : 0;
      var observer = new MutationObserver(function () {
        var moving = container.hasAttribute('data-camera-transaction');
        if (moving && !previousMoving) transactionStarts += 1;
        previousMoving = moving;
      });
      observer.observe(container, { attributes: true, attributeFilter: ['data-camera-transaction'] });
      document.querySelector('.relationship-lens-row[data-relationship-target="tools"]').click();
      return new Promise(function (resolve) {
        window.setTimeout(function () {
          observer.disconnect();
          Archify.view.reset = originalReset;
          Archify.view.reveal = originalReveal;
          var target = document.querySelector('[data-node-id="tools"]');
          var rect = target.getBoundingClientRect();
          var containerRect = container.getBoundingClientRect();
          var passportRect = document.getElementById('focus-chip').getBoundingClientRect();
          resolve({
            hash: location.hash,
            focused: document.querySelector('.diagram-container > svg').getAttribute('data-focus-active'),
            camera: Archify.view.state(),
            resetCalls: resetCalls,
            revealCalls: revealCalls,
            transactionStarts: transactionStarts,
            moving: container.hasAttribute('data-camera-transaction'),
            overlap: Math.max(0, Math.min(rect.right, passportRect.right) - Math.max(rect.left, passportRect.left)) *
              Math.max(0, Math.min(rect.bottom, passportRect.bottom) - Math.max(rect.top, passportRect.top)),
            visible: rect.left >= containerRect.left - 0.5 && rect.top >= containerRect.top - 0.5 &&
              rect.right <= containerRect.right + 0.5 && rect.bottom <= containerRect.bottom + 0.5
          });
        }, 900);
      });
    })()`, true);
    assert.equal(activated.hash, '#focus=tools', JSON.stringify(activated));
    assert.equal(activated.focused, 'tools', JSON.stringify(activated));
    assert.equal(activated.resetCalls, 0, JSON.stringify(activated));
    assert.deepEqual(activated.revealCalls, [{ ids: ['tools'], reason: 'relationship' }], JSON.stringify(activated));
    assert.equal(activated.transactionStarts, 1, JSON.stringify(activated));
    assert.equal(activated.moving, false, JSON.stringify(activated));
    assert.equal(activated.overlap, 0, JSON.stringify(activated));
    assert.equal(activated.visible, true, JSON.stringify(activated));
  } finally {
    await browser.close();
  }
});

test('relationship hash synchronization owns exactly one camera reveal', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const instrumentation = `<script>
    window.__archifyInitialCameraTransactions = [];
    (function () {
      var originalSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (name === 'data-camera-transaction') {
          window.__archifyInitialCameraTransactions.push(String(value));
        }
        return originalSetAttribute.apply(this, arguments);
      };
    })();
  </script>`;
  const sourceArtifact = renderRelationshipHoverStabilityStress();
  const artifact = path.join(tmp, 'relationship-hash-instrumented.html');
  fs.writeFileSync(
    artifact,
    fs.readFileSync(sourceArtifact, 'utf8').replace('</head>', `${instrumentation}</head>`),
  );
  try {
    let sessionId = await load(browser, artifact, { query: '#relation=agent-tools' });
    await waitForLayout(browser, sessionId);
    const initial = await evaluate(browser, sessionId, `(function () {
      return {
        transactions: window.__archifyInitialCameraTransactions,
        relation: document.querySelector('.diagram-container > svg').getAttribute('data-relationship-pin-active'),
        hash: location.hash
      };
    })()`);
    assert.equal(initial.transactions.length, 1, JSON.stringify(initial));
    assert.ok(initial.relation, JSON.stringify(initial));
    assert.equal(initial.hash, '#relation=agent-tools', JSON.stringify(initial));

    sessionId = await load(browser, artifact);
    await waitForLayout(browser, sessionId);
    await evaluate(browser, sessionId, `(function () {
      window.__archifyInitialCameraTransactions.length = 0;
      location.hash = 'relation=agent-tools';
    })()`);
    await waitForLayout(browser, sessionId);
    const changed = await evaluate(browser, sessionId, `(function () {
      return {
        transactions: window.__archifyInitialCameraTransactions,
        relation: document.querySelector('.diagram-container > svg').getAttribute('data-relationship-pin-active'),
        hash: location.hash
      };
    })()`);
    assert.equal(changed.transactions.length, 1, JSON.stringify(changed));
    assert.ok(changed.relation, JSON.stringify(changed));
    assert.equal(changed.hash, '#relation=agent-tools', JSON.stringify(changed));
  } finally {
    await browser.close();
  }
});

test('relationship click, Enter, and Space activation each reveal exactly once', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const artifact = renderRelationshipHoverStabilityStress();
  async function installProbe(sessionId) {
    await evaluate(browser, sessionId, `(function () {
      var originalReveal = Archify.view.reveal;
      var originalReset = Archify.view.reset;
      window.__archifyActivationProbe = {
        calls: [], resetCalls: 0,
        originalReveal: originalReveal,
        originalReset: originalReset
      };
      Archify.view.reveal = function (ids, options) {
        window.__archifyActivationProbe.calls.push({ ids: ids.slice(), reason: options && options.reason });
        return originalReveal.apply(Archify.view, arguments);
      };
      Archify.view.reset = function () {
        window.__archifyActivationProbe.resetCalls += 1;
        return originalReset.apply(Archify.view, arguments);
      };
    })()`);
  }
  async function collectProbe(sessionId) {
    return evaluate(browser, sessionId, `(function () {
      var probe = window.__archifyActivationProbe;
      Archify.view.reveal = probe.originalReveal;
      Archify.view.reset = probe.originalReset;
      delete window.__archifyActivationProbe;
      return {
        calls: probe.calls,
        resetCalls: probe.resetCalls,
        focused: document.querySelector('.diagram-container > svg').getAttribute('data-focus-active')
      };
    })()`);
  }
  async function activateKey(sessionId, key) {
    const code = key === 'Enter' ? 'Enter' : 'Space';
    const windowsVirtualKeyCode = key === 'Enter' ? 13 : 32;
    await browser.cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key, code, windowsVirtualKeyCode,
    }, sessionId);
    await browser.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key, code, windowsVirtualKeyCode,
    }, sessionId);
  }
  try {
    for (const activation of ['click', 'Enter', ' ']) {
      let sessionId = await load(browser, artifact, { query: `?list=${encodeURIComponent(activation)}` });
      await evaluate(browser, sessionId, `Archify.focus.set('agent-kernel', { toggle: false, updateUrl: false })`);
      await waitForLayout(browser, sessionId);
      await focusSelector(browser, sessionId, '.relationship-lens-row[data-relationship-target="tools"]');
      await installProbe(sessionId);
      if (activation === 'click') {
        await evaluate(browser, sessionId, `document.activeElement.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
      } else {
        await activateKey(sessionId, activation);
      }
      await waitForLayout(browser, sessionId);
      const listReceipt = await collectProbe(sessionId);
      assert.deepEqual(listReceipt.calls, [{ ids: ['tools'], reason: 'relationship' }], JSON.stringify({ activation, listReceipt }));
      assert.equal(listReceipt.resetCalls, 0, JSON.stringify({ activation, listReceipt }));
      assert.equal(listReceipt.focused, 'tools', JSON.stringify({ activation, listReceipt }));

      sessionId = await load(browser, artifact, { query: `?direct=${encodeURIComponent(activation)}` });
      await focusSelector(browser, sessionId, '[data-relationship-hit-key][data-relationship-id="agent-tools"]');
      await installProbe(sessionId);
      if (activation === 'click') {
        await evaluate(browser, sessionId, `document.activeElement.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
      } else {
        await activateKey(sessionId, activation);
      }
      await waitForLayout(browser, sessionId);
      const directReceipt = await collectProbe(sessionId);
      assert.deepEqual(directReceipt.calls, [{
        ids: ['agent-kernel', 'tools'],
        reason: 'relationship-direct'
      }], JSON.stringify({ activation, directReceipt }));
      assert.equal(directReceipt.resetCalls, 0, JSON.stringify({ activation, directReceipt }));
      assert.equal(directReceipt.focused, 'agent-kernel', JSON.stringify({ activation, directReceipt }));
    }
  } finally {
    await browser.close();
  }
});

test('narrow desktop relationship hover stays camera-neutral while reach Details still frame results', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const artifact = renderRelationshipExplorationStress();
  try {
    for (const scenario of [
      { direction: 'out', expectedIds: ['hub', 'out-left'] },
      { direction: 'in', expectedIds: ['hub', 'in-left'] },
    ]) {
      const sessionId = await load(browser, artifact, {
        width: 721,
        height: 700,
        query: `?case=${scenario.direction}`,
      });
      await evaluate(browser, sessionId, `(function () {
        var container = document.querySelector('.diagram-container');
        window.scrollTo(0, Math.max(0, container.offsetTop));
        Archify.focus.set('hub', { toggle: false, updateUrl: false });
      })()`);
      await waitForLayout(browser, sessionId);
      await evaluate(browser, sessionId, `(function () {
        var row = document.querySelector('#relationship-lens-list .relationship-lens-row[data-direction="${scenario.direction}"]');
        if (row && row.offsetParent === null) {
          row.closest('.relationship-lens-group').querySelector('[data-relationship-group-toggle]').click();
        }
      })()`);
      await waitForLayout(browser, sessionId);
      const hoverCameraBaseline = await evaluate(browser, sessionId, `Archify.view.state()`);
      await focusSelector(
        browser,
        sessionId,
        `#relationship-lens-list .relationship-lens-row[data-direction="${scenario.direction}"]`,
      );
      await evaluate(browser, sessionId, `document.activeElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))`);
      const activated = await evaluate(browser, sessionId, `(function () {
        return {
          activeDirection: document.activeElement.getAttribute('data-direction'),
          previewCount: document.querySelectorAll('[data-relationship-preview-node]').length,
          mode: document.getElementById('focus-chip').getAttribute('data-exploration-mode')
        };
      })()`);
      assert.deepEqual(activated, {
        activeDirection: scenario.direction,
        previewCount: 2,
        mode: null,
      }, JSON.stringify({ scenario, activated }));
      await waitForLayout(browser, sessionId);
      const receipt = await highlightedGeometry(browser, sessionId, '[data-node-id][data-relationship-preview-node]');
      assert.deepEqual(receipt.ids, scenario.expectedIds.slice().sort(), JSON.stringify({ scenario, receipt }));
      assert.deepEqual(receipt.camera, hoverCameraBaseline, JSON.stringify({ scenario, receipt }));
    }

    const sessionId = await load(browser, artifact, {
      width: 721,
      height: 700,
      query: '?case=details#focus=hub&reach=downstream',
    });
    await evaluate(browser, sessionId, `document.getElementById('btn-focus-details').click()`);
    await waitForLayout(browser, sessionId);
    const expanded = await highlightedGeometry(browser, sessionId, '[data-node-id][data-reach-match]');
    assert.equal(expanded.expanded, 'true', JSON.stringify(expanded));
    assert.deepEqual(expanded.ids, ['hub', 'out-left', 'out-right']);
    assert.ok(expanded.overlaps.every((area) => area === 0), JSON.stringify(expanded));
    assert.ok(expanded.fullyVisible.every(Boolean), JSON.stringify(expanded));
    assert.equal(expanded.camera.mode, 'semantic', JSON.stringify(expanded));
  } finally {
    await browser.close();
  }
});

test('mobile relationship exploration keeps every result outside compact and expanded Passports', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  const artifact = renderRelationshipExplorationStress();
  function mobileReceiptExpression(matchSelector) {
    return `(function () {
      var passport = document.getElementById('focus-chip');
      var passportRect = passport.getBoundingClientRect();
      var matches = Array.from(document.querySelectorAll(${JSON.stringify(matchSelector)}));
      var containerRect = document.querySelector('.diagram-container').getBoundingClientRect();
      var visible = {
        left: Math.max(0, containerRect.left),
        right: Math.min(window.innerWidth, containerRect.right),
        top: Math.max(0, containerRect.top),
        bottom: Math.min(window.innerHeight, containerRect.bottom)
      };
      function intersectionArea(first, second, gap) {
        return Math.max(0, Math.min(first.right + gap, second.right) - Math.max(first.left - gap, second.left)) *
          Math.max(0, Math.min(first.bottom + gap, second.bottom) - Math.max(first.top - gap, second.top));
      }
      return {
        compact: passport.getAttribute('data-exploration-compact'),
        expanded: passport.getAttribute('data-exploration-expanded'),
        pinActive: document.querySelector('.diagram-container > svg').hasAttribute('data-relationship-pin-active'),
        camera: Archify.view.state(),
        passport: {
          left: passportRect.left, top: passportRect.top,
          right: passportRect.right, bottom: passportRect.bottom
        },
        ids: matches.map(function (node) { return node.getAttribute('data-node-id'); }).sort(),
        nodeRects: matches.map(function (node) {
          var rect = node.getBoundingClientRect();
          return {
            id: node.getAttribute('data-node-id'),
            left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom
          };
        }),
        verticalClear: matches.every(function (node) {
          var rect = node.getBoundingClientRect();
          return rect.bottom <= passportRect.top - 12 || rect.top >= passportRect.bottom + 12;
        }),
        overlaps: matches.map(function (node) {
          return intersectionArea(passportRect, node.getBoundingClientRect(), 12);
        }),
        visibleMatches: matches.filter(function (node) {
          var rect = node.getBoundingClientRect();
          return rect.right > visible.left && rect.left < visible.right && rect.bottom > visible.top && rect.top < visible.bottom;
        }).map(function (node) { return node.getAttribute('data-node-id'); }).sort(),
        fullyVisibleMatches: matches.filter(function (node) {
          var rect = node.getBoundingClientRect();
          return rect.left >= visible.left - 0.5 && rect.top >= visible.top - 0.5 &&
            rect.right <= visible.right + 0.5 && rect.bottom <= visible.bottom + 0.5;
        }).map(function (node) { return node.getAttribute('data-node-id'); }).sort()
      };
    })()`;
  }
  try {
    let sessionId = await load(browser, artifact, { width: 390, height: 700, query: '#focus=hub&reach=upstream' });
    await waitForLayout(browser, sessionId);
    const reach = await evaluate(browser, sessionId, mobileReceiptExpression('[data-node-id][data-reach-match]'));
    assert.equal(reach.compact, 'true', JSON.stringify(reach));
    assert.equal(reach.expanded, null, JSON.stringify(reach));
    assert.deepEqual(reach.ids, ['hub', 'in-left', 'in-right']);
    assert.equal(reach.verticalClear, true, JSON.stringify(reach));
    assert.ok(reach.overlaps.every((area) => area === 0), JSON.stringify(reach));
    assert.deepEqual(reach.visibleMatches, reach.ids, JSON.stringify(reach));
    assert.deepEqual(reach.fullyVisibleMatches, reach.ids, JSON.stringify(reach));
    assert.equal(reach.camera.mode, 'semantic', JSON.stringify(reach));

    await evaluate(browser, sessionId, `document.getElementById('btn-focus-details').click()`);
    await waitForLayout(browser, sessionId);
    const expandedReach = await evaluate(browser, sessionId, mobileReceiptExpression('[data-node-id][data-reach-match]'));
    assert.equal(expandedReach.compact, 'true', JSON.stringify(expandedReach));
    assert.equal(expandedReach.expanded, 'true', JSON.stringify(expandedReach));
    assert.deepEqual(expandedReach.ids, reach.ids, JSON.stringify(expandedReach));
    assert.ok(expandedReach.overlaps.every((area) => area === 0), JSON.stringify(expandedReach));
    assert.deepEqual(expandedReach.fullyVisibleMatches, expandedReach.ids, JSON.stringify(expandedReach));

    await evaluate(browser, sessionId, `document.getElementById('btn-focus-details').click()`);
    await waitForLayout(browser, sessionId);
    const collapsedReach = await evaluate(browser, sessionId, mobileReceiptExpression('[data-node-id][data-reach-match]'));
    assert.equal(collapsedReach.expanded, null, JSON.stringify(collapsedReach));
    assert.ok(collapsedReach.overlaps.every((area) => area === 0), JSON.stringify(collapsedReach));
    assert.deepEqual(collapsedReach.fullyVisibleMatches, collapsedReach.ids, JSON.stringify(collapsedReach));

    sessionId = await load(browser, artifact, { width: 390, height: 700 });
    await evaluate(browser, sessionId, `(function () {
      Archify.focus.set('hub', { toggle: false, updateUrl: false });
      document.getElementById('btn-focus-relations').click();
    })()`);
    await waitForLayout(browser, sessionId);
    const dockSafety = await evaluate(browser, sessionId, `(function () {
      var body = document.getElementById('relationship-lens-body');
      body.scrollTop = body.scrollHeight;
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var passport = document.getElementById('focus-chip');
            var nav = document.querySelector('.diagram-nav');
            var passportRect = passport.getBoundingClientRect();
            var navRect = nav.getBoundingClientRect();
            var controls = Array.from(document.querySelectorAll(
              '#relationship-lens-list [data-relationship-group-toggle], #relationship-lens-list [data-relationship-target]'
            )).filter(function (control) {
              var rect = control.getBoundingClientRect();
              return control.offsetParent !== null && rect.bottom > 0 && rect.top < window.innerHeight;
            }).map(function (control) {
              var rect = control.getBoundingClientRect();
              var x = rect.left + rect.width / 2;
              var y = rect.top + rect.height / 2;
              var hit = document.elementFromPoint(x, y);
              return {
                direction: control.getAttribute('data-relationship-group-toggle') || control.getAttribute('data-direction'),
                ownsCenter: !!(hit && hit.closest('[data-relationship-group-toggle], [data-relationship-target]') === control)
              };
            });
            resolve({
              passportBottom: passportRect.bottom,
              navTop: navRect.top,
              controls: controls,
              incoming: (function () {
                var toggle = document.querySelector('[data-relationship-group-toggle="in"]');
                var rect = toggle.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
              })()
            });
          });
        });
      });
    })()`, true);
    assert.ok(dockSafety.passportBottom <= dockSafety.navTop - 9, JSON.stringify(dockSafety));
    assert.ok(dockSafety.controls.length >= 2, JSON.stringify(dockSafety));
    assert.ok(dockSafety.controls.every((control) => control.ownsCenter), JSON.stringify(dockSafety));
    await browser.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: dockSafety.incoming.x, y: dockSafety.incoming.y, button: 'none', buttons: 0,
    }, sessionId);
    await browser.cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: dockSafety.incoming.x, y: dockSafety.incoming.y,
      button: 'left', buttons: 1, clickCount: 1,
    }, sessionId);
    await browser.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: dockSafety.incoming.x, y: dockSafety.incoming.y,
      button: 'left', buttons: 0, clickCount: 1,
    }, sessionId);
    await waitForLayout(browser, sessionId);
    const physicalToggle = await evaluate(browser, sessionId, `(function () {
      return {
        focused: document.querySelector('.diagram-container > svg').getAttribute('data-focus-active'),
        passportHidden: document.getElementById('focus-chip').hidden,
        incomingExpanded: document.querySelector('[data-relationship-group-toggle="in"]').getAttribute('aria-expanded')
      };
    })()`);
    assert.deepEqual(physicalToggle, {
      focused: 'hub',
      passportHidden: false,
      incomingExpanded: 'true'
    }, JSON.stringify(physicalToggle));
    const previewCameraBaseline = await evaluate(browser, sessionId, `Archify.view.state()`);
    await focusSelector(
      browser,
      sessionId,
      '#relationship-lens-list .relationship-lens-row[data-direction="in"]',
    );
    await evaluate(browser, sessionId, `document.activeElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))`);
    const previewActivated = await evaluate(browser, sessionId, `(function () {
      return {
        activeDirection: document.activeElement.getAttribute('data-direction'),
        previewCount: document.querySelectorAll('[data-relationship-preview-node]').length,
        mode: document.getElementById('focus-chip').getAttribute('data-exploration-mode')
      };
    })()`);
    assert.deepEqual(previewActivated, { activeDirection: 'in', previewCount: 2, mode: null });
    await waitForLayout(browser, sessionId);
    const preview = await evaluate(browser, sessionId, mobileReceiptExpression('[data-node-id][data-relationship-preview-node]'));
    const previewControls = await evaluate(browser, sessionId, `(function () {
      var reach = document.getElementById('focus-reach');
      return {
        reachVisible: !reach.hidden && getComputedStyle(reach).display !== 'none',
        detailsHidden: document.getElementById('btn-focus-details').hidden
      };
    })()`);
    assert.equal(preview.compact, null, JSON.stringify(preview));
    assert.deepEqual(preview.ids, ['hub', 'in-left']);
    assert.deepEqual(preview.camera, previewCameraBaseline, JSON.stringify(preview));
    assert.equal(previewControls.reachVisible, true, JSON.stringify(previewControls));
    assert.equal(previewControls.detailsHidden, true, JSON.stringify(previewControls));
    const listActivation = await evaluate(browser, sessionId, `(function () {
      var container = document.querySelector('.diagram-container');
      var row = document.activeElement;
      var targetId = row.getAttribute('data-relationship-target');
      var originalReset = Archify.view.reset;
      var originalReveal = Archify.view.reveal;
      var resetCalls = 0;
      var revealCalls = [];
      var transactionStarts = 0;
      var previousMoving = container.hasAttribute('data-camera-transaction');
      Archify.view.reset = function () {
        resetCalls += 1;
        return originalReset.apply(Archify.view, arguments);
      };
      Archify.view.reveal = function (ids, options) {
        revealCalls.push({ ids: ids.slice(), reason: options && options.reason });
        return originalReveal.apply(Archify.view, arguments);
      };
      var observer = new MutationObserver(function () {
        var moving = container.hasAttribute('data-camera-transaction');
        if (moving && !previousMoving) transactionStarts += 1;
        previousMoving = moving;
      });
      observer.observe(container, { attributes: true, attributeFilter: ['data-camera-transaction'] });
      row.click();
      return new Promise(function (resolve) {
        window.setTimeout(function () {
          observer.disconnect();
          Archify.view.reset = originalReset;
          Archify.view.reveal = originalReveal;
          var target = document.querySelector('[data-node-id="' + targetId + '"]');
          var targetRect = target.getBoundingClientRect();
          var passportRect = document.getElementById('focus-chip').getBoundingClientRect();
          var containerRect = container.getBoundingClientRect();
          var overlap = Math.max(0, Math.min(targetRect.right, passportRect.right) - Math.max(targetRect.left, passportRect.left)) *
            Math.max(0, Math.min(targetRect.bottom, passportRect.bottom) - Math.max(targetRect.top, passportRect.top));
          resolve({
            targetId: targetId,
            focused: document.querySelector('.diagram-container > svg').getAttribute('data-focus-active'),
            resetCalls: resetCalls,
            revealCalls: revealCalls,
            transactionStarts: transactionStarts,
            relationsExpanded: document.getElementById('focus-chip').getAttribute('data-relations-expanded'),
            overlap: overlap,
            fullyVisible: targetRect.left >= containerRect.left - 0.5 && targetRect.top >= containerRect.top - 0.5 &&
              targetRect.right <= containerRect.right + 0.5 && targetRect.bottom <= containerRect.bottom + 0.5
          });
        }, 900);
      });
    })()`, true);
    assert.equal(listActivation.focused, listActivation.targetId, JSON.stringify(listActivation));
    assert.equal(listActivation.resetCalls, 0, JSON.stringify(listActivation));
    assert.deepEqual(listActivation.revealCalls, [{
      ids: [listActivation.targetId],
      reason: 'relationship'
    }], JSON.stringify(listActivation));
    assert.equal(listActivation.transactionStarts, 1, JSON.stringify(listActivation));
    assert.equal(listActivation.relationsExpanded, null, JSON.stringify(listActivation));
    assert.equal(listActivation.overlap, 0, JSON.stringify(listActivation));
    assert.equal(listActivation.fullyVisible, true, JSON.stringify(listActivation));

    sessionId = await load(browser, artifact, { width: 390, height: 700 });
    await evaluate(browser, sessionId, `(function () {
      Archify.focus.set('hub', { toggle: false, updateUrl: false });
      document.getElementById('btn-focus-relations').click();
    })()`);
    await waitForLayout(browser, sessionId);
    const hoverTransition = await evaluate(browser, sessionId, `(function () {
      var row = document.querySelector('#relationship-lens-list .relationship-lens-row[data-direction="out"]');
      var rect = row.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        camera: Archify.view.state()
      };
    })()`);
    await browser.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: hoverTransition.x, y: hoverTransition.y, button: 'none', buttons: 0,
    }, sessionId);
    await waitForLayout(browser, sessionId);
    await focusSelector(
      browser,
      sessionId,
      '#relationship-lens-list .relationship-lens-row[data-direction="out"]',
    );
    await browser.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: 389, y: 699, button: 'none', buttons: 0,
    }, sessionId);
    await waitForLayout(browser, sessionId);
    const focusAfterHover = await evaluate(browser, sessionId,
      mobileReceiptExpression('[data-node-id][data-relationship-preview-node]'));
    assert.deepEqual(focusAfterHover.ids, ['hub', 'out-left']);
    assert.deepEqual(focusAfterHover.camera, hoverTransition.camera, JSON.stringify(focusAfterHover));

    sessionId = await load(browser, artifact, { width: 390, height: 700 });
    const keyboardStart = await evaluate(browser, sessionId, `(function () {
      var targets = Array.from(document.querySelectorAll('[data-relationship-hit-key]'));
      var start = targets.find(function (target) { return target.getAttribute('tabindex') === '0'; });
      var target = document.querySelector('[data-relationship-hit-key][data-relationship-id="hub-out-left"]');
      start.focus({ preventScroll: true });
      return {
        steps: (targets.indexOf(target) - targets.indexOf(start) + targets.length) % targets.length,
        startId: start.getAttribute('data-relationship-id'),
        targetId: target.getAttribute('data-relationship-id')
      };
    })()`);
    for (let index = 0; index < keyboardStart.steps; index += 1) {
      await browser.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39,
      }, sessionId);
      await browser.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39,
      }, sessionId);
    }
    const roved = await evaluate(browser, sessionId, `document.activeElement.getAttribute('data-relationship-id')`);
    assert.equal(roved, keyboardStart.targetId, JSON.stringify({ keyboardStart, roved }));
    await browser.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
    }, sessionId);
    await browser.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
    }, sessionId);
    await waitForLayout(browser, sessionId);
    const keyReceipt = await evaluate(browser, sessionId, `(function () {
      var target = document.querySelector('[data-relationship-hit-key][data-relationship-id="hub-out-left"]');
      return { activeId: document.activeElement.getAttribute('data-relationship-id'), pressed: target.getAttribute('aria-pressed') };
    })()`);
    assert.equal(keyReceipt.activeId, 'hub-out-left', JSON.stringify(keyReceipt));
    assert.equal(keyReceipt.pressed, 'true', JSON.stringify(keyReceipt));
    const relation = await evaluate(browser, sessionId, mobileReceiptExpression('[data-node-id][data-relationship-preview-node]'));
    assert.equal(relation.compact, 'true', JSON.stringify(relation));
    assert.equal(relation.pinActive, true, JSON.stringify(relation));
    assert.deepEqual(relation.ids, ['hub', 'out-left']);
    assert.equal(relation.verticalClear, true, JSON.stringify(relation));
    assert.ok(relation.overlaps.every((area) => area === 0), JSON.stringify(relation));
    assert.deepEqual(relation.visibleMatches, relation.ids, JSON.stringify(relation));
    assert.deepEqual(relation.fullyVisibleMatches, relation.ids, JSON.stringify(relation));
  } finally {
    await browser.close();
  }
});

test('mobile, embed, and print keep zero reserve while hidden Legends retain the stage rail', {
  skip: chromePath ? false : 'Set ARCHIFY_CHROME to run the real browser regression.',
}, async () => {
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    let sessionId = await load(browser, render('architecture', CASES.architecture), { width: 720, height: 900 });
    let receipt = await finalGeometry(browser, sessionId);
    assert.equal(receipt.reserve, 0, `mobile: ${JSON.stringify(receipt)}`);
    assert.equal(receipt.legendDockIntersectionArea, 0, `mobile: ${JSON.stringify(receipt)}`);

    sessionId = await load(browser, render('architecture', CASES.architecture), { query: '?embed=1' });
    receipt = await finalGeometry(browser, sessionId);
    assert.equal(receipt.reserve, 0, `embed: ${JSON.stringify(receipt)}`);

    sessionId = await load(browser, render('architecture', CASES.architecture));
    await evaluate(browser, sessionId, `(function () {
      document.querySelector('[data-legend]').hidden = true;
      window.dispatchEvent(new Event('resize'));
    })()`);
    await waitForLayout(browser, sessionId);
    receipt = await finalGeometry(browser, sessionId);
    assert.ok(receipt.reserve > 0, `hidden: ${JSON.stringify(receipt)}`);
    assert.ok(receipt.stageGap >= 9, `hidden: ${JSON.stringify(receipt)}`);

    await browser.cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
    await waitForLayout(browser, sessionId);
    receipt = await finalGeometry(browser, sessionId);
    assert.equal(receipt.reserve, 0, `print: ${JSON.stringify(receipt)}`);
  } finally {
    await browser.close();
  }
});

process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
