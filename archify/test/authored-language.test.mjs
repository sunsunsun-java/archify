import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(skillRoot, 'bin', 'archify.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-authored-language-'));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: skillRoot,
    encoding: 'utf8',
  });
}

function fixture(name, mutate) {
  const source = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples/agent-tool-call.workflow.json'), 'utf8'));
  mutate(source);
  const file = path.join(tmp, name);
  fs.writeFileSync(file, JSON.stringify(source, null, 2));
  return file;
}

test('validate rejects an English-authored candidate when Chinese is required', () => {
  const input = fixture('english.workflow.json', (source) => {
    source.meta.title = 'Agent tool workflow';
    source.meta.locale = 'en';
  });
  const result = run(['validate', 'workflow', input, '--require-authored-language', 'zh-CN', '--json']);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.stage, 'language');
  assert.equal(receipt.diagnostics[0].code, 'content/authored-language');
});

test('validate accepts a Chinese-authored title while preserving technical identifiers', () => {
  const input = fixture('chinese.workflow.json', (source) => {
    source.meta.title = 'Agent 工具调用工作流';
    source.meta.locale = 'zh-CN';
  });
  const result = run(['validate', 'workflow', input, '--require-authored-language', 'zh-CN', '--json']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test('deliver enforces the same authored-language gate before touching output', () => {
  const input = fixture('english-delivery.workflow.json', (source) => {
    source.meta.title = 'Agent tool workflow';
    source.meta.locale = 'en';
  });
  const output = path.join(tmp, 'should-not-exist.html');
  const result = run(['deliver', 'workflow', input, output, '--require-authored-language', 'zh-CN', '--json']);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(fs.existsSync(output), false);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.stage, 'language');
  assert.equal(receipt.diagnostics[0].code, 'content/authored-language');
});
