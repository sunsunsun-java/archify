import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1600, height: 1000 },
  { width: 1920, height: 1080 },
  { width: 2048, height: 1320 },
];

const CAPTURE_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 2048, height: 1320 },
];

export const QUALITY_CONTRACT = deepFreeze({
  schemaVersion: 1,
  guards: {
    qualityProfile: 'showcase',
    deterministicChecks: 9,
    deterministicChecksRequired: 9,
    deterministicCheckNames: [
      'single_svg',
      'finite_svg',
      'orthogonal_arrows',
      'label_route_clearance',
      'relationship_crossings',
      'relationship_corridors',
      'container_border_runs',
      'route_rhythm',
      'legend_clearance',
    ],
    compositionErrors: 0,
    compositionWarnings: 0,
    desktopViewports: DESKTOP_VIEWPORTS,
    desktopContainmentRequired: 4,
    requireDesktopContainment: true,
    captureViewports: CAPTURE_VIEWPORTS,
    captureThemes: ['light', 'dark'],
    minimumProjectedNodeTextPx: 6,
    semanticDeletionAllowed: false,
    typographyReductionAllowed: false,
    overflowHidingAllowed: false,
    clippingAllowed: false,
    internalScrollerAllowed: false,
  },
  visual: {
    desktopContainmentRequired: true,
    requestedStateMustMatchResolvedState: true,
    screenshotsMustBeContentAddressed: true,
  },
  repairPolicy: {
    stageOrder: ['input', 'render', 'check', 'preflight'],
    maxConsecutiveNonImprovingAttempts: 2,
  },
});

export const QUALITY_CONTRACT_DIGEST = createHash('sha256')
  .update(canonicalJson(QUALITY_CONTRACT))
  .digest('hex');

export function assertExpectedQualityContract(expectedDigest) {
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error('Expected quality contract must be a valid SHA-256 digest.');
  }
  if (expectedDigest !== QUALITY_CONTRACT_DIGEST) {
    throw new Error(`Quality contract mismatch: expected ${expectedDigest}, loaded ${QUALITY_CONTRACT_DIGEST}.`);
  }
  return QUALITY_CONTRACT_DIGEST;
}

export function qualityContractIdentity({ skillRoot } = {}) {
  if (typeof skillRoot !== 'string' || !skillRoot.trim()) {
    throw new Error('Quality contract identity requires a skillRoot.');
  }
  const skillPath = path.join(fs.realpathSync(path.resolve(skillRoot)), 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const version = skill.match(/^metadata:\s*\n(?:^[ \t]+.*\n)*?^[ \t]+version:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  if (!version) throw new Error(`SKILL.md metadata.version is missing: ${skillPath}`);
  return Object.freeze({
    quality: Object.freeze({
      schemaVersion: QUALITY_CONTRACT.schemaVersion,
      sha256: QUALITY_CONTRACT_DIGEST,
    }),
    skill: Object.freeze({
      version,
      sha256: createHash('sha256').update(skill).digest('hex'),
    }),
  });
}
