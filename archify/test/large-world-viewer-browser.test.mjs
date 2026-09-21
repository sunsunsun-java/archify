import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.ARCHIFY_CHROME ? findChrome() : null;

test('shared large-world Viewer provides a fixed readable stage for all five diagram types', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME to run the required large-world browser contract.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-large-world-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

  function artifact(type, example, suffix, worldWidth, worldHeight) {
    const output = path.join(scratch, `${type}-${suffix}.html`);
    execFileSync(process.execPath, [
      path.join(skillRoot, `renderers/${type}/render-${type}.mjs`),
      path.join(skillRoot, 'examples', example),
      output,
    ]);
    if (worldWidth) {
      const source = fs.readFileSync(output, 'utf8').replace(
        /(<svg\b[^>]*\bviewBox=")[^"]+("[^>]*>)/,
        (_, before, after) => `${before}0 0 ${worldWidth} ${worldHeight}${after}`,
      );
      fs.writeFileSync(output, source);
    }
    return output;
  }

  const fixtures = {
    architecture: {
      small: artifact('architecture', 'web-app.architecture.json', 'small'),
      large100: artifact('architecture', 'web-app.architecture.json', '100', 6000, 3000),
      large300: artifact('architecture', 'web-app.architecture.json', '300', 12000, 6000),
    },
    workflow: {
      small: artifact('workflow', 'agent-tool-call.workflow.json', 'small'),
      large100: artifact('workflow', 'agent-tool-call.workflow.json', '100', 6000, 3000),
      large300: artifact('workflow', 'agent-tool-call.workflow.json', '300', 12000, 6000),
    },
    dataflow: {
      small: artifact('dataflow', 'event-stream.dataflow.json', 'small'),
      large100: artifact('dataflow', 'event-stream.dataflow.json', '100', 6000, 3000),
      large300: artifact('dataflow', 'event-stream.dataflow.json', '300', 12000, 6000),
    },
    sequence: {
      small: artifact('sequence', 'cache-miss-request.sequence.json', 'small'),
      large100: artifact('sequence', 'cache-miss-request.sequence.json', '100', 6000, 3000),
      large300: artifact('sequence', 'cache-miss-request.sequence.json', '300', 12000, 6000),
    },
    lifecycle: {
      small: artifact('lifecycle', 'agent-run.lifecycle.json', 'small'),
      large100: artifact('lifecycle', 'agent-run.lifecycle.json', '100', 6000, 3000),
      large300: artifact('lifecycle', 'agent-run.lifecycle.json', '300', 12000, 6000),
    },
  };

  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ] });

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  let loadSequence = 0;
  async function load(file, hash = '') {
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    const result = await send('Page.navigate', {
      url: pathToFileURL(file).href + '?theme=light&load=' + (++loadSequence) + hash,
    });
    assert.equal(result.errorText, undefined);
    await loaded;
    await evaluate(`(async()=>{
      await document.fonts.ready;
      await Archify.readerLayout.whenStable();
      await Archify.viewerChromeLayout.whenStable();
      for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);
    })()`);
  }
  async function snapshot() {
    return evaluate(`(()=>{
      const html=document.documentElement,diagram=document.querySelector('.diagram-container'),svg=diagram.querySelector(':scope > svg');
      const receipt=Archify.readerLayout.receipt(),state=Archify.view.state(),vb=svg.viewBox.baseVal;
      const entry=(diagram.getAttribute('data-automatic-entry')||'').split(/\\s+/).filter(Boolean);
      const labels=entry.map(id=>{const node=[...svg.querySelectorAll('[data-node-id]')].find(n=>n.getAttribute('data-node-id')===id);return node&&(node.querySelector('text[data-node-label]')||node.querySelector('text'));}).filter(Boolean);
      const sourceFont=labels.length?Math.min(...labels.map(label=>parseFloat(getComputedStyle(label).fontSize))):0;
      const fit=Math.min(svg.clientWidth/vb.width,svg.clientHeight/vb.height);
      const rect=diagram.getBoundingClientRect(),cards=document.querySelector('.cards')?.getBoundingClientRect();
      const sr=svg.getBoundingClientRect(),matrix=svg.getScreenCTM();
      const origin=new DOMPoint(vb.x,vb.y).matrixTransform(matrix),end=new DOMPoint(vb.x+vb.width,vb.y+vb.height).matrixTransform(matrix);
      const safe={left:sr.left-state.x,top:sr.top-state.y,width:svg.clientWidth,height:svg.clientHeight};
      return {receipt,state,viewBox:[vb.x,vb.y,vb.width,vb.height],entry,projectedEntryPx:sourceFont*fit*state.scale,
        world:{left:origin.x,right:end.x,top:origin.y,bottom:end.y},safe,
        client:[diagram.clientWidth,diagram.clientHeight],rect:{top:rect.top,bottom:rect.bottom},cards:cards&&{top:cards.top,bottom:cards.bottom},
        scroll:[html.scrollWidth,html.scrollHeight,innerWidth,innerHeight],diagnostic:diagram.getAttribute('data-camera-diagnostic')};
    })()`);
  }

  for (const [type, set] of Object.entries(fixtures)) {
    await load(set.small);
    if (type === 'architecture' || type === 'workflow') {
      assert.equal((await snapshot()).receipt.worldProfile, 'small', `${type} control`);
    }

    const stages = [];
    for (const key of ['large100', 'large300']) {
      await load(set[key]);
      const current = await snapshot();
      assert.equal(current.receipt.worldProfile, 'large', `${type} ${key}`);
      assert.ok(current.state.scale > 3, `${type} ${key} dynamic scale: ${JSON.stringify(current)}`);
      assert.ok(current.projectedEntryPx >= 6, `${type} ${key} readable entry: ${JSON.stringify(current)}`);
      assert.ok(current.entry.length > 0, `${type} ${key} deterministic entry`);
      assert.ok(current.world.left <= current.safe.left + 2 && current.world.right >= current.safe.left + current.safe.width - 2,
        `${type} ${key} wide world must cover the horizontal viewport: ${JSON.stringify(current)}`);
      assert.equal(current.diagnostic, null);
      assert.ok(current.scroll[0] <= current.scroll[2] && current.scroll[1] <= current.scroll[3], `${type} ${key} containment`);
      assert.ok(current.rect.bottom <= current.scroll[3] + 1);
      assert.ok(!current.cards || current.cards.bottom <= current.scroll[3] + 1);
      assert.ok(Math.abs(current.client[1] - current.receipt.stageHeight) <= 2);
      stages.push(current.client);
      const canonical = current.viewBox;
      await evaluate('Archify.view.reset()');
      const reset = await snapshot();
      assert.equal(reset.state.scale, 1);
      assert.deepEqual(reset.viewBox, canonical);
    }
    assert.ok(Math.abs(stages[0][0] - stages[1][0]) <= 1, `${type} fixed width`);
    assert.ok(Math.abs(stages[0][1] - stages[1][1]) <= 1, `${type} fixed height`);
  }

  await load(fixtures.architecture.large300, '#focus=api');
  const deepLink = await snapshot();
  assert.equal(deepLink.entry.length, 0, 'explicit deep link suppresses automatic entry');
  assert.equal(await evaluate('Archify.focus.active()'), 'api');

  await load(fixtures.architecture.large300, '#focus=missing-node');
  const invalidDeepLink = await snapshot();
  assert.equal(invalidDeepLink.entry.length, 0, 'an invalid explicit deep link does not select another semantic target');
  assert.equal(invalidDeepLink.state.scale, 1, 'an invalid explicit deep link falls back to the complete world');
  assert.equal(invalidDeepLink.diagnostic, 'viewer/semantic-id-invalid');
  assert.equal(await evaluate('Archify.focus.active()'), null);

  await load(fixtures.architecture.small);
  const validAudit = await browser.auditCanonicalWorld();
  assert.equal(validAudit.worldReachability.status, 'pass', JSON.stringify(validAudit));
  await evaluate(`(()=>{
    const svg=document.querySelector('.diagram-container > svg');
    const node=svg.querySelector('[data-node-id]');
    svg.appendChild(node.cloneNode(true));
  })()`);
  const duplicateAudit = await browser.auditCanonicalWorld();
  assert.equal(duplicateAudit.worldReachability.status, 'fail');
  assert.ok(duplicateAudit.diagnostics.some((entry) => entry.code === 'viewer/semantic-id-invalid'));

  await load(fixtures.architecture.small);
  await evaluate(`(()=>{
    const svg=document.querySelector('.diagram-container > svg');
    const edge=svg.querySelector('path[data-edge-key]');
    edge.removeAttribute('data-edge-to');
  })()`);
  const endpointAudit = await browser.auditCanonicalWorld();
  assert.equal(endpointAudit.worldReachability.status, 'fail');
  assert.ok(endpointAudit.diagnostics.some((entry) => entry.code === 'viewer/semantic-endpoint-invalid'));
});

