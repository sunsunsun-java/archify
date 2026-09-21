import { throwDiagnosticError, withDiagnosticRecordingSuppressed } from './diagnostics.mjs';
import { legendFootprint, measureLegend } from './legend.mjs';
import { ARROW_MARKER, textUnits } from './utils.mjs';
import { translateMessage } from './i18n.mjs';

export function paintRect(rect, subject, strokeWidth = 0) {
  const pad = strokeWidth / 2;
  return { x: rect.x - pad, y: rect.y - pad, width: rect.width + strokeWidth, height: rect.height + strokeWidth, subject };
}

export function paintPath(points, subject, strokeWidth, marker = true) {
  // Default SVG miterlimit=4 bounds a join by 2 * strokeWidth. This also
  // contains round/square caps and the convex hull of rounded route corners.
  const pad = strokeWidth * 2;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [x, y] of points) {
    left = Math.min(left, x - pad); top = Math.min(top, y - pad);
    right = Math.max(right, x + pad); bottom = Math.max(bottom, y + pad);
  }
  const end = points.at(-1);
  const previous = points.slice(0, -1).reverse().find(([x, y]) => x !== end?.[0] || y !== end?.[1]);
  if (marker && previous) {
    const dx = end[0] - previous[0], dy = end[1] - previous[1];
    const distance = Math.hypot(dx, dy);
    const cosine = dx / distance, sine = dy / distance;
    // markerUnits defaults to strokeWidth, orient=auto.
    for (const [px, py] of ARROW_MARKER.points) {
      const mx = px - ARROW_MARKER.refX, my = py - ARROW_MARKER.refY;
      const x = end[0] + strokeWidth * (mx * cosine - my * sine);
      const y = end[1] + strokeWidth * (mx * sine + my * cosine);
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top, subject };
}

export function paintBounds(rects, diagramType) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const contributors = {};
  for (const rect of rects) {
    const x2 = rect.x + rect.width, y2 = rect.y + rect.height;
    if (![rect.x, rect.y, rect.width, rect.height, x2, y2].every(Number.isFinite) || rect.width < 0 || rect.height < 0) {
      const message = `Cannot measure finite paint bounds for ${rect.subject}.`;
      throwDiagnosticError(message, [{ code: 'canvas/non-finite-bounds', severity: 'error', message,
        subject: { diagramType, path: rect.subject }, evidence: {}, supportedFixes: [] }]);
    }
    if (rect.x < left) { left = rect.x; contributors.left = rect.subject; }
    if (rect.y < top) { top = rect.y; contributors.top = rect.subject; }
    if (x2 > right) { right = x2; contributors.right = rect.subject; }
    if (y2 > bottom) { bottom = y2; contributors.bottom = rect.subject; }
  }
  if (!rects.length) left = top = right = bottom = 0;
  return { left, top, right, bottom, width: right - left, height: bottom - top, contributors };
}

export function assertCanvasContains({ diagramType, viewBox, bounds }) {
  const overflow = {
    left: Math.max(0, -bounds.left), top: Math.max(0, -bounds.top),
    right: Math.max(0, bounds.right - viewBox[0]), bottom: Math.max(0, bounds.bottom - viewBox[1]),
  };
  const sides = Object.keys(overflow).filter((side) => overflow[side] > 1e-7);
  if (!sides.length) return;
  const origin = sides.includes('left') || sides.includes('top');
  const code = origin ? 'canvas/origin-conflict' : 'canvas/capacity';
  const message = `${diagramType} paint exceeds the ${sides.join('/')} of the canvas ${viewBox.join('×')}.`;
  throwDiagnosticError(message, [{ code, severity: 'error', message,
    subject: { diagramType, path: bounds.contributors[sides[0]] || '/meta/viewBox' },
    evidence: { actualViewBox: viewBox, paintBounds: bounds, overflow }, supportedFixes: [] }]);
}

