// Source-contract assertions need readable bindings/formatting. Never substitute
// source until the actual artifact contains the exact current compact build.
// Browser tests must use the original HTML, not this assertion-only projection.
import assert from 'node:assert/strict';
import { assembleViewer } from '../../../scripts/generate-viewer.mjs';
import { compactViewer } from '../../../scripts/compact-viewer.mjs';

const source = assembleViewer();
const compact = await compactViewer(source);
const blocks = html => [...html.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/g)]
  .filter(([, tag, attrs]) => tag === 'style' ? !attrs.includes('archify-fonts') : !/\b(?:type|src)=/.test(attrs));
const originals = blocks(source);
const generated = blocks(compact);
assert.equal(originals.length, generated.length);

export function readableViewerArtifact(html) {
  for (let i = 0; i < generated.length; i += 1) {
    const emitted = generated[i][0];
    assert.equal(html.split(emitted).length, 2, 'Artifact must contain exactly one copy of each current compact Viewer block');
    html = html.replace(emitted, () => originals[i][0]);
  }
  return html;
}
