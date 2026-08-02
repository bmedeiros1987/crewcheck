function clean(value) {
  return String(value ?? '').trim();
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeActiveRosterIdentity(summary = {}) {
  const source = summary && typeof summary === 'object' ? summary : {};
  return {
    id: clean(source.id),
    checksum: clean(source.checksum),
    year: normalizeNumber(source.year),
    month: normalizeNumber(source.month),
    createdAt: clean(source.createdAt || source.created_at),
    activeAt: clean(source.activeAt || source.active_at),
    sourceFileName: clean(source.sourceFileName || source.source_file_name),
  };
}

export function compareActiveRosterIdentity(leftSummary, rightSummary) {
  const left = normalizeActiveRosterIdentity(leftSummary);
  const right = normalizeActiveRosterIdentity(rightSummary);

  if (!leftSummary && !rightSummary) return { status: 'missing-both', left, right, same: true };
  if (!leftSummary) return { status: 'remote-only', left, right, same: false };
  if (!rightSummary) return { status: 'local-only', left, right, same: false };

  if (left.checksum && right.checksum) {
    return {
      status: left.checksum === right.checksum ? 'match' : 'conflict',
      reason: left.checksum === right.checksum ? 'checksum' : 'checksum-mismatch',
      left,
      right,
      same: left.checksum === right.checksum,
    };
  }

  if (left.id && right.id && left.id === right.id) {
    return { status: 'match', reason: 'id', left, right, same: true };
  }

  const samePeriod = left.year !== null && right.year !== null && left.month !== null && right.month !== null
    && left.year === right.year && left.month === right.month;

  if (!samePeriod) {
    return { status: 'conflict', reason: 'reference-period-mismatch', left, right, same: false };
  }

  // Same month without a stable checksum/id is not enough evidence to silently
  // choose one snapshot. Different imports can represent different revisions of
  // the same published month.
  return { status: 'ambiguous', reason: 'same-period-without-stable-identity', left, right, same: false };
}

export function reconcileActiveRosterIdentity({ remote, local } = {}) {
  const comparison = compareActiveRosterIdentity(remote, local);

  if (comparison.status === 'match') {
    return { decision: 'use-canonical', source: 'matched', comparison };
  }
  if (comparison.status === 'remote-only') {
    return { decision: 'use-remote', source: 'remote-only', comparison };
  }
  if (comparison.status === 'local-only') {
    return { decision: 'use-local', source: 'local-only', comparison };
  }
  if (comparison.status === 'missing-both') {
    return { decision: 'missing', source: 'none', comparison };
  }

  // Fail closed. A conflict or ambiguity must be reconciled explicitly by the
  // caller; this contract never declares the remote or local snapshot correct
  // just because one endpoint answered first.
  return { decision: 'confirm', source: 'conflict', comparison };
}
