import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-layout-report-'));

const CASES = {
  architecture: {
    example: 'web-app.architecture.json',
    entityKey: 'components',
    relationshipCount: (source) => source.connections.length,
    labelCount: (source) => source.connections.filter((connection) => connection.label).length,
    breakGeometry(source) {
      source.components[1].pos = [...source.components[0].pos];
    },
  },
  workflow: {
    example: 'agent-tool-call.workflow.json',
    entityKey: 'nodes',
    relationshipCount: (source) => source.edges.length,
    labelCount: (source) => source.edges.filter((edge) => edge.label).length,
    breakGeometry(source) {
      source.nodes.push({ ...source.nodes[0], id: 'overlapping-copy' });
    },
  },
  sequence: {
    example: 'cache-miss-request.sequence.json',
    entityKey: 'participants',
    relationshipCount: (source) => source.messages.length,
    labelCount: (source) => source.messages.length,
    breakGeometry(source) {
      source.messages[0].y = 9000;
    },
  },
  dataflow: {
    example: 'product-analytics.dataflow.json',
    entityKey: 'nodes',
    relationshipCount: (source) => source.flows.length,
    labelCount: (source) => source.flows.length,
    breakGeometry(source) {
      source.nodes.push({ ...source.nodes[0], id: 'overlapping-copy' });
    },
  },
  lifecycle: {
    example: 'agent-run.lifecycle.json',
    entityKey: 'states',
    relationshipCount: (source) => source.transitions.length,
    labelCount: (source) => source.transitions.filter((transition) => transition.label).length,
    prepare(source) {
      source.transitions[0].label = 'approval needed';
      source.transitions[0].labelAt = [402, 232];
    },
    breakGeometry(source) {
      source.meta.viewBox[1] = 566;
    },
  },
};

function load(example) {
  return JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', example), 'utf8'));
}

function inspect(type, source, suffix) {
  const input = path.join(tmp, `${type}-${suffix}.json`);
  const output = path.join(tmp, `${type}-${suffix}.html`);
  const sentinel = `trusted-${type}-${suffix}\n`;
  fs.writeFileSync(input, JSON.stringify(source, null, 2));
  fs.writeFileSync(output, sentinel);
  const result = spawnSync(process.execPath, [
    path.join(skillRoot, 'renderers', type, `render-${type}.mjs`),
    input,
    output,
    '--layout-json',
  ], {
    cwd: skillRoot,
    encoding: 'utf8',
  });
  assert.equal(fs.readFileSync(output, 'utf8'), sentinel, `${type}: inspect must not write HTML`);
  assert.doesNotThrow(() => JSON.parse(result.stdout), `${type}: ${result.stdout || result.stderr}`);
  return { result, report: JSON.parse(result.stdout) };
}

for (const [type, definition] of Object.entries(CASES)) {
  test(`${type}: --layout-json emits one unified passing resolved-layout report without writing HTML`, () => {
    const source = load(definition.example);
    definition.prepare?.(source);
    const { result, report } = inspect(type, source, 'pass');

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.ok, true);
    assert.equal(report.type, type);
    assert.equal(report.diagram_type, type);
    assert.ok(Array.isArray(report.viewBox));
    assert.equal(report.viewBox.length, 2);
    assert.deepEqual(report.validation, { status: 'pass', diagnostics: [] });
    assert.ok(Array.isArray(report.resolved[definition.entityKey]));
    assert.ok(report.resolved[definition.entityKey].length > 0);
    assert.equal(report.resolved.relationships.length, definition.relationshipCount(source));
    assert.ok(report.resolved.relationships.every((relationship) => (
      Array.isArray(relationship.points)
      && relationship.points.length >= 2
      && relationship.points.flat().every(Number.isFinite)
    )));
    assert.ok(Array.isArray(report.resolved.labels));
    assert.equal(report.resolved.labels.length, definition.labelCount(source));
    assert.ok(report.resolved.labels.every((label) => (
      [label.x, label.y, label.width, label.height].every(Number.isFinite)
    )));
  });

  test(`${type}: --layout-json preserves partial resolved geometry when validation fails`, () => {
    const source = load(definition.example);
    definition.prepare?.(source);
    definition.breakGeometry(source);
    const { result, report } = inspect(type, source, 'fail');

    assert.notEqual(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.ok, false);
    assert.equal(report.type, type);
    assert.equal(report.validation.status, 'fail');
    assert.ok(report.validation.error);
    assert.ok(report.validation.diagnostics.length > 0);
    assert.ok(report.validation.diagnostics.every((diagnostic) => (
      diagnostic.code
      && diagnostic.message
      && diagnostic.subject
      && diagnostic.evidence
      && Array.isArray(diagnostic.supportedFixes)
    )));
    assert.ok(report.resolved[definition.entityKey].length > 0);
    assert.ok(Array.isArray(report.resolved.relationships));
    assert.ok(Array.isArray(report.resolved.labels));
  });
}

