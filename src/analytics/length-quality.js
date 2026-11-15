/**
 * Quality control for individual pool lengths.
 *
 * FIT records are never edited. We automatically exclude only unusually fast
 * lengths that ALSO have unusually few strokes. This conservative two-signal
 * rule avoids rejecting genuine sprint efforts on pace alone.
 *
 * Users may override either decision. Overrides are keyed by stable FIT record
 * sequence; they are stored with annotations, not in the original FIT file.
 */
const MIN_REFERENCE_LENGTHS = 8;
const FAST_TIME_RATIO = 0.60;
const LOW_STROKE_RATIO = 0.65;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function active(length) {
  return length && !length.isRest && Number.isFinite(length.duration) && length.duration > 0 &&
    Number.isFinite(length.distance) && length.distance > 0;
}

/**
 * Returns one result per source record, including rest markers.
 * Each result has { excluded, automatic, reason, manual }.
 * Results are deterministic, calculated only from a normalized SwimSession.
 */
export function assessLengths(session) {
  const lengths = session.lengths || [];
  const activeLengths = lengths.filter(active);
  const reference = activeLengths.filter(length => Number.isFinite(length.strokes) && length.strokes > 0);
  const baselineTime = reference.length >= MIN_REFERENCE_LENGTHS
    ? median(reference.map(length => length.duration / length.distance)) : null;
  const baselineStrokes = reference.length >= MIN_REFERENCE_LENGTHS
    ? median(reference.map(length => length.strokes)) : null;
  const overrides = session.lengthOverrides || {};

  return lengths.map((length, index) => {
    const sequence = Number.isInteger(length.sequence) ? length.sequence : index;
    const choice = overrides[String(sequence)];
    const isCandidate = active(length) && baselineTime !== null &&
      Number.isFinite(length.strokes) && length.strokes >= 0 &&
      length.duration / length.distance < baselineTime * FAST_TIME_RATIO &&
      length.strokes < baselineStrokes * LOW_STROKE_RATIO;

    // An explicitly kept length can override an automatic suspicion.
    const excluded = choice === 'exclude' || (isCandidate && choice !== 'keep');
    return {
      excluded,
      automatic: isCandidate,
      manual: choice === 'exclude' ? 'exclude' : choice === 'keep' ? 'keep' : null,
      reason: isCandidate ? 'Exceptionally fast with unusually few strokes' : null
    };
  });
}

/**
 * Return totals suitable for a quality-filtered pace estimate.
 * Only adjust a pool session when active lengths cover the reported FIT
 * swimming distance and duration; otherwise retain the session totals.
 */
export function paceTotals(session) {
  const original = { distance: session.distance || 0, duration: session.duration || 0, excluded: 0 };
  if (session.sport !== 'pool' || session.durationBasis !== 'active-lengths') return original;

  const lengths = session.lengths || [];
  const activeLengths = lengths.filter(active);
  const fullDistance = activeLengths.reduce((sum, length) => sum + length.distance, 0);
  const fullDuration = activeLengths.reduce((sum, length) => sum + length.duration, 0);
  if (Math.abs(fullDistance - session.distance) > 0.5 ||
      Math.abs(fullDuration - session.duration) > 0.5) return original;

  const assessments = assessLengths(session);
  const excluded = lengths.filter((length, index) => active(length) && assessments[index].excluded);
  if (!excluded.length) return original;

  const removedDistance = excluded.reduce((sum, length) => sum + length.distance, 0);
  const removedDuration = excluded.reduce((sum, length) => sum + length.duration, 0);
  return {
    distance: Math.max(0, session.distance - removedDistance),
    duration: Math.max(0, session.duration - removedDuration),
    excluded: excluded.length
  };
}
