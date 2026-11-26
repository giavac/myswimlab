import { active, assessLengths } from './length-quality.js';

export const BEST_DISTANCES = [25, 50, 100, 200, 400, 800, 1000, 1500];

/**
 * Find the fastest continuous segments of exactly the requested distances.
 *
 * Input is an array of normalized SwimSession objects, not raw FIT messages.
 * Excluded lengths contribute time but no distance. Rests and gaps stop a segment.
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
          time += length.duration;
          if (flags[end].excluded) continue;

          distance += length.distance;

          // Allow a small FIT rounding error, not a yard/meter crossover.
          if (Math.abs(distance - targetMeters) <= 0.05) {
            // A full bout also includes flagged time at either end. A shorter
            // split uses the time from its first through its last retained length.
            const before = excludedEdgeTime(lengths, flags, start, -1);
            const after = excludedEdgeTime(lengths, flags, end, 1);
            const effortTime = before === null || after === null ? time : time + before + after;
            if (!best || effortTime < best.time) {
              // start and end are indexes into session.lengths (inclusive).
              best = { distance: target, distanceMeters: targetMeters, unit, time: effortTime, session, start, end };
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

function excludedEdgeTime(lengths, flags, from, direction) {
  let duration = 0;
  for (let index = from + direction; active(lengths[index]); index += direction) {
    const neighbor = index - direction;
    if (!isConsecutive(lengths[Math.min(index, neighbor)], lengths[Math.max(index, neighbor)])) break;
    if (!flags[index].excluded) return null;
    duration += lengths[index].duration;
  }
  return duration;
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
