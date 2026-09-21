import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';
import { capacityCases, browserCases, controlCases } from './fixtures/content-canvas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.ARCHIFY_CHROME ? findChrome() : null;

function rendered(source, scratch, name, rendererRoot = root) {
  const input = path.join(scratch, `${name}.json`), output = path.join(scratch, `${name}.html`);
  fs.writeFileSync(input, JSON.stringify(source));
  execFileSync(process.execPath, [path.join(rendererRoot, 'bin/archify.mjs'), 'render', source.diagram_type, input, output], { stdio:'pipe' });
  return output;
}

// Independent oracle: native glyph/shape bounds and the actual marker DOM,
// not the compiler's receipt or getBBox options that Chromium may ignore.
const paintedBounds = `(() => {
  const live = document.querySelector('.diagram-container > svg');
  const svg = live.cloneNode(true);
  svg.removeAttribute('style');
  svg.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none';
  svg.querySelectorAll('[data-relationship-hit-overlay],[data-intent-trace-overlay],[data-legend-hit], [data-legend-count]').forEach(e => e.remove());
  document.body.appendChild(svg);
  const frame = svg.viewBox.baseVal;
  const failures = [];
  let count = 0;
  function check(element, x, y, width, height) {
    const matrix = svg.getCTM().inverse().multiply(element.getCTM());
    const points = [[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(([px,py]) => new DOMPoint(px,py).matrixTransform(matrix));
    if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -0.1 || p.y < -0.1 || p.x > frame.width + 0.1 || p.y > frame.height + 0.1)) {
      failures.push({ tag: element.tagName, text: element.textContent, id: element.getAttribute('data-edge-id'), points: points.map(p => [p.x,p.y]), frame: [frame.width,frame.height] });
    }
  }
  try {
    for (const element of svg.querySelectorAll('rect,path,line,polyline,polygon,circle,ellipse,text')) {
      if (element.closest('defs,marker,pattern,clipPath,mask')) continue;
      element.style.display = 'inline';
      const box = element.getBBox();
      const style = getComputedStyle(element);
      const stroke = style.stroke !== 'none' ? Number.parseFloat(style.strokeWidth) || 0 : 0;
      check(element, box.x - stroke / 2, box.y - stroke / 2, box.width + stroke, box.height + stroke);
      count++;
      const markerId = element.getAttribute('marker-end')?.match(/#([^)]*)/)?.[1];
      if (markerId && typeof element.getTotalLength === 'function') {
        const marker = svg.querySelector('[id="' + markerId + '"]');
        const polygon = marker?.querySelector('polygon');
        const length = element.getTotalLength();
        const end = element.getPointAtLength(length), before = element.getPointAtLength(Math.max(0,length-0.001));
        const angle = Math.atan2(end.y-before.y,end.x-before.x);
        const scale = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : stroke;
        for (const point of Array.from(polygon.points)) {
          const mx = point.x - marker.refX.baseVal.value, my = point.y - marker.refY.baseVal.value;
          check(element, end.x + scale*(mx*Math.cos(angle)-my*Math.sin(angle)), end.y + scale*(mx*Math.sin(angle)+my*Math.cos(angle)), 0, 0);
        }
      }
    }
    return { count, failures };
  } finally { svg.remove(); }
})()`;

test('all frozen capacity examples contain independently measured browser paint', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME for native paint checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-content-paint-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const baseline = process.env.ARCHIFY_CONTENT_BASELINE_ROOT;
  const baselineRecords = [];
  const contentControls = Object.fromEntries(Object.entries(controlCases).map(([name, source]) => {
    const content = structuredClone(source);
    content.meta.canvas_fit = 'content';
    // These are implicit-mode compatibility controls, matching the static
    // matrix; fixed-capacity rejection/repair has its own public CLI cases.
    delete content.meta.viewBox;
    return [`control-${name}`, content];
  }));
  for (const [name, source] of Object.entries({ ...capacityCases, ...contentControls })) {
    const artifactPath = rendered(source, scratch, name);
    await browser.inspect({ artifactPath, width: 1440, height: 900, theme: 'light' });
    const result = await browser.cdp.send('Runtime.evaluate', { expression: paintedBounds, returnByValue: true }, session);
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    assert.ok(result.result.value.count > 0, name);
    assert.deepEqual(result.result.value.failures, [], name);
    if (baseline && Object.hasOwn(capacityCases, name)) {
      const before=structuredClone(source);delete before.meta.canvas_fit;
      let oldArtifact;
      try { oldArtifact=rendered(before,scratch,`${name}-baseline`,path.join(baseline,'archify')); }
      catch(error) {
        assert.equal(error.status,1);
        baselineRecords.push({name,type:source.diagram_type,baseline:'rejected',stderr:String(error.stderr)});
        continue;
      }
      await browser.inspect({artifactPath:oldArtifact,width:1440,height:900,theme:'light'});
      const old=await browser.cdp.send('Runtime.evaluate',{expression:paintedBounds,returnByValue:true},session);
      assert.equal(old.exceptionDetails,undefined,old.exceptionDetails?.exception?.description);
      baselineRecords.push({name,type:source.diagram_type,baseline:old.result.value.failures.length?'clipped':'already-contained',paint:old.result.value});
    }
  }
  if(baseline) {
    if(process.env.ARCHIFY_CONTENT_EVIDENCE)fs.writeFileSync(path.join(process.env.ARCHIFY_CONTENT_EVIDENCE,'baseline-paint.json'),JSON.stringify(baselineRecords,null,2));
    for(const type of ['architecture','dataflow','sequence','lifecycle']) {
      assert.ok(baselineRecords.filter(r=>r.type===type&&r.baseline!=='already-contained').length>=3,JSON.stringify(baselineRecords));
    }
  }
});

