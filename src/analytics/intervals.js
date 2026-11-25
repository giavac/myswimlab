/**
 * Swim intervals derived from pool lengths. Garmin closes an interval when the
 * swimmer starts a rest, so the active lengths between rest markers are one
 * interval. Pass quality decisions to omit excluded active lengths.
 */
import { active, assessLengths } from './length-quality.js';

/**
 * @returns {{first: number, last: number, lengths: number, distance: number,
 *   duration: number, strokes: number|null, rest: number|null}[]}
 *   `first`/`last` are length indices; distance is meters; times are seconds.
 */
export function intervals(session, quality = []) {
  const result = [];
  let current = null;

  (session?.lengths || []).forEach((length, index) => {
    if (length.isRest) {
      if (current) {
        current.rest = (current.rest ?? 0) + (Number.isFinite(length.duration) ? length.duration : 0);
      }
      return;
    }
    if (!active(length) || quality[index]?.excluded) return;
    if (!current || current.rest !== null) {
      current = { first: index, last: index, lengths: 0, distance: 0, duration: 0, strokes: 0, rest: null };
      result.push(current);
    }
    current.last = index;
    current.lengths += 1;
    current.distance += length.distance;
    current.duration += length.duration;
    current.strokes = Number.isFinite(length.strokes) && current.strokes !== null
      ? current.strokes + length.strokes : null;
  });

  return result;
}

/** Group consecutive intervals by length count by default, e.g. 5 × 200 m. */
export function intervalSets(list, key = interval => interval.lengths) {
  const sets = [];
  for (const interval of list) {
    const previous = sets[sets.length - 1];
    if (previous && key(previous.intervals[0]) === key(interval)) {
      previous.intervals.push(interval);
    } else {
      sets.push({ intervals: [interval] });
    }
  }
  return sets;
}

/** Classify interval swim time by pace relative to the user's seconds per 100. */
export function intervalPaceBands(sessions, unit, reference) {
  const bands = { faster: 0, near: 0, slower: 0 };
  let skipped = 0;
  const hundredInMeters = unit === 'yd' ? 91.44 : 100;

  for (const session of sessions) {
    if (session.sport !== 'pool' || (session.poolUnit || 'm') !== unit) continue;
    const flags = assessLengths(session);
    for (const interval of intervals(session)) {
      if (flags.slice(interval.first, interval.last + 1).some(flag => flag.excluded)) {
        skipped++;
        continue;
      }
      const pace = interval.duration * hundredInMeters / interval.distance;
      const band = pace < reference * 0.95 ? 'faster' : pace > reference * 1.05 ? 'slower' : 'near';
      bands[band] += interval.duration;
    }
  }
  return { bands, skipped };
}

function medianRecorded(values) {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

/** Summarize recorded pool sets by repeat distance in the requested pool unit. */
export function setsByRepeatDistance(sessions, unit) {
  const metersPerUnit = unit === 'yd' ? 0.9144 : 1;
  const repeatDistance = interval => Math.round(interval.distance / metersPerUnit * 100) / 100;
  const groups = new Map();

  for (const session of sessions) {
    if (session.sport !== 'pool' || (session.poolUnit || 'm') !== unit) continue;
    const recorded = intervals(session, assessLengths(session));
    for (const { intervals: repeats } of intervalSets(recorded, repeatDistance)) {
      const distance = repeatDistance(repeats[0]);
      const group = groups.get(distance) || { distance, totalDistance: 0, duration: 0, sets: [], sessions: new Set() };
      const duration = repeats.reduce((total, repeat) => total + repeat.duration, 0);
      const meters = repeats.reduce((total, repeat) => total + repeat.distance, 0);
      group.totalDistance += meters / metersPerUnit;
      group.duration += duration;
      group.sessions.add(session.id);
      group.sets.push({
        session,
        count: repeats.length,
        duration,
        medianPace: medianRecorded(repeats.map(repeat => repeat.duration * 100 * metersPerUnit / repeat.distance)),
        medianRest: medianRecorded(repeats.map(repeat => repeat.rest)),
        uncertain: recorded.length === 1 && repeats[0].lengths > 1 && repeats[0].rest === null
      });
      groups.set(distance, group);
    }
  }

  return [...groups.values()].sort((a, b) => a.distance - b.distance);
}
