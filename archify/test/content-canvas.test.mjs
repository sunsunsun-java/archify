import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'parse5';
import { capacityCases, controlCases, browserCases } from './fixtures/content-canvas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assertSemanticPreservation(source, html) {
  const elements=[];
  const walk=node=>{elements.push(node);for(const child of node.childNodes||[])walk(child);};
  walk(parse(html));
  const attributes=node=>Object.fromEntries((node.attrs||[]).map(a=>[a.name,a.value]));
  const entities=source.components||source.nodes||source.participants||source.states;
  const nodes=elements.map(attributes).filter(a=>a['data-node-id']!==undefined);
  assert.deepEqual(nodes.map(a=>a['data-node-id']),entities.map(entity=>entity.id));
  assert.deepEqual(nodes.map(a=>a['data-node-kind']),entities.map(entity=>entity.type));
  const relations=source.connections||source.flows||source.messages||source.transitions;
  const edges=new Map();
  for(const attrs of elements.map(attributes).filter(a=>a['data-edge-key']!==undefined)) {
    const fact={from:attrs['data-edge-from'],to:attrs['data-edge-to'],id:attrs['data-edge-id'],label:attrs['data-edge-label']};
    if(edges.has(attrs['data-edge-key']))assert.deepEqual(fact,edges.get(attrs['data-edge-key']));
    else edges.set(attrs['data-edge-key'],fact);
  }
  assert.deepEqual([...edges.values()],relations.map(r=>({from:r.from,to:r.to,id:r.id,label:r.label||undefined})));
  const text=elements.filter(e=>e.nodeName==='#text').map(e=>e.value).join('\n');
  for(const object of [...entities,...relations])for(const field of ['label','sublabel','tag','step','note','classification']) {
    if(object[field])assert.ok(text.includes(object[field]),`missing complete ${field}: ${object[field]}`);
  }
  const routes=elements.map(attributes).filter(a=>a['data-composition-points']);
  for(const [index,relation] of relations.entries()) {
    const route=routes.find(a=>a['data-edge-key']===String(index) || relation.id && a['data-composition-edge-id']===relation.id);
    if(relation.via?.length) {
      assert.ok(route,`route ${index}`);
      const points=route['data-composition-points'].split(';').map(p=>p.split(',').map(Number));
      for(const point of relation.via)assert.ok(points.some(p=>p[0]===point[0]&&p[1]===point[1]),`authored via ${point} changed`);
    }
  }
}

function render(t, source) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-content-canvas-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const input = path.join(scratch, 'source.json');
  const output = path.join(scratch, 'diagram.html');
  fs.writeFileSync(input, JSON.stringify(source));
  const result = spawnSync(process.execPath, [
    path.join(root, 'bin/archify.mjs'), 'render', source.diagram_type, input, output,
  ], { encoding: 'utf8' });
  return { ...result, input, output, html: result.status === 0 ? fs.readFileSync(output, 'utf8') : '' };
}

function architectureRoute() {
  return {
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Remote recovery path', output: 'recovery.html', quality_profile: 'standard' },
    components: [
      { id: 'a', type: 'backend', label: 'A', pos: [80, 80] },
      { id: 'b', type: 'backend', label: 'B', pos: [320, 80] },
    ],
    connections: [{ id: 'ab', from: 'a', to: 'b', fromSide: 'bottom', toSide: 'bottom', via: [[140, 1000], [380, 1000]] }],
  };
}

test('Architecture implicit canvas contains an unlabelled outer route without moving its authored points', (t) => {
  const result = render(t, architectureRoute());
  assert.equal(result.status, 0, result.stderr);
  const frame = result.html.match(/<svg\b[^>]*viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(frame[3] > 1000, `outer path at y=1000 must fit ${frame}`);
  assert.match(result.html, /data-edge-id="ab"[^>]*data-composition-points="140,140;140,1000;380,1000;380,140"/);
  assert.match(result.html, /data-legend-semantic-kind="backend"/);
});

test('Architecture content mode measures paint and reports a fixed-frame capacity error without replacing authored coordinates', (t) => {
  const source = architectureRoute();
  source.meta.canvas_fit = 'content';
  const result = render(t, source);
  assert.equal(result.status, 0, result.stderr);
  const layout = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'architecture', result.input, '--layout-json'], { encoding: 'utf8' });
  assert.equal(layout.status, 0, layout.stderr || layout.stdout);
  const receipt = JSON.parse(layout.stdout);
  assert.ok(receipt.canvas.paintBounds.bottom >= 1000.75);
  assert.deepEqual(receipt.canvas.canonicalFrame, [0, 0, ...receipt.viewBox]);
  source.meta.viewBox = [600, 480];
  const fixed = render(t, source);
  assert.notEqual(fixed.status, 0);
  assert.match(fixed.stderr, /canvas\/capacity/);
});