test('four content canvases retain exhaustive desktop navigation and canonical export', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME for complete reader checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-content-reader-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const evidence = process.env.ARCHIFY_CONTENT_EVIDENCE;
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const observations = [];
  t.after(() => { if (evidence) fs.writeFileSync(path.join(evidence, 'desktop.json'), JSON.stringify(observations, null, 2)); });
  for (const [type, source] of Object.entries(browserCases)) {
    const artifactPath = rendered(source, scratch, type);
    for (const [width, height] of [[1440,900],[1600,1000],[1920,1080],[2048,1320]]) {
      for (const theme of ['light', 'dark']) {
        const metrics = await browser.inspect({ artifactPath, width, height, theme,
          ...(evidence && width === 1440 ? { screenshotPath: path.join(evidence, `${type}-${theme}.png`) } : {}) });
        const audit = await browser.auditCanonicalWorld();
        observations.push({ type, width, height, theme, metrics, audit });
        assert.ok(metrics.scrollWidth <= width && metrics.scrollHeight <= height,
          `${type} ${width} ${theme}: page overflow ${JSON.stringify(metrics)}`);
        assert.ok(metrics.minimumProjectedNodeTextPx >= 6 - 0.001, `${type}: entry text ${JSON.stringify(metrics)}`);
        assert.ok(metrics.dockStageIntersectionArea <= 1 && metrics.legendDockIntersectionArea <= 1, `${type}: dock clearance`);
        assert.equal(audit.worldReachability.status, 'pass', `${type} ${width} ${theme}: ${JSON.stringify(audit)}`);
        assert.equal(audit.worldReachability.auditMode, 'exhaustive-navigation');
        assert.equal(audit.worldReachability.reachedNodeCount, source.components?.length || source.nodes?.length || source.participants?.length || source.states.length);
        assert.equal(audit.exportCompleteness.status, 'pass', JSON.stringify(audit));
      }
    }
  }
});

