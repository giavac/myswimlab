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
export const FAST_TIME_RATIO = 0.60;
export const LOW_STROKE_RATIO = 0.65;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function active(length) {
  return length && !length.isRest && Number.isFinite(length.duration) && length.duration > 0 &&
    Number.isFinite(length.distance) && length.distance > 0;
}

/**
 * Session medians used by the automatic rule, or null when there are fewer
 * than MIN_REFERENCE_LENGTHS active lengths with stroke counts.
 * Returns { timePerMeter, strokes }.
 */
export function qualityBaseline(session) {
  const reference = (session.lengths || []).filter(length =>
    active(length) && Number.isFinite(length.strokes) && length.strokes > 0);
  if (reference.length < MIN_REFERENCE_LENGTHS) return null;
  return {
    timePerMeter: median(reference.map(length => length.duration / length.distance)),
    strokes: median(reference.map(length => length.strokes))
  };
}

/**
 * Returns one result per source record, including rest markers.
 * Each result has { excluded, automatic, reason, manual }.
 * Results are deterministic, calculated only from a normalized SwimSession.
 */
export function assessLengths(session) {
  const lengths = session.lengths || [];
  const baseline = qualityBaseline(session);
  const baselineTime = baseline?.timePerMeter ?? null;
  const baselineStrokes = baseline?.strokes ?? null;
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
 * Derive displayed pool totals from the recorded session and its exclusions.
 * Preserve time from a separate FIT timer or swim-time field.
 */
export function paceTotals(session) {
  const original = { distance: session.distance || 0, duration: session.duration || 0, excluded: 0 };
  if (session.sport !== 'pool') return original;

  const lengths = session.lengths || [];
  const flags = assessLengths(session);
  let fullDistance = 0;
  let fullDuration = 0;
  let removedDistance = 0;
  let removedDuration = 0;
  let excluded = 0;
  lengths.forEach((length, index) => {
    if (!active(length)) return;
    fullDistance += length.distance;
    fullDuration += length.duration;
    if (flags[index].excluded) {
      removedDistance += length.distance;
      removedDuration += length.duration;
      excluded++;
    }
  });
  if (!excluded) return original;

  // Reconcile what the watch already omitted before subtracting recorded lengths.
  // Keep any distance outside the length records when the FIT total is larger.
  const alreadyOmitted = Math.max(0, fullDistance - original.distance);
  const distance = Math.max(0, original.distance - Math.max(0, removedDistance - alreadyOmitted));
  const canAdjustTime = session.durationBasis === 'active-lengths' ||
    (!session.durationBasis && Math.abs(fullDuration - original.duration) <= 0.5);
  return {
    distance,
    duration: canAdjustTime ? Math.max(0, original.duration - removedDuration) : original.duration,
    excluded
  };
}