test('layout-json is machine-readable even when the source file cannot be read', (t) => {
  const source = architectureRoute();
  const rendered = render(t, source);
  const result = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'architecture', `${rendered.input}.missing`, '--layout-json'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.ok, false);
  assert.ok(receipt.diagnostics.length);
});

test('content canvas respects a small sufficient explicit frame and rejects negative authored paint', (t) => {
  const source = architectureRoute();
  source.meta.canvas_fit = 'content';
  source.meta.viewBox = [480, 240];
  source.connections = [];
  const sufficient = render(t, source);
  assert.equal(sufficient.status, 0, sufficient.stderr);
  assert.match(sufficient.html, /<svg\b[^>]*viewBox="0 0 480 240"/);
  source.connections = [{ from: 'a', to: 'b', fromSide: 'top', toSide: 'top', via: [[140, -50], [380, -50]] }];
  const negative = render(t, source);
  assert.notEqual(negative.status, 0);
  assert.match(negative.stderr, /canvas\/origin-conflict/);
});

test('layout-json does not approve an intentional legend that render cannot place', (t) => {
  const source = architectureRoute();
  source.meta.canvas_fit = 'content';
  source.meta.viewBox = [480, 240];
  source.components[0].pos[1] = 165;
  source.components[1].pos[1] = 165;
  source.connections = [];
  const result = render(t, source);
  assert.notEqual(result.status, 0);
  const layout = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'architecture', result.input, '--layout-json'], { encoding: 'utf8' });
  assert.notEqual(layout.status, 0, 'layout inspection must fail like render');
  assert.equal(JSON.parse(layout.stdout).ok, false);
});

test('Dataflow content canvas expands around authored rows and preserves the legacy row limit', (t) => {
  const source = {
    schema_version: 1, diagram_type: 'dataflow',
    meta: { title: 'Archive delivery', output: 'archive.html', canvas_fit: 'content', quality_profile: 'standard' },
    stages: [{ label: 'Input' }, { label: 'Archive' }],
    nodes: [
      { id: 'input', type: 'backend', label: 'Input', stage: 0, row: 0 },
      { id: 'archive', type: 'database', label: 'Archive', stage: 1, row: 4, yOffset: 500 },
    ],
    flows: [{ id: 'save', from: 'input', to: 'archive', label: 'records' }],
  };
  const result = render(t, source);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.html, /x="259" y="1084" width="112" height="58"/);
  assert.match(result.html, /data-legend-semantic-kind="database"/);
  const layout = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'dataflow', result.input, '--layout-json'], { encoding: 'utf8' });
  assert.equal(layout.status, 0, layout.stderr || layout.stdout);
  const receipt = JSON.parse(layout.stdout);
  assert.ok(receipt.viewBox[1] >= 1216);
  assert.equal(receipt.canvas.mode, 'content');
  source.nodes[1].row = 5;
  const invalid = render(t, source);
  assert.notEqual(invalid.status, 0);
});

test('Sequence fixed content canvas preserves twelve columns and authored long message times', (t) => {
  const source = {
    schema_version: 1, diagram_type: 'sequence',
    meta: { title: 'Release acknowledgements', output: 'release.html', canvas_fit: 'content', quality_profile: 'standard' },
    participants: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, type: 'backend', label: `Service ${i}` })),
    messages: Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, from: `p${i}`, to: `p${i + 1}`, label: 'ack', y: 200 + i * 100 })),
  };
  const result = render(t, source);
  assert.equal(result.status, 0, result.stderr);
  const layout = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'sequence', result.input, '--layout-json'], { encoding: 'utf8' });
  assert.equal(layout.status, 0, layout.stderr || layout.stdout);
  const receipt = JSON.parse(layout.stdout);
  assert.ok(receipt.viewBox[0] > 1300);
  assert.ok(receipt.viewBox[1] > 1200);
  assert.deepEqual(receipt.participants.map((p) => p.cx), source.participants.map((_, i) => 62 + i * 108));
  assert.deepEqual(receipt.messages.map((m) => m.y), source.messages.map((m) => m.y));
});

