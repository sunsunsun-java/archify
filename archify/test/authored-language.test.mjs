import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

test('validate rejects a Chinese title when reader-facing body copy remains English', () => {
  const input = fixture('mixed-language.workflow.json', (source) => {
    source.meta.title = 'Agent 工具调用工作流';
    source.meta.locale = 'zh-CN';
  });
  const result = run(['validate', 'workflow', input, '--require-authored-language', 'zh-CN', '--json']);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.stage, 'language');
  assert.equal(receipt.diagnostics[0].code, 'content/authored-language');
  assert.ok(receipt.diagnostics[0].evidence.violations.some((entry) => entry.path === '/lanes/0/label'));
});

test('validate accepts Chinese reader-facing copy while preserving technical identifiers', () => {
  const input = fixture('chinese.workflow.json', (source) => {
    source.meta.title = 'Agent 工具调用工作流';
    source.meta.locale = 'zh-CN';
    const localize = (value) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => localize(entry));
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, entry] of Object.entries(value)) {
        if (['label', 'sublabel', 'tag', 'note', 'title', 'subtitle'].includes(key)
          && typeof entry === 'string') {
          value[key] = key === 'title' && value === source.meta ? source.meta.title : '中文说明';
        } else if (key === 'items' && Array.isArray(entry)) {
          entry.forEach((_item, index) => { entry[index] = '中文说明'; });
        } else {
          localize(entry);
        }
      }
    };
    localize(source);
    source.nodes[0].label = 'ToolResultMessage[]';
  });
  const result = run(['validate', 'workflow', input, '--require-authored-language', 'zh-CN', '--json']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.authoredLanguage.required, 'zh-CN');
  assert.equal(receipt.authoredLanguage.violations, 0);
  const bytes = fs.readFileSync(input);
  assert.deepEqual(receipt.specification, {
    type: 'workflow',
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
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
