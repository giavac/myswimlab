/** Pure calculations over normalized swimming sessions. No DOM or FIT parsing. */
import { active, assessLengths, paceTotals } from './length-quality.js';

export function pace(session) {
  if (!session) return null;
  const totals = paceTotals(session);
  return totals.distance > 0 && totals.duration > 0
    ? (totals.duration * 100) / totals.distance : null;
}

export function summary(sessions) {
  const distance = sessions.reduce((total, session) => total + session.distance, 0);
  const duration = sessions.reduce((total, session) => total + session.duration, 0);
  const qualityTotals = sessions.map(paceTotals);
  const paceDistance = qualityTotals.reduce((total, item) => total + item.distance, 0);
  const paceDuration = qualityTotals.reduce((total, item) => total + item.duration, 0);
  const excluded = qualityTotals.reduce((total, item) => total + item.excluded, 0);
  const activeLengths = sessions.flatMap(session => {
    const flags = assessLengths(session);
    return (session.lengths || []).filter((length, index) =>
      active(length) && !flags[index].excluded);
  });
  const lengthsWithStrokes = activeLengths.filter(length => Number.isFinite(length.strokes));

  const meanStrokes = lengthsWithStrokes.length
    ? lengthsWithStrokes.reduce((total, length) => total + length.strokes, 0) / lengthsWithStrokes.length
    : null;

  return {
    sessions: sessions.length,
    distance,
    duration,
    // Keep recorded distance and time intact. Only pace/stroke analytics are filtered.
    pace: paceDistance > 0 ? paceDuration * 100 / paceDistance : null,
    excluded,
    stroke: meanStrokes,
    strokeLengths: lengthsWithStrokes.length, // Sample size for `stroke`.
    activeLengths: activeLengths.length
  };
}

export function lengthDrift(session) {
  const flags = assessLengths(session || { lengths: [] });
  const lengths = (session?.lengths || [])
    .filter((length, index) => !length.isRest && !flags[index].excluded &&
      Number.isFinite(length.strokes));
  if (lengths.length < 8) return null;

  const count = Math.max(2, Math.floor(lengths.length / 4));
  const average = entries => entries.reduce((total, length) => total + length.strokes, 0) / entries.length;
  const first = average(lengths.slice(0, count));
  const last = average(lengths.slice(-count));
  return first > 0 ? 100 * (last - first) / first : null;
}

export function weekVolumes(sessions) {
  const totals = new Map();

  for (const session of sessions) {
    const date = new Date(session.date);
    // Group by the user's local calendar week, not UTC midnight.
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);

    const week = [monday.getFullYear(), String(monday.getMonth() + 1).padStart(2, '0'),
      String(monday.getDate()).padStart(2, '0')].join('-');
    totals.set(week, (totals.get(week) || 0) + session.distance);
  }

  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([week, meters]) => ({
    label: formatDate(`${week}T12:00:00`, { month: 'short', day: 'numeric' }),
    value: meters / 1000
  }));
}

// Formatting is presentation-only; kept separate from the numeric functions above.
export function formatNumber(value, decimals = 0) {
  return Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: decimals })
    : '—';
}

export function formatSeconds(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export function formatDuration(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(value).toLocaleDateString('en-GB', options);
}