test('Sequence spread content canvas recomputes thirty columns and converges without moving time', (t) => {
  const source = {
    schema_version: 1, diagram_type: 'sequence',
    meta: { title: 'Fleet rollout', output: 'fleet.html', canvas_fit: 'content', column_fit: 'spread', quality_profile: 'standard' },
    participants: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, type: 'backend', label: `Node ${i}` })),
    messages: [{ id: 'deploy', from: 'p0', to: 'p29', label: 'deploy', y: 200 }],
  };
  const result = render(t, source);
  assert.equal(result.status, 0, result.stderr);
  const layout = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'sequence', result.input, '--layout-json'], { encoding: 'utf8' });
  assert.equal(layout.status, 0, layout.stdout);
  const receipt = JSON.parse(layout.stdout);
  const expectedWidth = Math.max(86, Math.min(190, Math.round((receipt.viewBox[0] - 124) / 30) - 24));
  assert.equal(receipt.participants[0].width, expectedWidth);
  assert.equal(receipt.participants[0].cx, 62 + expectedWidth / 2);
  assert.equal(receipt.participants.at(-1).x + expectedWidth, receipt.viewBox[0] - 40);
  assert.ok(receipt.canvas.iterations >= 1 && receipt.canvas.iterations <= 32);
  assert.equal(receipt.messages[0].y, 200);
});

test('Lifecycle content canvas contains high authored states while keeping lower-band column limits', (t) => {
  const source = {
    schema_version: 1, diagram_type: 'lifecycle',
    meta: { title: 'Recovery completion', output: 'recovery.html', canvas_fit: 'content', quality_profile: 'standard' },
    lanes: [{ id: 'main', label: 'Execution' }, { id: 'terminal', label: 'Outcome' }],
    states: [
      { id: 'run', type: 'active', label: 'Run', lane: 'main', col: 2 },
      { id: 'done', type: 'success', label: 'Done', lane: 'terminal', col: 0, yOffset: 650 },
    ],
    transitions: [{ id: 'finish', from: 'run', to: 'done', label: 'complete', labelAt: [470, 640] }],
  };
  const result = render(t, source);
  assert.equal(result.status, 0, result.stderr);
  const layout = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'lifecycle', result.input, '--layout-json'], { encoding: 'utf8' });
  assert.equal(layout.status, 0, layout.stdout);
  const receipt = JSON.parse(layout.stdout);
  assert.ok(receipt.viewBox[1] >= 1280);
  assert.equal(receipt.states[1].y, 1100);
  assert.equal(receipt.states[1].cx, 402);
  source.states[1].col = 3;
  const invalid = render(t, source);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /invalid column 3/);
});

test('a capacity diagnostic advertises only a size verified through unchanged renderer rules', (t) => {
  const source = architectureRoute();
  source.meta.canvas_fit = 'content';
  source.meta.viewBox = [480, 240];
  const result = render(t, source);
  const inspect = (input) => spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'architecture', input, '--layout-json'], { encoding: 'utf8' });
  const failure = JSON.parse(inspect(result.input).stdout);
  const diagnostic = failure.diagnostics.find((entry) => entry.code === 'canvas/capacity');
  assert.ok(diagnostic.supportedFixes.some((fix) => fix.includes('meta.viewBox')));
  assert.ok(diagnostic.evidence.requiredViewBox);
  source.meta.viewBox = diagnostic.evidence.requiredViewBox;
  const fixed = render(t, source);
  assert.equal(fixed.status, 0, fixed.stderr);
  const validated = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', 'architecture', fixed.input, '--json'], { encoding: 'utf8' });
  assert.equal(validated.status, 0, validated.stdout);
});

test('content legend width accounts for its rendered font rather than the old smaller measurement font', (t) => {
  const source = architectureRoute();
  source.meta.canvas_fit = 'content';
  source.meta.legend = { entries: { backend: { label: 'Backend '.repeat(10) } } };
  const result = render(t, source);
  assert.equal(result.status, 0, result.stderr);
  const width = Number(result.html.match(/data-legend-semantic-kind="backend"[^>]*data-legend-width="([^"]+)"/)[1]);
  assert.ok(width >= 14 + 8 + source.meta.legend.entries.backend.label.length * 10 * 0.62,
    `rendered 10px text needs more room than ${width}`);
});

for (const [name, source] of Object.entries(capacityCases)) {
  test(`capacity matrix: ${name} passes public artifact validation`, (t) => {
    const result = render(t, source);
    assert.equal(result.status, 0, result.stderr);
    assertSemanticPreservation(source,result.html);
    const validated = spawnSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'validate', source.diagram_type, result.input, '--json'], { encoding: 'utf8' });
    assert.equal(validated.status, 0, validated.stdout || validated.stderr);
    assert.equal(JSON.parse(validated.stdout).ok, true);
  });
}

