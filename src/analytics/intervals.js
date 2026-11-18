/**
 * Swim intervals derived from pool lengths. Garmin closes an interval when the
 * swimmer starts a rest, so the active lengths between rest markers are one
 * interval. Values are as recorded: quality decisions do not change them.
 */
import { active } from './length-quality.js';

/**
 * @returns {{first: number, last: number, lengths: number, distance: number,
 *   duration: number, strokes: number|null, rest: number|null}[]}
 *   `first`/`last` are length indices; distance is meters; times are seconds.
 */
export function intervals(session) {
  const result = [];
  let current = null;

  (session?.lengths || []).forEach((length, index) => {
    if (length.isRest) {
      if (current) {
        current.rest = (current.rest ?? 0) + (Number.isFinite(length.duration) ? length.duration : 0);
      }
      return;
    }
    if (!active(length)) return;
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

/** Group consecutive intervals with the same number of lengths, e.g. 5 × 200 m. */
export function intervalSets(list) {
  const sets = [];
  for (const interval of list) {
    const previous = sets[sets.length - 1];
    if (previous && previous.intervals[0].lengths === interval.lengths) {
      previous.intervals.push(interval);
    } else {
      sets.push({ intervals: [interval] });
    }
  }
  return sets;
}
