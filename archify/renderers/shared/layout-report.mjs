/** Serialize computed layout for dry-run / inspect (#9). */

export function layoutNumber(value) {
  return Math.round(value * 1000) / 1000;
}

export function layoutPoint(point) {
  return point.map(layoutNumber);
}

export function componentBox(c) {
  return {
    id: c.id,
    type: c.type,
    label: c.label,
    x: layoutNumber(c.x),
    y: layoutNumber(c.y),
    width: layoutNumber(c.width),
    height: layoutNumber(c.height),
    ...(Number.isInteger(c.row) ? { row: c.row } : {}),
    ...(Number.isInteger(c.col) ? { col: c.col } : {}),
    ...(Number.isInteger(c.stage) ? { stage: c.stage } : {}),
    ...(c.lane !== undefined ? { lane: c.lane } : {}),
    ...(Array.isArray(c.pos) ? { pos: layoutPoint(c.pos) } : {}),
    ...(Number.isFinite(c.xOffset) ? { xOffset: layoutNumber(c.xOffset) } : {}),
    ...(Number.isFinite(c.yOffset) ? { yOffset: layoutNumber(c.yOffset) } : {}),
  };
}

export function boundaryBox(b) {
  return {
    kind: b.kind,
    label: b.label,
    x: layoutNumber(b.x),
    y: layoutNumber(b.y),
    width: layoutNumber(b.width),
    height: layoutNumber(b.height),
    wraps: b.wraps,
  };
}

export function connectionPath(conn, routed, labelAt, collectionIndex) {
  return {
    ...(conn.id ? { id: conn.id } : {}),
    from: conn.from,
    to: conn.to,
    label: conn.label ?? null,
    variant: conn.variant ?? 'default',
    route: conn.route ?? 'auto',
    ...(Number.isInteger(collectionIndex) ? { collectionIndex } : {}),
    points: routed.points.map(layoutPoint),
    ...(labelAt ? { labelAt: layoutPoint(labelAt) } : {}),
  };
}

export function relationshipLabelBox({
  relation,
  relationIndex,
  label,
  x,
  y,
  width,
  height,
  lx,
  ly,
}) {
  return {
    ...(relation?.id ? { id: relation.id } : {}),
    ...(Number.isInteger(relationIndex) ? { collectionIndex: relationIndex } : {}),
    from: relation?.from,
    to: relation?.to,
    text: label ?? relation?.label ?? '',
    x: layoutNumber(x),
    y: layoutNumber(y),
    width: layoutNumber(width),
    height: layoutNumber(height),
    ...([lx, ly].every(Number.isFinite) ? { labelAt: layoutPoint([lx, ly]) } : {}),
  };
}

export function resolvedLayoutReport({
  type,
  viewBox,
  validation,
  entityKey,
  entities,
  relationships,
  labels,
  extras = {},
  compatibility = {},
}) {
  return {
    schemaVersion: 1,
    ok: validation.status === 'pass',
    type,
    diagram_type: type,
    viewBox: viewBox.map(layoutNumber),
    validation,
    resolved: {
      [entityKey]: entities,
      relationships,
      labels,
      ...extras,
    },
    ...compatibility,
  };
}

export function emitResolvedLayoutReport({ validate, build }) {
  let validation = { status: 'pass', diagnostics: [] };
  try {
    validate();
  } catch (error) {
    if (!Array.isArray(error?.archifyDiagnostics) || error.archifyDiagnostics.length === 0) {
      throw error;
    }
    validation = {
      status: 'fail',
      error: error.message,
      diagnostics: error.archifyDiagnostics,
    };
  }
  const report = build(validation);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (validation.status === 'fail') process.exitCode = 1;
  return report;
}