test('four content canvases preserve narrow-screen selection and real raster export budgets', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME for mobile and raster checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-content-export-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const observations = [];
  t.after(() => {
    if (process.env.ARCHIFY_CONTENT_EVIDENCE) fs.writeFileSync(path.join(process.env.ARCHIFY_CONTENT_EVIDENCE, 'mobile-export.json'), JSON.stringify(observations, null, 2));
  });
  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const evaluate = async (expression) => {
    const result = await browser.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  };
  await browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
  for (const [type, source] of Object.entries(browserCases)) {
    const artifactPath = rendered(source, scratch, type);
    for (const [width, height] of [[390,844], [844,390]]) {
      await browser.inspect({ artifactPath, width, height, theme: 'light' });
      const selection = await evaluate(`(async () => {
        const svg = document.querySelector('.diagram-container > svg');
        const canonical = svg.getAttribute('viewBox');
        const nodes = [...svg.querySelectorAll('[data-node-id]')];
        const reached = [];
        for (const node of [nodes[0], nodes.at(-1)]) {
          Archify.focus.clear({updateUrl:false});
          Archify.finder.open();
          const input = document.getElementById('node-finder-input');
          input.value = node.getAttribute('data-node-id');
          input.dispatchEvent(new Event('input', {bubbles:true}));
          const found = document.querySelector('#node-finder-results button');
          if (!found) throw new Error('Node is not searchable');
          found.click();
          // Portrait keeps ordinary vertical document scrolling. Exercise
          // that supported reading path, not an invented mobile camera.
          node.scrollIntoView({block:'center',inline:'center'});
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const finder = document.getElementById('node-finder');
          const chip = document.getElementById('focus-chip');
          const box = chip.getBoundingClientRect();
          const clear = document.getElementById('btn-focus-clear');
          const button = clear.getBoundingClientRect();
          const hit = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2);
          const observation = {id:node.getAttribute('data-node-id'),selected:Archify.focus.active(),finderClosed:finder.hidden,
            passportVisible:!chip.hidden, passportInside:box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1,
            closeReachable:!!hit && clear.contains(hit)};
          clear.click();
          observation.closed = chip.hidden;
          reached.push(observation);
        }
        return {canonical,after:svg.getAttribute('viewBox'),reached,overflow:document.documentElement.scrollWidth > innerWidth,
          camera:Archify.view.state(),preset:document.documentElement.getAttribute('data-preset')};
      })()`);
      assert.equal(selection.canonical, selection.after);
      assert.equal(selection.overflow, false, `${type} ${width}`);
      assert.ok(selection.reached.every((node) => node.id === node.selected && node.finderClosed), JSON.stringify(selection));
      assert.ok(selection.reached.every((node) => node.passportVisible && node.passportInside && node.closeReachable && node.closed), JSON.stringify(selection));
      observations.push({type,kind:'mobile',width,height,theme:'light',...selection});
    }
    await browser.inspect({ artifactPath, width:1440, height:900, theme:'dark' });
    for (const format of ['png','jpeg','webp']) {
      const result = await evaluate(`(async () => {
        const create = URL.createObjectURL;
        const click = HTMLAnchorElement.prototype.click;
        let output;
        URL.createObjectURL = function(blob) { if(blob.type.startsWith('image/') && !blob.type.includes('svg')) output=blob; return create.call(this,blob); };
        HTMLAnchorElement.prototype.click = function() {};
        try {
          await Archify.exportMenu.run(${JSON.stringify(format)});
          if (!output) throw new Error('No raster output');
          const decoded = await createImageBitmap(output);
          const canvas = document.createElement('canvas'); canvas.width=16; canvas.height=16;
          const context=canvas.getContext('2d');context.drawImage(decoded,0,0,16,16);
          const pixels=[...context.getImageData(0,0,16,16).data];
          const result={type:output.type,bytes:output.size,width:decoded.width,height:decoded.height,nonempty:pixels.some((v,i)=>i%4===3 && v>0),varied:new Set(pixels).size>5};
          decoded.close();return result;
        } finally {URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
      })()`);
      assert.equal(result.type, `image/${format}`);
      assert.ok(result.bytes > 0 && result.width * result.height <= 16000000 && result.nonempty && result.varied, `${type} ${format}: ${JSON.stringify(result)}`);
      observations.push({...result,type,kind:'raster',format,mimeType:result.type});
    }
    const rejected = await evaluate(`(async () => {
      // Controlled export-only capacity fixture; not a rendering success case.
      const svg=document.querySelector('.diagram-container > svg'), original=svg.getAttribute('viewBox');
      const create=Document.prototype.createElement, alert=window.alert;
      let allocations=0, alerts=[];
      Document.prototype.createElement=function(name,...args){if(name==='canvas')allocations++;return create.call(this,name,...args);};
      window.alert=message=>alerts.push(message);
      svg.setAttribute('viewBox','0 0 5000 100000');
      try {
        const outcomes=[];
        for(const format of ['png','jpeg','webp']) {
          await Archify.exportMenu.run(format);
          outcomes.push({format,fallback:document.documentElement.getAttribute('data-last-export-fallback'),scale:document.documentElement.getAttribute('data-last-export-actual-scale')});
        }
        const stillGate=Archify.motion.canRecord();
        svg.setAttribute('data-animation','trace');
        const webm=await Archify.motion.recordWebm({duration:250,fps:10}).then(()=>null,error=>error.code);
        return {allocations,alerts,outcomes,webm,stillGate};
      } finally {Document.prototype.createElement=create;window.alert=alert;svg.setAttribute('viewBox',original);svg.removeAttribute('data-animation');}
    })()`);
    assert.equal(rejected.allocations, 0, type);
    assert.equal(rejected.stillGate, false, type);
    assert.equal(rejected.alerts.length, 3, type);
    assert.ok(rejected.outcomes.every((r) => r.fallback === 'svg' && r.scale === 'none'), JSON.stringify(rejected));
    assert.equal(rejected.webm, 'export/raster-budget-exceeded', type);
    observations.push({type,kind:'budget',...rejected});
  }
});
