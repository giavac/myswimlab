/** Main dashboard, built from reusable view fragments. */
import { state } from '../state.js';
import { distanceBests } from '../analytics/best-efforts.js';
import { pace, summary, weekVolumes, formatDate, formatNumber, formatSeconds } from '../analytics/metrics.js';
import { barChart, lineChart } from './charts.js';
import { metricCards, emptyState, recentTable, sessionInsight } from './components.js';
import { escapeHtml, tag } from './shared.js';

function emptyMessage() {
  switch (state.folderStatus) {
    case 'permission':
      return 'The selected folder needs permission again. Click Reconnect to authorize access.';
    case 'error':
      return 'The selected folder could not be read. Change the folder or try again.';
    case 'scanning':
      return 'Scanning the selected folder for Garmin swimming activities…';
    case 'ready':
    case 'temporary':
      return 'No swimming FIT files were found in this folder. Add a FIT file and choose Refresh.';
    default:
      return 'Choose a folder containing Garmin FIT swimming activities. An empty folder shows no sessions.';
  }
}

function bestEffortsPanel(sessions) {
  const units = [...new Set(sessions.filter(session => session.sport === 'pool')
    .map(session => session.poolUnit || 'm'))];
  const groups = units.length ? units : ['m'];
  // "NEW" marks a best set in the most recent session of this view.
  const latestId = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0]?.id;
  const tiles = groups.map(unit => {
    const efforts = distanceBests(sessions, [25, 50, 100, 200, 400, 800], unit);
    const unitHtml = escapeHtml(unit);
    return `<div class="effort-group">
      ${groups.length > 1 ? `<h3>${unit === 'yd' ? 'Yard pool' : 'Meter pool'}</h3>` : ''}
      <div class="bests">${efforts.map(effort => {
        const isNew = effort.session && effort.session.id === latestId;
        return `
        <div class="besttile${isNew ? ' new' : ''}">
          <span>${effort.distance} ${unitHtml}${isNew ? ' · NEW' : ''}</span>
          <strong>${formatSeconds(effort.time)}</strong>
          <small>${effort.session
            ? `<span class="best-pace">${formatSeconds(effort.time * 100 / effort.distance)}/100${unitHtml}</span> · ${formatDate(effort.session.date, { month: 'short', day: 'numeric' })}`
            : 'No continuous segment recorded'}</small>
        </div>`;
      }).join('')}</div></div>`;
  }).join('');
  return `<section class="panel">
    <div class="panelhead">
      <div><h2>Best recorded efforts</h2><p>Continuous pool segments · suspect lengths excluded · yards/meters separate</p></div>
      <button class="subtle" data-page="performance">Detailed curve →</button>
    </div>${tiles}
  </section>`;
}

export function overview(sessions) {
  if (!sessions.length) {
    return `
      <div class="pagehead"><div>
        <h1>Swimming overview</h1>
        <p>Your swimming history, directly from FIT files.</p>
      </div></div>
      ${emptyState('No swimming sessions', emptyMessage())}`;
  }

  const chronological = [...sessions].reverse();
  const recent = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const volumes = weekVolumes(sessions);
  const paceTrend = chronological.map(session => ({
    label: formatDate(session.date, { month: 'short', day: 'numeric' }),
    value: pace(session)
  })).filter(point => Number.isFinite(point.value));
  const strokeTrend = chronological.map(session => ({
    label: formatDate(session.date, { month: 'short', day: 'numeric' }),
    value: summary([session]).stroke
  })).filter(point => Number.isFinite(point.value));
  const latest = recent[0];

  return `
    <div class="pagehead">
      <div>
        <div class="eyebrow">LAB / 01 / OVERVIEW</div>
        <h1>Swimming overview</h1>
        <p>Understand your swimming, not just your distance.</p>
      </div>
      ${tag(`${sessions.length} SWIMMING ACTIVITIES`, 'real')}
    </div>
    ${metricCards(sessions)}

    <div class="twocol leadcharts">
      <section class="panel">
        <div class="panelhead"><div><h2>Training volume</h2><p>Weekly swimming distance · kilometers</p></div><span class="fig">FIG.1 · KM / WEEK</span></div>
        ${barChart(volumes)}
      </section>
      <section class="panel">
        <div class="panelhead"><div><h2>Average pace progression</h2><p>Session-average moving pace · suspect lengths excluded · lower is faster</p></div><span class="fig">FIG.2 · S /100M · ↓ FASTER</span></div>
        ${lineChart(paceTrend, { unit: 'pace', label: 'Average pace per session' })}
      </section>
    </div>

    <div class="twocol unequal">
      ${bestEffortsPanel(sessions)}
      <section class="panel insight">
        <div class="panelhead"><div><h2>What your data says</h2><p>Descriptive findings from your imported history</p></div><span class="fig">OBSERVATION</span></div>
        <div class="insight-body">${sessionInsight(sessions)}</div>
        <button class="subtle insight-link" data-page="trends">Explore training trends →</button>
      </section>
    </div>

    <div class="twocol lowercharts">
      <section class="panel">
        <div class="panelhead"><div><h2>Stroke count across sessions</h2><p>Mean strokes per active pool length · unadjusted</p></div><span class="fig">FIG.3 · STROKES / LENGTH</span></div>
        ${lineChart(strokeTrend, { label: 'Mean strokes per pool length' })}
      </section>
      <section class="panel nextstep">
        <div class="panelhead"><div><h2>Zoom into a workout</h2><p>Individual length data is where swimming becomes interesting</p></div></div>
        <div class="feature-session">
          <div>
            <span class="eyebrow">MOST RECENT SWIM</span>
            <h3>${escapeHtml(latest.title)}</h3>
            <p>${formatDate(latest.date)} · ${formatNumber(latest.distance)} m · ${formatSeconds(pace(latest))}/100m</p>
          </div>
          <button class="primary" data-open-session="${escapeHtml(latest.id)}">Inspect lengths →</button>
        </div>
        <div class="feature-foot">Examine length-by-length pace, stroke counts, breaks and workout annotations.</div>
      </section>
    </div>

    <section class="panel">
      <div class="panelhead"><div><h2>Recent sessions</h2><p>Imported activities · select a row to explore</p></div><button class="subtle" data-page="sessions">All sessions →</button></div>
      ${recentTable(recent, true)}
    </section>`;
}
