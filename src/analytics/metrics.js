/** Pure calculations over normalized swimming sessions. No DOM or FIT parsing. */
import { active, assessLengths, paceTotals } from './length-quality.js';

export function pace(session) {
  if (!session) return null;
  const totals = paceTotals(session);
  return totals.distance > 0 && totals.duration > 0
    ? (totals.duration * 100) / totals.distance : null;
}

export function summary(sessions) {
  const qualityTotals = sessions.map(paceTotals);
  const distance = qualityTotals.reduce((total, item) => total + item.distance, 0);
  const duration = qualityTotals.reduce((total, item) => total + item.duration, 0);
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
    pace: distance > 0 ? duration * 100 / distance : null,
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

function localMonday(value) {
  const date = new Date(value);
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return monday;
}

function weeklyTotals(sessions) {
  const totals = new Map();
  for (const session of sessions) {
    const week = localMonday(session.date).getTime();
    const total = totals.get(week) || { distance: 0, duration: 0, sessions: 0 };
    const adjusted = paceTotals(session);
    total.distance += adjusted.distance;
    total.duration += adjusted.duration;
    total.sessions++;
    totals.set(week, total);
  }
  return totals;
}

export function weekVolumes(sessions) {
  return [...weeklyTotals(sessions)].sort(([a], [b]) => a - b).map(([week, total]) => ({
    label: formatDate(week, { month: 'short', day: 'numeric' }),
    value: total.distance / 1000
  }));
}

export function weeklyTraining(sessions, now = new Date()) {
  const totals = weeklyTotals(sessions);
  const dates = [...totals.keys()].sort((a, b) => a - b);
  const currentMonday = localMonday(now).getTime();
  const completed = [];
  const current = totals.get(currentMonday) ?? null;
  const last = Math.min(dates.at(-1), currentMonday - 1);

  // Advance by calendar weeks to stay on Monday across daylight saving changes.
  for (const monday = new Date(dates[0]); monday.getTime() <= last; monday.setDate(monday.getDate() + 7)) {
    const week = monday.getTime();
    completed.push({ week, ...(totals.get(week) || { distance: 0, duration: 0, sessions: 0 }) });
  }

  const sum = { distance: 0, duration: 0, sessions: 0 };
  let activeWeeks = 0;
  for (const week of completed) {
    sum.distance += week.distance;
    sum.duration += week.duration;
    sum.sessions += week.sessions;
    if (week.sessions > 0) activeWeeks++;
  }

  const average = completed.length ? {
    distance: sum.distance / completed.length,
    duration: sum.duration / completed.length,
    sessions: sum.sessions / completed.length
  } : null;
  return { completed, current, average, activeWeeks };
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
