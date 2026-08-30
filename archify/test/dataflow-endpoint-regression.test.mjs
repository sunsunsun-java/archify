import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

function renderDiagram(mode, doc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `archify-${mode}-endpoint-`));
  const input = path.join(tmp, 'input.json');
  const output = path.join(tmp, 'output.html');
  fs.writeFileSync(input, JSON.stringify(doc));
  try {
    execFileSync('node', [
      path.join(skillRoot, `renderers/${mode}/render-${mode}.mjs`),
      input,
      output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return fs.readFileSync(output, 'utf8');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function nodeRect(html, id) {
  const match = html.match(new RegExp(
    `<g id="node-${id}"[^>]*>[\\s\\S]*?<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"`,
  ));
  assert.ok(match, `missing rendered node ${id}`);
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  };
}

function relationshipPoints(html, id) {
  const match = html.match(new RegExp(`data-edge-id="${id}"[^>]+data-composition-points="([^"]+)"`));
  assert.ok(match, `missing rendered relationship ${id}`);
  return match[1].split(';').map((point) => point.split(',').map(Number));
}

function relationshipPath(html, id) {
  const match = html.match(new RegExp(`<path[^>]+data-edge-id="${id}"[^>]+\\sd="([^"]+)"`));
  assert.ok(match, `missing rendered relationship path ${id}`);
  return match[1];
}

function toolResultLoopDataflow() {
  return {
    schema_version: 1,
    diagram_type: 'dataflow',
    meta: { title: 'Tool result loop', quality_profile: 'showcase' },
    stages: [
      { label: 'Context' },
      { label: 'Execution' },
      { label: 'Result' },
    ],
    nodes: [
      { id: 'messages', type: 'database', label: 'Messages', stage: 0, row: 0 },
      { id: 'tools', type: 'backend', label: 'Tools', stage: 1, row: 2 },
      { id: 'results', type: 'messagebus', label: 'Results', stage: 2, row: 2 },
    ],
    flows: [
      { id: 'execute', from: 'tools', to: 'results', label: 'toolResult' },
      { id: 'append-results', from: 'results', to: 'messages', label: 'ordered write-back', route: 'bottom-channel', variant: 'dashed' },
    ],
  };
}

test('dataflow: bottom-channel connects the bottom centers without borrowing side borders or ports', () => {
  const html = renderDiagram('dataflow', toolResultLoopDataflow());
  const execute = relationshipPoints(html, 'execute');
  const writeBack = relationshipPoints(html, 'append-results');

  assert.deepEqual(writeBack, [
    [530, 414],
    [530, 440],
    [100, 440],
    [100, 186],
  ]);
  assert.notDeepEqual(writeBack[0], execute.at(-1));
});

test('lifecycle: named channels resolve to the matching side centers without authored sides', () => {
  const cases = [
    { route: 'bottom-channel', side: 'bottom' },
    { route: 'top-channel', side: 'top' },
    { route: 'right-channel', side: 'right' },
    { route: 'left-channel', side: 'left' },
  ];

  for (const { route, side } of cases) {
    const html = renderDiagram('lifecycle', {
      schema_version: 1,
      diagram_type: 'lifecycle',
      meta: { title: `${route} endpoint defaults`, quality_profile: 'showcase' },
      lanes: [{ id: 'main', label: 'Main' }],
      states: [
        { id: 'source', lane: 'main', col: 3, type: 'active', label: 'Source' },
        { id: 'target', lane: 'main', col: 0, type: 'success', label: 'Target' },
      ],
      transitions: [{ id: 'return', from: 'source', to: 'target', route }],
    });
    const source = nodeRect(html, 'source');
    const target = nodeRect(html, 'target');
    const points = relationshipPoints(html, 'return');
    const centerFor = (rect) => ({
      top: [rect.x + rect.width / 2, rect.y],
      bottom: [rect.x + rect.width / 2, rect.y + rect.height],
      left: [rect.x, rect.y + rect.height / 2],
      right: [rect.x + rect.width, rect.y + rect.height / 2],
    })[side];

    assert.deepEqual(points[0], centerFor(source), `${route} source port`);
    assert.deepEqual(points.at(-1), centerFor(target), `${route} target port`);
  }
});

test('dataflow: aligned automatic flow emits one canonical segment without duplicate endpoint points', () => {
  const html = renderDiagram('dataflow', {
    schema_version: 1,
    diagram_type: 'dataflow',
    meta: { title: 'Aligned automatic flow', quality_profile: 'showcase' },
    stages: [{ label: 'Messages' }, { label: 'Unused' }],
    nodes: [
      { id: 'source', type: 'backend', label: 'AgentMessage[]', stage: 0, row: 0 },
      { id: 'target', type: 'messagebus', label: 'Tool calls', stage: 0, row: 2 },
    ],
    flows: [{ id: 'tool-calls', from: 'source', to: 'target', label: 'toolCall content block', labelAt: [100, 271] }],
  });

  assert.deepEqual(relationshipPoints(html, 'tool-calls'), [[100, 186], [100, 356]]);
  assert.equal(relationshipPath(html, 'tool-calls'), 'M 100 186 L 100 352.85');
});
