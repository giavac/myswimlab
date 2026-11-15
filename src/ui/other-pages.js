/** Secondary views: performance, trends, and local-data settings. */
import { state } from '../state.js';
import { distanceBests } from '../analytics/best-efforts.js';
import { formatDate, formatSeconds, summary } from '../analytics/metrics.js';
import { lineChart } from './charts.js';
import { metricCards } from './components.js';
import { escapeHtml } from './shared.js';

function effortGroup(sessions, unit) {
  const targets = [25, 50, 100, 200, 400, 800, 1500];
  const efforts = distanceBests(sessions, targets, unit);
  const curve = efforts.filter(effort => effort.time !== null).map(effort => ({
    label: `${effort.distance}${unit}`,
    value: effort.time * 100 / effort.distance
  }));
  const unitHtml = escapeHtml(unit);
  const rows = efforts.map(effort => `
    <tr>
      <td>${effort.distance} ${unitHtml}</td>
      <td class="strong">${formatSeconds(effort.time)}</td>
      <td>${effort.time !== null ? formatSeconds(effort.time * 100 / effort.distance) : '—'}</td>
      <td>${effort.session ? formatDate(effort.session.date) : '—'}</td>
    </tr>`).join('');
  return `
    <section class="panel">
      <div class="panelhead"><div><h2>Best pace — ${unit === 'yd' ? 'yards' : 'meters'}</h2>
        <p>Seconds / 100${unitHtml} · lower is faster</p></div></div>
      ${lineChart(curve, { unit: 'pace', label: `Best pace per 100${unit}` })}
      <div class="tablewrap"><table>
        <thead><tr><th>Distance</th><th>Best time</th><th>Pace /100${unitHtml}</th><th>Session</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
}

export function performancePage(sessions) {
  const units = [...new Set(sessions.filter(s => s.sport === 'pool')
    .map(s => s.poolUnit || 'm'))];
  const shownUnits = units.length ? units : ['m'];
  return `
    <div class="pagehead"><div><h1>Performance curve</h1>
      <p>Best continuous training efforts; suspect lengths excluded; meters and yards kept separate.</p>
    </div></div>
    ${shownUnits.map(unit => effortGroup(sessions, unit)).join('')}
    <p class="fineprint">Different strokes, drills or equipment may not be comparable. Yard pace is /100yd.</p>`;
}

export function trendsPage(sessions) {
  const ordered = [...sessions].reverse();
  const distanceTrend = ordered.map(session => ({
    label: formatDate(session.date, { month: 'short', day: 'numeric' }),
    value: session.distance / 1000
  }));
  const strokeTrend = ordered.map(session => ({
    label: formatDate(session.date, { month: 'short', day: 'numeric' }),
    value: summary([session]).stroke
  })).filter(point => Number.isFinite(point.value));

  return `
    <div class="pagehead"><div><h1>Training trends</h1><p>Track changes across sessions, with context.</p></div></div>
    ${metricCards(sessions)}
    <div class="twocol">
      <section class="panel">
        <div class="panelhead"><div><h2>Session distance</h2><p>Distance in km</p></div></div>
        ${lineChart(distanceTrend, { unit: 'km', fill: true })}
      </section>
      <section class="panel">
        <div class="panelhead"><div><h2>Stroke-count trend</h2><p>Unadjusted mean across recorded active lengths</p></div></div>
        ${lineChart(strokeTrend, { color: '#0a9b9a' })}
      </section>
    </div>
    <div class="panel info"><b>Interpretation caution</b>
      <p>Stroke counts can change with pace, stroke mix, pool length, drills, equipment or measurement error. Future matched-set analysis will reduce these confounders.</p>
    </div>`;
}

export function settingsPage() {
  const folderName = state.folderName ? escapeHtml(state.folderName) : 'No folder selected';
  const folderActions = state.folderHandle ? `
    <button class="secondary" data-folder-refresh="true">Refresh folder</button>
    <button class="danger-lite" data-folder-forget="true">Forget folder</button>` : '';

  return `
    <div class="pagehead"><div><h1>Data & settings</h1><p>Local FIT analysis without cloud synchronization.</p></div></div>
    <div class="twocol">
      <section class="panel">
        <h2>FIT source folder</h2>
        <p class="muted">${folderName}</p>
        <p class="muted">The folder is scanned at startup when permission is available. Use Refresh to detect new or removed FIT files. Continuous filesystem watching is not enabled.</p>
        <div class="buttonstack">
          <button class="primary" data-folder-select="true">Choose / change folder</button>
          ${folderActions}
        </div>
      </section>
      <section class="panel">
        <h2>Privacy & backup</h2>
        <p class="muted">FIT files are processed locally, not uploaded. The folder handle remains in browser storage. Saving notes, length-quality decisions, or restoring a backup also stores a full copy of each affected session (including length data) in IndexedDB.</p>
        <div class="buttonstack">
          <button class="secondary" data-export="true">Export JSON backup</button>
          <button class="secondary" data-restore="true">Restore JSON backup</button>
          <button class="danger-lite" data-clear="true">Clear saved annotations and length decisions</button>
        </div>
        <p class="fineprint">Forgetting a folder or clearing annotations never deletes FIT files. Permissions may expire; private windows do not retain settings.</p>
      </section>
    </div>`;
}
