/** Secondary views: performance, trends, and local-data settings. */
import { distanceBests } from '../analytics/best-efforts.js';
import { formatDate, formatDuration, formatNumber, formatSeconds, summary, weeklyTraining } from '../analytics/metrics.js';
import { barChart, lineChart } from './charts.js';
import { metricCards } from './components.js';
import { escapeHtml } from './shared.js';

function effortGroup(sessions, unit, figure) {
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
        <p>Seconds / 100${unitHtml} · lower is faster</p></div><span class="fig">FIG.${figure} · S /100${unitHtml.toUpperCase()}</span></div>
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
    <div class="pagehead"><div><div class="eyebrow">LAB / 04 / PERFORMANCE</div><h1>Performance curve</h1>
      <p>Best continuous training efforts; suspect lengths excluded; meters and yards kept separate.</p>
    </div></div>
    ${shownUnits.map((unit, index) => effortGroup(sessions, unit, index + 1)).join('')}
    <p class="fineprint">Different strokes, drills or equipment may not be comparable. Yard pace is /100yd.</p>`;
}

function weeklyTrainingPanel(sessions) {
  const { completed, current, average, activeWeeks } = weeklyTraining(sessions);
  const chart = completed.slice(-12).map(week => ({
    label: formatDate(week.week, { month: 'short', day: 'numeric' }),
    value: week.distance / 1000
  }));

  return `
    <section class="panel">
      <div class="panelhead"><div><h2>Weekly training</h2>
        <p>Monday–Sunday, from the first to the last swim in your selection. Weeks with no imported swims count as zero.</p>
      </div></div>
      ${average ? `
        <p>Weekly averages · <strong>${formatNumber(average.distance / 1000, 2)} km</strong> ·
          <strong>${formatDuration(average.duration)}</strong> swim time ·
          <strong>${formatNumber(average.sessions, 1)}</strong> swims</p>
        <p>Swam in <strong>${activeWeeks} of ${completed.length} weeks</strong>
          (${formatNumber(activeWeeks / completed.length * 100)}%)</p>
        <p class="muted">Weekly distance in km · ${chart.length < completed.length ? 'Latest 12 completed weeks' : 'Completed weeks'}</p>
        ${barChart(chart)}
        <details>
          <summary>Weekly totals</summary>
          <div class="tablewrap"><table>
            <thead><tr><th scope="col">Week of</th><th scope="col">Distance</th><th scope="col">Swim time</th><th scope="col">Swims</th></tr></thead>
            <tbody>${[...completed].reverse().map(week => `
              <tr><td>${formatDate(week.week)}</td><td>${formatNumber(week.distance / 1000, 2)} km</td>
                <td>${formatDuration(week.duration)}</td><td>${week.sessions}</td></tr>`).join('')}</tbody>
          </table></div>
        </details>` : '<p class="muted">Import swims from a completed week to see weekly averages.</p>'}
      ${current ? `<p><strong>This week so far</strong> · ${formatNumber(current.distance / 1000, 2)} km ·
        ${formatDuration(current.duration)} swim time · ${current.sessions} ${current.sessions === 1 ? 'swim' : 'swims'}</p>` : ''}
    </section>`;
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
    <div class="pagehead"><div><div class="eyebrow">LAB / 03 / TRENDS</div><h1>Training trends</h1><p>Track changes across sessions, with context.</p></div></div>
    ${metricCards(sessions)}
    ${weeklyTrainingPanel(sessions)}
    <div class="twocol">
      <section class="panel">
        <div class="panelhead"><div><h2>Session distance</h2><p>Distance in km</p></div><span class="fig">FIG.1 · KM</span></div>
        ${lineChart(distanceTrend, { unit: 'km', fill: true })}
      </section>
      <section class="panel">
        <div class="panelhead"><div><h2>Stroke-count trend</h2><p>Unadjusted mean across recorded active lengths</p></div><span class="fig">FIG.2 · STROKES / LENGTH</span></div>
        ${lineChart(strokeTrend, { label: 'Mean strokes per pool length' })}
      </section>
    </div>
    <div class="panel info"><b>Interpretation caution</b>
      <p>Stroke counts can change with pace, stroke mix, pool length, drills, equipment or measurement error. Future matched-set analysis will reduce these confounders.</p>
    </div>`;
}

export function settingsPage() {
  return `
    <div class="pagehead"><div><div class="eyebrow">LAB / 05 / DATA</div><h1>Data & settings</h1><p>Local FIT analysis without cloud synchronization.</p></div></div>
    <div class="twocol">
      <section class="panel">
        <h2>FIT imports</h2>
        <p class="muted">Select up to 300 FIT files at a time. Import your files again after reloading this page.</p>
        <div class="buttonstack">
          <button class="primary" data-upload="true">Import FIT files</button>
        </div>
      </section>
      <section class="panel">
        <h2>Privacy & backup</h2>
        <p class="muted">FIT files are processed locally, not uploaded. Saving notes, length-quality decisions, or restoring a backup also stores a full copy of each affected session (including length data) in IndexedDB.</p>
        <div class="buttonstack">
          <button class="secondary" data-export="true">Export JSON backup</button>
          <button class="secondary" data-restore="true">Restore JSON backup</button>
          <button class="danger-lite" data-clear="true">Clear saved annotations and length decisions</button>
        </div>
        <p class="fineprint">Clearing annotations only affects browser storage.</p>
      </section>
    </div>`;
}