test('architecture: legacy inspect aliases preserve their original rounded shape', () => {
  const source = load('web-app.architecture.json');
  source.components[0].pos = [40.4, 300.4];
  source.components[0].size = [120.25, 60.5];
  const { result, report } = inspect('architecture', source, 'legacy-aliases');

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(report.components[0], {
    id: 'users',
    type: 'external',
    label: 'Users',
    x: 40,
    y: 300,
    width: 120.25,
    height: 60.5,
    pos: [40, 300],
  });
  assert.equal(report.resolved.components[0].x, 40.4);
  assert.equal(report.resolved.components[0].y, 300.4);
  assert.ok(report.resolved.relationships[0].id);
  assert.ok(Number.isInteger(report.resolved.relationships[0].collectionIndex));
  assert.equal('id' in report.connections[0], false);
  assert.equal('collectionIndex' in report.connections[0], false);
  assert.ok(report.connections[0].points.flat().every(Number.isInteger));
  assert.deepEqual(Object.keys(report.labels[0]).sort(), [
    'height',
    'labelAt',
    'text',
    'width',
    'x',
    'y',
  ]);
  assert.ok(report.boundaries.every((boundary) => (
    [boundary.x, boundary.y, boundary.width, boundary.height].every(Number.isInteger)
  )));
});

const LABEL_CONTAINMENT_CASES = {
  workflow: {
    example: 'agent-tool-call.workflow.json',
    path: '/edges/1/labelAt',
    mutate(source) {
      source.edges[1].labelAt = [10000, 100];
    },
  },
  dataflow: {
    example: 'product-analytics.dataflow.json',
    path: '/flows/0/labelAt',
    mutate(source) {
      source.flows[0].labelAt = [10000, 190];
    },
  },
  lifecycle: {
    example: 'agent-run.lifecycle.json',
    path: '/transitions/0/labelAt',
    mutate(source) {
      source.transitions[0].label = 'approval needed';
      source.transitions[0].labelAt = [10000, 200];
    },
  },
  sequence: {
    example: 'cache-miss-request.sequence.json',
    path: '/messages/0/label',
    mutate(source) {
      source.messages = [{ ...source.messages[0], label: 'X'.repeat(400) }];
    },
  },
};

for (const [type, definition] of Object.entries(LABEL_CONTAINMENT_CASES)) {
  test(`${type}: inspect rejects an out-of-viewBox relationship label at the real authored control`, () => {
    const source = load(definition.example);
    definition.mutate(source);
    const { result, report } = inspect(type, source, 'label-containment');

    assert.notEqual(result.status, 0);
    assert.equal(report.validation.status, 'fail');
    const issue = report.validation.diagnostics.find((entry) => (
      entry.code === 'composition/relationship-label-containment'
      && entry.subject?.path === definition.path
    ));
    assert.ok(issue, JSON.stringify(report.validation.diagnostics, null, 2));
    assert.ok(Object.values(issue.evidence.overflow).some((value) => value > 0));
    assert.ok(issue.supportedFixes.length > 0);
    assert.doesNotMatch(issue.supportedFixes.join('\n'), /\/relationships\//);
    if (type === 'sequence') {
      assert.ok(issue.supportedFixes.some((fix) => fix.includes('/meta/column_fit')));
      assert.ok(issue.supportedFixes.some((fix) => fix.includes('preserving its meaning')));
      assert.doesNotMatch(issue.supportedFixes.join('\n'), /labelAt/);
    } else {
      assert.ok(issue.evidence.allowedLabelAt);
    }
  });
}

const OVERSIZED_RELATIONSHIP_LABEL_CASES = {
  architecture: { collection: 'connections' },
  workflow: { collection: 'edges' },
  dataflow: { collection: 'flows' },
  lifecycle: { collection: 'transitions' },
};

for (const [type, definition] of Object.entries(OVERSIZED_RELATIONSHIP_LABEL_CASES)) {
  test(`${type}: an oversized relationship label recommends text/viewBox repair, not impossible labelAt coordinates`, () => {
    const source = load(CASES[type].example);
    source[definition.collection][0].label = '界'.repeat(200);
    const { result, report } = inspect(type, source, 'oversized-label');

    assert.notEqual(result.status, 0);
    const issue = report.validation.diagnostics.find((entry) => (
      entry.code === 'composition/relationship-label-containment'
      && entry.subject?.path === `/${definition.collection}/0/label`
    ));
    assert.ok(issue, JSON.stringify(report.validation.diagnostics, null, 2));
    assert.equal(issue.evidence.translationFeasible.x, false);
    assert.equal(issue.evidence.allowedLabelAt, undefined);
    assert.ok(issue.evidence.minimumViewBox.width > issue.evidence.viewBox.width);
    assert.match(issue.supportedFixes.join('\n'), new RegExp(`shorten /${definition.collection}/0/label`));
    assert.match(issue.supportedFixes.join('\n'), /increase \/meta\/viewBox\/0 to at least/);
    assert.doesNotMatch(issue.supportedFixes.join('\n'), /inside x .*\.\./);
  });
}

process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
