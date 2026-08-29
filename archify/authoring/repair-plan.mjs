const QUALITY_GUARDS = Object.freeze({
  semanticDeletionAllowed: false,
  typographyReductionAllowed: false,
  overflowHidingAllowed: false,
  deterministicChecksRequired: 9,
  desktopContainmentRequired: 4,
});

function round(value) {
  return Math.round(value * 1000) / 1000;
}
function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function authoredViewBox(candidate) {
  const value = candidate?.meta?.viewBox;
  if (!Array.isArray(value) || value.length !== 2 || !value.every((entry) => Number.isFinite(entry) && entry > 0)) {
    return null;
  }
  return value.map(round);
}

function containmentAdvice(candidate, preflight) {
  const viewports = Array.isArray(preflight?.containment?.viewports)
    ? preflight.containment.viewports
    : [];
  const failing = viewports.filter((viewport) => viewport?.ok !== true);
  if (!failing.length) return null;

  const worstOverflowX = Math.max(0, ...failing.map((viewport) => Number(viewport?.overflowXBy) || 0));
  const worstOverflowY = Math.max(0, ...failing.map((viewport) => Number(viewport?.overflowYBy) || 0));
  const constrained = [...failing].sort((left, right) => (
    (Number(left?.width) || Infinity) - (Number(right?.width) || Infinity)
      || (Number(left?.height) || Infinity) - (Number(right?.height) || Infinity)
  ))[0];
  const viewBox = authoredViewBox(candidate);
  const availableSvgHeight = Number(constrained?.readerLayout?.availableSvgHeight);
  const diagramWidth = Number(constrained?.diagramWidth);
  let viewBoxOptions;
  if (viewBox && availableSvgHeight > 0 && diagramWidth > 0) {
    const [width, height] = viewBox;
    const maximumHeightAtCurrentWidth = Math.max(1, Math.floor(
      width * availableSvgHeight / diagramWidth * 0.98,
    ));
    const minimumWidthAtCurrentHeight = Math.ceil(
      height * diagramWidth / availableSvgHeight / 0.98,
    );
    viewBoxOptions = {
      current: viewBox,
      compactHeight: [width, Math.min(height, maximumHeightAtCurrentWidth)],
      preserveHeight: [Math.max(width, minimumWidthAtCurrentHeight), height],
      maximumHeightAtCurrentWidth,
      minimumWidthAtCurrentHeight,
      note: 'compactHeight requires semantic-preserving reflow; preserveHeight must still pass the 6px desktop readability gate.',
    };
  }

  return {
    cause: worstOverflowY >= worstOverflowX
      ? 'desktop-height-budget-exceeded'
      : 'desktop-width-budget-exceeded',
    failingViewports: failing.map((viewport) => ({
      width: viewport.width,
      height: viewport.height,
      overflowXBy: Number(viewport.overflowXBy) || 0,
      overflowYBy: Number(viewport.overflowYBy) || 0,
      ...(Number.isFinite(viewport?.readerLayout?.availableSvgHeight)
        ? { availableSvgHeight: round(viewport.readerLayout.availableSvgHeight) }
        : {}),
    })),
    worstOverflow: { x: round(worstOverflowX), y: round(worstOverflowY) },
    ...(viewBoxOptions ? { viewBoxOptions } : {}),
  };
}

function diagnosticActions(diagnostics) {
  return diagnostics.map((diagnostic, index) => ({
    id: `diagnostic-${index + 1}`,
    code: diagnostic.code || 'internal/unclassified',
    subject: diagnostic.subject || {},
    evidence: diagnostic.evidence || {},
    supportedFixes: unique(diagnostic.supportedFixes || []),
  }));
}

/**
 * Convert validation evidence into a bounded, semantics-preserving repair plan.
 * The plan is advisory: the unchanged deterministic and browser gates remain
 * the authority after an author edits the candidate.
 */
export function createRepairPlan({ type, candidate, stage, diagnostics = [], preflight = null } = {}) {
  const containment = containmentAdvice(candidate, preflight);
  const actions = diagnosticActions(Array.isArray(diagnostics) ? diagnostics : []);
  if (containment) {
    actions.unshift({
      id: 'containment-budget',
      code: containment.cause,
      subject: { type, viewports: containment.failingViewports.map(({ width, height }) => `${width}x${height}`) },
      evidence: {
        worstOverflow: containment.worstOverflow,
        ...(containment.viewBoxOptions ? { viewBoxOptions: containment.viewBoxOptions } : {}),
      },
      supportedFixes: [
        'reflow the same semantic nodes into a wider, shorter main composition',
        'compact non-semantic spacing before changing node or label typography',
        'rerun deterministic validation before the next browser preflight',
      ],
    });
  }

  const causes = unique([
    containment?.cause,
    ...actions.map((action) => action.code),
  ]);
  return {
    schemaVersion: 1,
    type,
    stage,
    status: actions.length ? 'repair-required' : 'manual-diagnosis-required',
    causes,
    ...(authoredViewBox(candidate) ? { currentViewBox: authoredViewBox(candidate) } : {}),
    ...(containment ? { containment } : {}),
    actions,
    qualityGuards: QUALITY_GUARDS,
    forbiddenActions: [
      'delete a semantic node, state, message, relationship, or evidence fact merely to fit',
      'reduce node or label typography below the existing readability floor',
      'hide or clip overflow, or add an internal diagram scroller',
    ],
    acceptance: [
      'rerun showcase deterministic validation and require 9/9 with 0 errors and 0 warnings',
      'rerun browser preflight and require all four desktop viewports to pass',
      'preserve authored semantic identifiers and reader-facing facts unless the source evidence changes',
    ],
  };
}
