/** Reusable view fragments. Each accepts data and returns an HTML string. */
import {
  formatNumber, formatSeconds, formatDuration, formatDate, pace, summary
} from '../analytics/metrics.js';
import { icon, escapeHtml, tag, recordNumber } from './shared.js';
import { assessLengths, paceTotals } from '../analytics/length-quality.js';
import { BEST_DISTANCES, distanceBests } from '../analytics/best-efforts.js';
import { intervals, intervalSets } from '../analytics/intervals.js';
import { sortedSessions } from '../state.js';

/** An instrument readout. `tone` 'warn' colors the description as a warning. */
export function metric(title, valueHtml, description, tone = '', kana = '') {
  return `
    <article class="metric">
      <div class="metric-top"><span>${escapeHtml(title)}</span>${kana ? `<span class="kana" lang="ja">${escapeHtml(kana)}</span>` : ''}</div>
      <strong>${valueHtml}</strong>
      <p class="${tone === 'warn' ? 'warn' : ''}">${escapeHtml(description)}</p>
    </article>`;
}

export function metricCards(sessions, showKana = false) {
  const total = summary(sessions);
  const pool = sessions.filter(session => session.sport === 'pool').length;
  return `
    <div class="metrics">
      ${metric('Distance', `${formatNumber(total.distance / 1000, 2)} <small>km</small>`, 'Total distance', '', showKana ? 'きょり' : '')}
      ${metric('Swim time', formatDuration(total.duration), 'Moving time', '', showKana ? 'じかん' : '')}
      ${metric('Sessions', formatNumber(total.sessions), `pool ${pool} · open water ${total.sessions - pool}`)}
      ${metric(total.excluded ? 'Pace · filtered' : 'Pace · average', `${formatSeconds(total.pace)} <small>/100m</small>`, total.excluded ? `▲ ${total.excluded} suspect ${total.excluded === 1 ? 'length' : 'lengths'} excluded` : 'Moving time, distance weighted', total.excluded ? 'warn' : '')}
      ${metric('Strokes / length', formatNumber(total.stroke, 1), total.strokeLengths ? `μ · n=${formatNumber(total.strokeLengths)} lengths` : 'No stroke data')}
    </div>`;
}

/** IDs of sessions that hold a current best for any distance, over all loaded sessions. */
function personalBestIds() {
  const all = sortedSessions();
  const ids = new Set();
  for (const unit of ['m', 'yd']) {
    for (const effort of distanceBests(all, BEST_DISTANCES, unit)) {
      if (effort.session) ids.add(effort.session.id);
    }
  }
  return ids;
}

export function emptyState(title, message) {
  return `
    <div class="empty">
      <div class="empty-symbol">${icon('wave', 34)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="buttonstack">
        <button class="primary" data-upload="true">${icon('upload', 17)} Import FIT files</button>
      </div>
    </div>`;
}

