import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {compactViewer} from '../../scripts/compact-viewer.mjs';
import {readableViewerArtifact} from './helpers/readable-viewer.mjs';

test('compaction preserves markup, JSON, font bytes, script boundaries and public behavior', async () => {
  const prefix = '<!doctype html><html><head><style id="archify-fonts">/* OFL */ @font-face { src: url(data:font/woff2;base64,AAAA); }</style>';
  const css = '<style>/* normal comment */ .node { --space: 2px; color: red; color: blue; } @media print { .node { display: none; } }</style>';
  const data = '<script type="application/json">{"label":"中文","viewBox":[0,0,10,20]}</script>';
  const scripts = [
    'var Archify = {}; var sharedValue = 7; /* @license fixture */',
    'Archify.answer = (function () { var verboseLocalName = sharedValue; return { read: function () { return verboseLocalName; }, literal: "中文 $& $\' $` $$ </script>" }; })();',
  ];
  const tail = '<svg viewBox="0 0 10 20"><text>字号与几何不变</text></svg></body></html>';
  const html = prefix + css + '</head><body>' + data + scripts.map(s => '<script>' + s.replace(/<\/script>/g, '<\\/script>') + '</script>').join('') + tail;
  const compact = await compactViewer(html);
  assert(compact.startsWith(prefix));
  assert(compact.endsWith(tail));
  assert(compact.includes(data));
  assert.match(compact, /@license fixture/);
  assert.equal([...compact.matchAll(/<script\b/g)].length, 3);
  const context = vm.createContext({});
  for (const [, attrs, body] of compact.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!attrs.includes('application/json')) vm.runInContext(body, context);
  }
  assert.equal(context.sharedValue, 7);
  assert.equal(context.Archify.answer.read(), 7);
  assert.equal(context.Archify.answer.literal, "中文 $& $' $` $$ </script>");
  assert.deepEqual(Object.keys(context.Archify.answer), ['read', 'literal']);
  assert(!compact.includes('verboseLocalName'));
  assert(compact.includes(css), 'all CSS, not just font declarations, stays byte-identical');
  assert.match(compact, /@media print/);
  assert.equal(await compactViewer(html), compact);
});

test('non-executable scripts, external scripts, placeholders and HTML comments stay byte-identical', async () => {
  const untouched = '<!-- <script>invalid fake script</script> --><script type="application/ld+json">{ "x": 1 }</script><script src="local.js"> ignored </script><p>{{i18n:viewer.title}}</p><!-- ARCHIFY:SVG_SLOT -->';
  assert.equal(await compactViewer(untouched), untouched);
});

test('syntax errors reject the complete candidate rather than quietly dropping code', async () => {
  await assert.rejects(compactViewer('<script>function (</script>'));
});

test('generated template has a shared-byte budget independent of authored diagram size', () => {
  const bytes = fs.statSync(new URL('../assets/template.html', import.meta.url)).size;
  // Measured compact baseline plus maintenance headroom; not a per-diagram limit.
  assert(bytes < 620_000, `Shared Viewer template grew to ${bytes} bytes; inspect the contribution before adjusting this budget.`);
});

test('readable source assertions reject stale, missing, duplicated or modified delivered code', () => {
  const html = fs.readFileSync(new URL('../assets/template.html', import.meta.url), 'utf8');
  assert.doesNotThrow(() => readableViewerArtifact(html));
  const script = html.match(/<script>[\s\S]*?<\/script>/)[0];
  for (const modified of [html.replace(script, ''), html + script, html.replace(script, script.replace('try', '/* modified */try'))]) {
    assert.throws(() => readableViewerArtifact(modified), /exactly one copy/);
  }
});
