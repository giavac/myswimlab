import { active, assessLengths } from './length-quality.js';

export const BEST_DISTANCES = [25, 50, 100, 200, 400, 800, 1000, 1500];

/**
 * Find the fastest continuous segments of exactly the requested distances.
 *
 * Input is an array of normalized SwimSession objects, not raw FIT messages.
 * Excluded lengths contribute no distance or time. Rests and gaps stop a segment.
 */
/** @param {string} unit - 'm' or 'yd'; units are never mixed. */
export function distanceBests(sessions, targets = BEST_DISTANCES, unit = 'm') {
  const results = [];

  for (const target of targets) {
    let best = null;
    const targetMeters = unit === 'yd' ? target * 0.9144 : target;

    for (const session of sessions) {
      if (session.sport !== 'pool') continue;
      if ((session.poolUnit || 'm') !== unit) continue;

      const lengths = session.lengths || [];
      const flags = assessLengths(session);
      for (let start = 0; start < lengths.length; start++) {
        const first = lengths[start];
        if (!active(first) || flags[start].excluded) continue;

        let distance = 0;
        let time = 0;

        for (let end = start; end < lengths.length; end++) {
          const length = lengths[end];
          if (!active(length)) break;
          if (end > start && !isConsecutive(lengths[end - 1], length)) break;
          if (flags[end].excluded) continue;

          distance += length.distance;
          time += length.duration;

          // Allow a small FIT rounding error, not a yard/meter crossover.
          if (Math.abs(distance - targetMeters) <= 0.05) {
            if (!best || time < best.time) {
              // start and end are indexes into session.lengths (inclusive).
              best = { distance: target, distanceMeters: targetMeters, unit, time, session, start, end };
            }
            break;
          }
          if (distance > targetMeters + 0.05) break;
        }
      }
    }

    results.push(best || { distance: target, distanceMeters: targetMeters, unit, time: null, session: null });
  }
  return results;
}

function isConsecutive(previous, current) {
  if (Number.isInteger(previous.sequence) && Number.isInteger(current.sequence)) {
    if (current.sequence !== previous.sequence + 1) return false;
  }
  if (Number.isInteger(previous.index) && Number.isInteger(current.index)) {
    if (current.index !== previous.index + 1) return false;
  }
  return true;
}