export function recentTable(sessions, compact = false) {
  if (!sessions.length) {
    return emptyState('No sessions yet', 'Import Garmin FIT activities to see your training history.');
  }

  const visible = compact ? sessions.slice(0, 6) : sessions;
  const bests = personalBestIds();
  const rows = visible.map(session => {
    const totals = paceTotals(session);
    const suspect = totals.excluded;
    return `
    <tr data-select="${escapeHtml(session.id)}">
      <td>${formatDate(session.date)}</td>
      <td class="strong"><button class="session-link" data-select="${escapeHtml(session.id)}">${escapeHtml(session.title)}</button>${bests.has(session.id) ? ' <span class="pb-mark" title="Holds a current personal best">PB</span>' : ''}</td>
      <td>${formatNumber(totals.distance, 2)} m</td>
      <td>${formatDuration(totals.duration)}</td>
      <td>${formatSeconds(pace(session))}</td>
      <td>${formatNumber(summary([session]).stroke, 1)}</td>
      <td class="${suspect ? 'warn' : 'muted'}">${suspect ? `▲ ${suspect}` : '—'}</td>
      <td>${tag(session.source, 'real')}</td>
      <td class="arrow">›</td>
    </tr>`;
  }).join('');

  return `
    <div class="tablewrap">
      <table>
        <thead><tr>
          <th>Date</th><th>Workout</th><th>Dist</th><th>Swim time</th>
          <th>Pace /100m</th><th>Str/len</th><th title="Lengths excluded by quality control">QC</th><th>Src</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function lengthTable(session) {
  const lengths = session.lengths || [];
  if (!lengths.length) return '<div class="hint">No individual pool lengths in this activity.</div>';

  const flags = assessLengths(session);
  const rows = lengths.map((length, index) => {
    const flag = flags[index];
    const sequence = Number.isInteger(length.sequence) ? length.sequence : index;
    const status = flag.manual === 'keep' ? 'Kept manually'
      : flag.manual === 'exclude' ? 'Excluded manually'
      : flag.excluded ? 'Suspected artifact' : '';
    const action = length.isRest ? '' : flag.manual
      ? `<button class="quality-action" data-quality-sequence="${sequence}" data-quality-decision="reset"
          aria-label="Reset quality decision for record ${index + 1}">Reset</button>`
      : flag.excluded
        ? `<button class="quality-action" data-quality-sequence="${sequence}" data-quality-decision="keep"
            aria-label="Keep record ${index + 1} in analytics">Keep</button>`
        : `<button class="quality-action" data-quality-sequence="${sequence}" data-quality-decision="exclude"
            aria-label="Exclude record ${index + 1} from analytics">Exclude</button>`;
    return `
      <tr id="length-${index}" class="${flag.excluded ? 'excluded-length' : ''}">
        <td>${flag.excluded ? '▲ ' : ''}${recordNumber(index)}</td>
        <td>${length.isRest ? tag('Rest') : tag('Swim', 'real')}</td>
        <td>${formatSeconds(length.duration)}</td>
        <td>${length.isRest || !length.distance ? '—' : formatSeconds(length.duration * 100 / length.distance)}</td>
        <td>${formatNumber(length.strokes)}</td>
        <td>${formatNumber(length.cadence)}</td>
        <td><span class="quality-status" title="${escapeHtml(flag.reason || '')}">${status}</span> ${action}</td>
      </tr>`;
  }).join('');

  return `
    <div class="length-scroll">
      <table>
        <thead><tr><th>Rec</th><th>Type</th><th>Duration</th><th>Pace</th><th>Strokes</th><th>Cadence</th><th>Quality control</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Workout structure (e.g. "5 × 200 m · 100 m") and one row per interval. */
export function intervalTable(session, recorded = intervals(session, assessLengths(session))) {
  const sets = intervalSets(recorded);
  if (!sets.length) return '';

  const unit = escapeHtml(session.poolUnit || 'm');
  const distance = interval => interval.distance / (session.poolUnit === 'yd' ? 0.9144 : 1);
  const setName = set => `${set.intervals.length > 1 ? `${set.intervals.length} × ` : ''}${formatNumber(distance(set.intervals[0]))} ${unit}`;

  const rows = sets.map(set => set.intervals.map((interval, position) => `
      <tr class="interval-row${position === 0 ? ' set-start' : ''}">
        <td class="set-name">${position === 0 ? setName(set) : ''}</td>
        <td>${position + 1}</td>
        <td>${formatNumber(distance(interval))} ${unit}</td>
        <td>${formatSeconds(interval.duration)}</td>
        <td>${formatSeconds(interval.duration * 100 / distance(interval))}</td>
        <td>${formatNumber(interval.strokes)}</td>
        <td>${formatSeconds(interval.rest)}</td>
        <td>${interval.rest === null ? '—' : formatSeconds(interval.duration + interval.rest)}</td>
      </tr>`).join('')).join('');

  return `
    <p class="interval-summary">${sets.map(setName).join(' · ')}</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Set</th><th>#</th><th>Dist</th><th>Time</th><th>Pace /100${unit}</th><th>Strokes</th><th>Rest after</th><th>Restart after</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

export function sessionInsight(sessions) {
  if (sessions.length < 2) return 'Add more sessions with valid distance and duration to explore pace changes.';

  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const firstPace = pace(first);
  const lastPace = pace(last);
  if (!firstPace || !lastPace) return 'Add more sessions with valid distance and duration to explore pace changes.';

  const difference = lastPace - firstPace;
  const change = Math.abs(difference);
  const headline = change < 1 ? 'Session-average pace is broadly stable.'
    : difference < 0 ? `Latest session average is ${formatSeconds(change)} /100m faster.`
    : `Latest session average is ${formatSeconds(change)} /100m slower.`;

  const recent = ordered.slice(-3);
  const recentDistances = recent.map(session => paceTotals(session).distance);
  const variability = Math.max(...recentDistances) - Math.min(...recentDistances);
  const context = variability < 200
    ? 'Recent session distances are similar, making volume easier to compare.'
    : 'Workout distances vary: compare matching repetitions rather than treating average pace as a fitness score.';

  return `
    <b>${headline}</b>
    <p>Comparing ${formatDate(first.date, { month: 'short', day: 'numeric' })} with
      ${formatDate(last.date, { month: 'short', day: 'numeric' })}.
      You have ${sessions.length} sessions and ${formatNumber(summary(sessions).distance / 1000, 2)} km in this view.</p>
    <p>${context}</p>
    <p class="muted">Intensity, stroke and equipment are not normalized. This is an observation, not a diagnosis.</p>`;
}