for (const [name, control] of Object.entries(controlCases)) {
  test(`legal control: ${name} renders in legacy and content mode`, (t) => {
    assert.equal(render(t, control).status, 0);
    const source = structuredClone(control);
    source.meta.canvas_fit = 'content';
    delete source.meta.viewBox;
    const result = render(t, source);
    assert.equal(result.status, 0, result.stderr);
  });
}

const smallSources = {
  architecture: { ...architectureRoute(), connections: [] },
  dataflow: controlCases['minimal.dataflow'], sequence: controlCases['minimal.sequence'],
  lifecycle: controlCases['minimal.lifecycle'],
};
for (const [type, input] of Object.entries(smallSources)) {
  test(`${type}: sufficient authored frame below default stays authoritative under both profiles`, (t) => {
    const dimensions = { architecture:[480,240], dataflow:[423,400], sequence:[480,480], lifecycle:[900,632] }[type];
    for (const profile of ['standard','showcase']) {
      const source = structuredClone(input);
      source.meta = { ...source.meta, canvas_fit:'content', viewBox:dimensions, quality_profile:profile };
      const result = render(t, source);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.html.includes(`viewBox="0 0 ${dimensions.join(' ')}"`));
    }
  });
  test(`${type}: layout-json schema failure is JSON and dry-run publishes no HTML`, (t) => {
    const result = render(t, input);
    fs.unlinkSync(result.output);
    const args = [path.join(root,'bin/archify.mjs'),'validate',type,result.input,'--layout-json'];
    const good = spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.equal(good.status,0,good.stdout);
    assert.equal(JSON.parse(good.stdout).ok,true);
    assert.equal(fs.existsSync(result.output),false);
    const bad=structuredClone(input);bad.meta.canvas_fit='infinite';
    fs.writeFileSync(result.input,JSON.stringify(bad));
    const failure=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.notEqual(failure.status,0);
    assert.equal(JSON.parse(failure.stdout).ok,false);
  });
}

for (const [type, input] of Object.entries(browserCases)) {
  test(`${type}: five independent layout runs are deterministic and deliver preserves the rendered SVG`, (t) => {
    const result = render(t,input);
    assert.equal(result.status,0,result.stderr);
    const args=[path.join(root,'bin/archify.mjs'),'validate',type,result.input,'--layout-json'];
    const receipts=Array.from({length:5},()=>spawnSync(process.execPath,args,{encoding:'utf8'}));
    for(const receipt of receipts)assert.equal(receipt.status,0,receipt.stdout);
    for(const receipt of receipts)assert.equal(receipt.stdout,receipts[0].stdout);
    const output=result.output.replace('.html','-delivered.html');
    const delivered=spawnSync(process.execPath,[path.join(root,'bin/archify.mjs'),'deliver',type,result.input,output,'--json'],{encoding:'utf8'});
    assert.equal(delivered.status,0,delivered.stdout);
    const svg=(html)=>html.match(/<svg\b[\s\S]*?<\/svg>/)[0];
    assert.equal(svg(fs.readFileSync(output,'utf8')),svg(result.html));
  });
}

const negativeCases = [
  ['architecture unknown reference','architecture-outer-route', s=>s.connections[0].to='missing'],
  ['architecture negative top','architecture-outer-route', s=>s.connections[0].via=[[140,-50],[380,-50]]],
  ['architecture nonfinite thick paint','architecture-thick-marker', s=>s.connections[0].width=1e308],
  ['architecture overlapping components','architecture-outer-route', s=>s.components[1].pos=s.components[0].pos],
  ['dataflow sixth row','dataflow-high-row', s=>s.nodes[1].row=5],
  ['dataflow sixth stage','dataflow-wide-stage', s=>s.stages.push({label:'Extra'})],
  ['dataflow overlapping nodes','dataflow-high-row', s=>Object.assign(s.nodes[1],{stage:0,row:0,yOffset:0})],
  ['sequence invalid activation reference','sequence-segment-activation', s=>s.activations[0].participant='missing'],
  ['sequence reversed activation time','sequence-segment-activation', s=>s.activations[0].to=200],
  ['sequence dense messages','sequence-fixed-timeline', s=>Object.assign(s.messages[1],{from:'p0',to:'p1',y:s.messages[0].y+1})],
  ['sequence fixed long participant name','sequence-fixed-timeline', s=>s.participants[0].label='Meaningful participant name exceeding fixed box width'],
  ['lifecycle sixth main column','lifecycle-high-state', s=>s.states[0].col=5],
  ['lifecycle fourth event column','lifecycle-rounded-channel', s=>s.states[1].col=3],
  ['lifecycle negative channel','lifecycle-rounded-channel', s=>{s.transitions[0].route='left-channel';s.transitions[0].channelX=-60;}],
];

