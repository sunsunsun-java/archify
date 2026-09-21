import {createRequire} from 'node:module';

// Build-only dependencies live with the renderer's development toolchain.
const require = createRequire(new URL('../archify/package.json', import.meta.url));
const {parse} = require('parse5');
const {minify} = require('terser');

export async function compactViewer(html) {
  const ranges = [];
  function visit(node) {
    const attrs = Object.fromEntries((node.attrs || []).map(({name, value}) => [name, value]));
    const location = node.sourceCodeLocation;
    const script = node.tagName === 'script' && !('src' in attrs) &&
      (!attrs.type || /^(?:text|application)\/javascript$/i.test(attrs.type));
    if (script && location?.startTag && location?.endTag) {
      ranges.push({start: location.startTag.endOffset, end: location.endTag.startOffset});
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(html, {sourceCodeLocationInfo: true}));
  // Replace only raw-text contents, from the end; markup and placeholders remain exact.
  for (const {start, end} of ranges.sort((a, b) => b.start - a.start)) {
    const source = html.slice(start, end);
    const result = await minify(source, {
      compress: false,
      mangle: {toplevel: false, properties: false},
      format: {comments: /@license|@preserve|^!/, inline_script: true},
    });
    html = html.slice(0, start) + result.code + html.slice(end);
  }
  return html;
}
