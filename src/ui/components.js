/** Reusable view fragments. Each accepts data and returns an HTML string. */
import {
  formatNumber, formatSeconds, formatDuration, formatDate, pace, summary
} from '../analytics/metrics.js';
import { icon, escapeHtml, tag } from './shared.js';
import { assessLengths } from '../analytics/length-quality.js';

export function metric(title, valueHtml, description, iconName) {
  return `
    <article class="metric">
      <div class="metric-top">
        <span>${escapeHtml(title)}</span>
        <span class="metric-icon">${icon(iconName)}</span>
      </div>
      <strong>${valueHtml}</strong>
      <p>${escapeHtml(description)}</p>
    </article>`;
}

export function metricCards(sessions) {
  const total = summary(sessions);
  return `
    <div class="metrics">
      ${metric('Total distance', `${formatNumber(total.distance / 1000, 2)} <small>km</small>`, 'Across selected sessions', 'wave')}
      ${metric('Sessions', formatNumber(total.sessions), 'Swimming activities from your chosen files', 'calendar')}
      ${metric(total.excluded ? 'Filtered pace' : 'Average pace', `${formatSeconds(total.pace)} <small>/100m</small>`, total.excluded ? `${total.excluded} suspect ${total.excluded === 1 ? 'length' : 'lengths'} excluded · totals unchanged` : 'Moving time, distance weighted', 'chart')}
      ${metric('Strokes / length', formatNumber(total.stroke, 1), 'Only available pool lengths', 'wave')}
      ${metric('Time swimming', formatDuration(total.duration), 'Moving time', 'calendar')}
    </div>`;
}

export function emptyState(title, message) {
  return `
    <div class="empty">
      <div class="empty-symbol">${icon('wave', 34)}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="buttonstack">
        <button class="primary" data-folder-select="true">${icon('upload', 17)} Choose FIT folder</button>
        <button class="secondary" data-upload="true">Import individual FIT files</button>
      </div>
    </div>`;
}

export function recentTable(sessions, compact = false) {
  if (!sessions.length) {
    return emptyState('No sessions yet', 'Import Garmin FIT activities to see your training history.');
  }

  const visible = compact ? sessions.slice(0, 6) : sessions;
  const rows = visible.map(session => `
    <tr data-select="${escapeHtml(session.id)}">
      <td>${formatDate(session.date)}</td>
      <td class="strong"><button class="session-link" data-select="${escapeHtml(session.id)}">${escapeHtml(session.title)}</button></td>
      <td>${formatNumber(session.distance)} m</td>
      <td>${formatDuration(session.duration)}</td>
      <td>${formatSeconds(pace(session))}</td>
      <td>${formatNumber(summary([session]).stroke, 1)}</td>
      <td>${tag(session.source, 'real')}</td>
      <td class="arrow">›</td>
    </tr>`).join('');

  return `
    <div class="tablewrap">
      <table>
        <thead><tr>
          <th>Date</th><th>Workout</th><th>Distance</th><th>Moving time</th>
          <th>Pace /100m</th><th>Stroke count</th><th>Source</th><th></th>
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
        <td>${index + 1}</td>
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
        <thead><tr><th>#</th><th>Type</th><th>Duration</th><th>Pace</th><th>Strokes</th><th>Cadence</th><th>Quality control</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
  const recentDistances = recent.map(session => session.distance);
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