test('spread feedback is bounded and reports its iteration limit through the public CLI', (t) => {
  const source=structuredClone(capacityCases['sequence-spread-fleet']);
  source.messages=[{from:'p28',to:'p29',label:'A'.repeat(500),y:200}];
  const result=render(t,source);
  assert.notEqual(result.status,0);
  const failure=spawnSync(process.execPath,[path.join(root,'bin/archify.mjs'),'validate','sequence',result.input,'--layout-json'],{encoding:'utf8',timeout:10000});
  assert.notEqual(failure.status,0);const diagnostic=JSON.parse(failure.stdout).diagnostics.find(d=>d.code==='canvas/non-convergent');
  assert.equal(diagnostic.evidence.iterations,32);
});

test('capacity suggestions do not promise to repair an independent component collision', (t) => {
  const source=architectureRoute();source.meta.canvas_fit='content';source.meta.viewBox=[480,240];
  source.components[1].pos=source.components[0].pos;
  const result=render(t,source);
  const failure=spawnSync(process.execPath,[path.join(root,'bin/archify.mjs'),'validate','architecture',result.input,'--layout-json'],{encoding:'utf8'});
  const diagnostic=JSON.parse(failure.stdout).diagnostics.find(d=>d.code==='canvas/capacity');
  assert.equal(diagnostic.evidence.repairVerified,false);
  assert.equal(diagnostic.evidence.requiredViewBox,undefined);
  assert.deepEqual(diagnostic.supportedFixes,[]);
  assert.ok(diagnostic.evidence.candidateDiagnostics.length);
});

test('marker paint can cross the origin even when the route stroke remains positive', (t) => {
  const source=architectureRoute();source.meta.canvas_fit='content';
  source.components[0].pos=[320,40];source.components[1].pos=[80,40];
  source.connections=[{id:'wide-return',from:'a',to:'b',width:30}];
  const result=render(t,source);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/canvas\/origin-conflict/);
});

test('authored capacity includes the exact node stroke boundary, not just its geometry box', (t) => {
  const source=architectureRoute();source.meta.canvas_fit='content';source.meta.viewBox=[480,240];
  source.connections=[];source.components[1].pos=[359.25,80];
  assert.equal(render(t,source).status,0);
  source.components[1].pos[0]+=0.01;
  const clipped=render(t,source);
  assert.notEqual(clipped.status,0);
  assert.match(clipped.stderr,/canvas\/capacity/);
});

for (const name of ['architecture-outer-route','dataflow-high-row','sequence-segment-activation','lifecycle-high-state']) {
  test(`${name}: a fixed capacity failure offers a publicly validated repair`, (t) => {
    const source=structuredClone(capacityCases[name]);
    source.meta.viewBox={architecture:[480,240],dataflow:[940,720],sequence:[920,760],lifecycle:[980,660]}[source.diagram_type];
    const failed=render(t,source);assert.notEqual(failed.status,0);
    const inspect=spawnSync(process.execPath,[path.join(root,'bin/archify.mjs'),'validate',source.diagram_type,failed.input,'--layout-json'],{encoding:'utf8'});
    const fixes=JSON.parse(inspect.stdout).diagnostics.filter(d=>d.evidence.repairVerified);
    assert.ok(fixes.length,inspect.stdout);
    source.meta.viewBox=fixes[0].evidence.requiredViewBox;
    const repaired=render(t,source);assert.equal(repaired.status,0,repaired.stderr);
    const validate=spawnSync(process.execPath,[path.join(root,'bin/archify.mjs'),'validate',source.diagram_type,repaired.input,'--json'],{encoding:'utf8'});
    assert.equal(validate.status,0,validate.stdout);
  });
}
for(const [name,fixture,mutate] of negativeCases) {
  test(`content constraints remain enforced: ${name}`,t=>{
    const source=structuredClone(capacityCases[fixture]);mutate(source);
    const result=render(t,source);assert.notEqual(result.status,0,name);
    const layout=spawnSync(process.execPath,[path.join(root,'bin/archify.mjs'),'validate',source.diagram_type,result.input,'--layout-json'],{encoding:'utf8'});
    assert.notEqual(layout.status,0,name);const receipt=JSON.parse(layout.stdout);
    assert.equal(receipt.ok,false);assert.ok(receipt.diagnostics.length);
    assert.ok(receipt.diagnostics.every(d=>d.code!=='internal/unclassified'),JSON.stringify(receipt));
  });
}
