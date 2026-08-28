import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const AUTHORING_TYPES = Object.freeze([
  'architecture',
  'workflow',
  'sequence',
  'dataflow',
  'lifecycle',
]);

const EXAMPLES = Object.freeze({
  architecture: 'examples/web-app.architecture.json',
  workflow: 'examples/agent-tool-call.workflow.json',
  sequence: 'examples/cache-miss-request.sequence.json',
  dataflow: 'examples/product-analytics.dataflow.json',
  lifecycle: 'examples/agent-run.lifecycle.json',
});

function filePacket(skillRoot, relativePath) {
  const absolutePath = path.join(skillRoot, ...relativePath.split('/'));
  const content = fs.readFileSync(absolutePath, 'utf8');
  return Object.freeze({
    path: relativePath,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
    content,
  });
}

/**
 * Return the complete, byte-identical authoring contract for one diagram type.
 * Callers learn one interface; file discovery and matching-example selection
 * remain local to this module.
 */
export function loadAuthoringKit(type, { skillRoot = moduleRoot } = {}) {
  if (!AUTHORING_TYPES.includes(type)) {
    throw new Error(`Unknown diagram type "${type}". Expected one of: ${AUTHORING_TYPES.join(', ')}`);
  }
  const resolvedRoot = fs.realpathSync(path.resolve(skillRoot));
  return Object.freeze({
    schemaVersion: 1,
    type,
    files: Object.freeze({
      schema: filePacket(resolvedRoot, `schemas/${type}.schema.json`),
      commonSchema: filePacket(resolvedRoot, 'schemas/common.schema.json'),
      example: filePacket(resolvedRoot, EXAMPLES[type]),
    }),
  });
}