// A size is a supported repair only after the same renderer accepts it. Probe
// at most an implicit solve and one explicit confirmation; never retry the CLI
// or mutate authored content. A failed probe retains the original diagnostic.
export function validateContentCanvas({ diagram, resolve, validate }) {
  if (!diagram.meta.viewBox) { resolve(); validate(); return; }
  let failure;
  let receipt;
  try {
    withDiagnosticRecordingSuppressed(() => { receipt = resolve(); validate(); });
    return;
  } catch (error) { failure = error; }
  const diagnostics = failure.archifyDiagnostics;
  if (!diagnostics?.length) throw failure;
  const capacityDiagnostic = (entry) => entry.code === 'canvas/capacity' || entry.code.startsWith('legend/') || entry.code === 'layout/constraint';
  const capacity = diagnostics.some(capacityDiagnostic);
  if (capacity && !diagnostics.some((entry) => ['canvas/origin-conflict', 'canvas/non-finite-bounds'].includes(entry.code))) {
    const authored = diagram.meta.viewBox;
    try {
      const candidate = withDiagnosticRecordingSuppressed(() => {
        delete diagram.meta.viewBox;
        const receipt = resolve();
        validate();
        diagram.meta.viewBox = receipt.canonicalFrame.slice(2);
        resolve();
        validate();
        return [...diagram.meta.viewBox];
      });
      for (const diagnostic of diagnostics) {
        if (!capacityDiagnostic(diagnostic)) continue;
        if (receipt) Object.assign(diagnostic.evidence, { actualViewBox: authored, paintBounds: receipt.paintBounds });
        diagnostic.evidence.requiredViewBox = candidate;
        diagnostic.evidence.repairVerified = true;
        diagnostic.supportedFixes = [`set meta.viewBox to ${JSON.stringify(candidate)}`];
      }
    } catch (error) {
      for (const diagnostic of diagnostics) {
        if (!capacityDiagnostic(diagnostic)) continue;
        diagnostic.evidence.repairVerified = false;
        diagnostic.evidence.candidateDiagnostics = error.archifyDiagnostics || [];
        diagnostic.supportedFixes = [];
      }
    } finally { diagram.meta.viewBox = authored; }
  }
  throwDiagnosticError(failure.message, diagnostics);
}

export function legendPaint(entries, layout) {
  const measured = measureLegend(entries, layout);
  if (!measured?.entries.length) return [];
  return [
    paintRect({ x: layout.x, y: measured.titleY - 14,
      width: textUnits(translateMessage(layout.locale, 'legend.title')) * 12 * 0.7, height: 19 }, '/meta/legend'),
    ...measured.entries.map((entry) => paintRect({ x: entry.x, y: entry.baseline - 14,
      width: entry.width, height: 19 }, `/meta/legend/entries/${entry.kind}`, 1)),
  ];
}

// Only independent content enters this decision. Canvas-relative background
// frames and lifelines are appended after it, never fed back as new content.
export function fitContentCanvas({ rects, diagramType, authoredViewBox, minimumViewBox, entries,
  rightPadding = 40, bottomReserve = 80, legendBaselineInset = 36, locale }) {
  const bounds = paintBounds(rects, diagramType);
  let width = Math.max(minimumViewBox[0], Math.ceil(bounds.right + rightPadding));
  let footprint = legendFootprint(entries, { width: Math.max(1, width - 80), paintAware: true });
  width = Math.max(width, Math.ceil(footprint.minWidth + 80));
  footprint = legendFootprint(entries, { width: Math.max(1, (authoredViewBox?.[0] || width) - 80), paintAware: true });
  const reserve = bottomReserve + footprint.extraHeight;
  const viewBox = authoredViewBox ? [...authoredViewBox]
    : [width, Math.max(minimumViewBox[1], Math.ceil(bounds.bottom + reserve))];
  assertCanvasContains({ diagramType, viewBox, bounds });
  const legendLayout = { x: 40, baselineY: viewBox[1] - legendBaselineInset, paintAware: true, locale,
    width: viewBox[0] - 80, minTitleY: bounds.bottom + 8, unfit: 'error', diagramType };
  const painted = paintBounds([...rects, ...legendPaint(entries, legendLayout)], diagramType);
  assertCanvasContains({ diagramType, viewBox, bounds: painted });
  return { viewBox, reserve, legendLayout, receipt: { mode: 'content',
    source: authoredViewBox ? 'authored' : 'implicit', paintBounds: painted,
    canonicalFrame: [0, 0, ...viewBox] } };
}