test('automatic entry frames the painted world rather than centering its first participant in letterbox space', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME to run automatic entry framing regression.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-entry-framing-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const input = path.join(scratch, 'sequence.json');
  const output = path.join(scratch, 'sequence.html');
  const spec = {
    schema_version: 1, diagram_type: 'sequence',
    meta: { title: 'Long request trace', output: 'trace.html', canvas_fit: 'content', column_fit: 'spread' },
    participants: Array.from({ length: 7 }, (_, i) => ({ id: `actor-${i}`, type: 'backend', label: `Actor ${i}`, sublabel: 'request context' })),
    messages: Array.from({ length: 26 }, (_, i) => ({ id: `step-${i}`, from: `actor-${i % 6}`, to: `actor-${i % 6 + 1}`, label: 'request', y: 180 + i * 50 })),
  };
  fs.writeFileSync(input, JSON.stringify(spec));
  execFileSync(process.execPath, [path.join(skillRoot, 'bin/archify.mjs'), 'render', 'sequence', input, output]);
  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  async function evaluate(expression) {
    const result = await browser.cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result.value;
  }
  for (const [width, height] of [[1440, 900], [1600, 1000], [1920, 1080], [2048, 1320]]) {
    for (const theme of ['light', 'dark']) {
      await browser.inspect({ artifactPath: output, width, height, theme });
      const result = await evaluate(`(() => {
        const svg = document.querySelector('.diagram-container > svg'), vb = svg.viewBox.baseVal;
        const matrix = svg.getScreenCTM(), camera = Archify.view.state();
        const a = new DOMPoint(vb.x, vb.y).matrixTransform(matrix);
        const b = new DOMPoint(vb.x + vb.width, vb.y + vb.height).matrixTransform(matrix);
        // Recover the untransformed SVG content viewport; the camera scales
        // the letterboxed SVG element, not just its canonical painted world.
        const rect = svg.getBoundingClientRect();
        const safe = { left: rect.left - camera.x, top: rect.top - camera.y,
          width: svg.clientWidth, height: svg.clientHeight };
        const nodes = [...svg.querySelectorAll('[data-node-id]')].map(node => {
          const r = node.getBoundingClientRect();
          return { id: node.dataset.nodeId, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
        return { camera, safe, world: { left: a.x, right: b.x, top: a.y, bottom: b.y }, nodes,
          entry: document.querySelector('.diagram-container').getAttribute('data-automatic-entry') };
      })()`);
      const label = `${width} ${theme}: ${JSON.stringify(result)}`;
      assert.equal(result.entry, 'actor-0', label);
      assert.ok(result.camera.scale > 1, label);
      assert.ok(result.world.right - result.world.left <= result.safe.width, 'all seven columns can fit at the readable entry scale');
      assert.ok(result.world.left >= result.safe.left - 2, label);
      assert.ok(result.world.right <= result.safe.left + result.safe.width + 2, label);
      for (const node of result.nodes) {
        assert.ok(node.left >= result.safe.left - 2 && node.right <= result.safe.left + result.safe.width + 2, label);
        assert.ok(node.top >= result.safe.top - 2 && node.bottom <= result.safe.top + result.safe.height + 2, label);
      }
      assert.ok(result.world.top <= result.safe.top + 2 && result.world.bottom >= result.safe.top + result.safe.height - 2,
        'the long axis covers the viewport without losing the opening participants');
      const audit = await browser.auditCanonicalWorld();
      assert.equal(audit.worldReachability.status, 'pass', JSON.stringify(audit));
      assert.equal(audit.exportCompleteness.status, 'pass', JSON.stringify(audit));
      await evaluate('Archify.view.reset()');
      assert.equal(await evaluate('Archify.view.state().scale'), 1, 'reset still shows the complete world');
    }
  }
});
