/** Secondary views: performance, trends, and local-data settings. */
import { intervalPaceBands, setsByRepeatDistance } from '../analytics/intervals.js';
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

function weeklyTrainingPanel(sessions, goal) {
  const { completed, current, average, activeWeeks } = weeklyTraining(sessions);
  const weeksAtGoal = goal ? completed.filter(week => week.sessions >= goal).length : 0;
  const chart = completed.slice(-12).map(week => ({
    label: formatDate(week.week, { month: 'short', day: 'numeric' }),
    value: week.distance / 1000
  }));

  return `
    <section class="panel">
      <div class="panelhead"><div><h2>Weekly training</h2>
        <p>Monday–Sunday, from the first to the last swim in your selection. Weeks with no imported swims count as zero.</p>
      </div></div>
      <form id="weeklyGoalForm">
        <label class="fieldlabel" for="weeklyGoal">Goal (swims per week)</label>
        <input id="weeklyGoal" type="number" min="1" step="1" value="${goal ?? ''}"
          aria-describedby="weeklyGoalHelp">
        <button class="secondary" type="submit">Save goal</button>
        <p id="weeklyGoalHelp" class="fineprint">Leave blank and save to clear your goal.</p>
      </form>
      ${average ? `
        <p>Weekly averages · <strong>${formatNumber(average.distance / 1000, 2)} km</strong> ·
          <strong>${formatDuration(average.duration)}</strong> swim time ·
          <strong>${formatNumber(average.sessions, 1)}</strong> swims</p>
        <p>Swam in <strong>${activeWeeks} of ${completed.length} weeks</strong>
          (${formatNumber(activeWeeks / completed.length * 100)}%)</p>
        ${goal ? `<p>Met your goal in <strong>${weeksAtGoal} of ${completed.length} weeks</strong>
          (${formatNumber(weeksAtGoal / completed.length * 100)}%).</p>` : ''}
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
      ${current || goal ? `<p><strong>This week so far</strong> · ${formatNumber((current?.distance ?? 0) / 1000, 2)} km ·
        ${formatDuration(current?.duration ?? 0)} swim time · ${current?.sessions ?? 0}${goal ? ` of ${goal}` : ''} ${current?.sessions === 1 && !goal ? 'swim' : 'swims'}</p>` : ''}
    </section>`;
}

function paceBandResults(sessions, unit, reference) {
  const { bands, skipped } = intervalPaceBands(sessions, unit, reference);
  const total = bands.faster + bands.near + bands.slower;
  const rows = [
    ['Faster than reference', bands.faster],
    ['Within 5% of reference', bands.near],
    ['Slower than reference', bands.slower]
  ];

  return `
    <h3>${formatSeconds(reference)} / 100 ${unit}</h3>
    ${total ? `
      <div class="tablewrap"><table>
        <thead><tr><th scope="col">Pace band</th><th scope="col">Swim time</th><th scope="col">Share</th></tr></thead>
        <tbody>${rows.map(([label, duration]) => `
          <tr><th scope="row">${label}</th><td>${formatDuration(duration)}</td><td>${formatNumber(duration / total * 100)}%</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="muted">No usable pool intervals in this selection.</p>'}
    ${skipped ? `<p class="fineprint">Intervals skipped because they contain excluded lengths · ${skipped}</p>` : ''}`;
}

function effortMixPanel(sessions, paces) {
  const units = ['m', 'yd'];

  return `
    <section class="panel">
      <div class="panelhead"><div><h2>Pool effort mix</h2>
        <p>Compare average interval pace with a reference pace you choose.</p>
      </div></div>
      <p><button class="secondary" data-page="guide">Read the training guide</button></p>
      <form id="referencePacesForm" aria-describedby="referencePacesHelp">
        ${units.map(unit => `
          <label class="fieldlabel" for="referencePace-${unit}">Reference pace per 100 ${unit}</label>
          <input class="reference-pace" id="referencePace-${unit}" type="text" placeholder="1:45"
            pattern="[0-9]+:[0-5][0-9]" value="${paces[unit] ? formatSeconds(paces[unit]) : ''}">`).join('')}
        <p id="referencePacesHelp" class="fineprint">Enter minutes:seconds. Leave a field blank to clear that reference.</p>
        <button class="secondary" type="submit">Save reference paces</button>
      </form>
      ${units.filter(unit => paces[unit]).map(unit => paceBandResults(sessions, unit, paces[unit])).join('')}
    </section>`;
}

function setStructurePanel(sessions) {
  const units = ['m', 'yd'].map(unit => ({ unit, groups: setsByRepeatDistance(sessions, unit) }))
    .filter(({ groups }) => groups.length);

  return `
    <section class="panel">
      <div class="panelhead"><div><h2>Set structure</h2>
        <p>Consecutive repeats of the same distance are grouped using recorded rests.
          Expand a distance to see the sets behind the totals.</p>
      </div></div>
      ${units.length ? units.map(({ unit, groups }) => `
        <h3>${unit === 'm' ? 'Meter pools' : 'Yard pools'}</h3>
        ${groups.map(group => `
          <details>
            <summary>${formatNumber(group.distance, 2)} ${unit} bouts ·
              ${formatNumber(group.totalDistance, 2)} ${unit} total ·
              ${formatDuration(group.duration)} swim time · ${group.sessions.size} ${group.sessions.size === 1 ? 'session' : 'sessions'}</summary>
            <div class="tablewrap"><table>
              <thead><tr><th scope="col">Session</th><th scope="col">Recorded set</th>
                <th scope="col">Swim time</th><th scope="col">Median pace / 100 ${unit}</th>
                <th scope="col">Median recorded rest</th></tr></thead>
              <tbody>${group.sets.map(set => `
                <tr><td><button class="asidelink" data-open-session="${escapeHtml(set.session.id)}">${formatDate(set.session.date)} · ${escapeHtml(set.session.title || 'Swimming session')}</button></td>
                  <td>${set.count > 1 ? `${set.count} × ` : ''}${formatNumber(group.distance, 2)} ${unit}
                    ${set.uncertain ? '<small>· No rest markers</small>' : ''}</td>
                  <td>${formatDuration(set.duration)}</td><td>${formatSeconds(set.medianPace)}</td>
                  <td>${formatSeconds(set.medianRest)}</td></tr>`).join('')}</tbody>
            </table></div>
          </details>`).join('')}`).join('') : '<p class="muted">Import a pool swim with recorded lengths to see its set structure.</p>'}
      ${units.length ? '<p class="fineprint">Totals use recorded lengths. Missing rest markers can make separate repeats look like one continuous bout.</p>' : ''}
    </section>`;
}

export function trendsPage(sessions, goal = null, paces = {}) {
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
    ${weeklyTrainingPanel(sessions, goal)}
    ${setStructurePanel(sessions)}
    ${effortMixPanel(sessions, paces)}
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

export function trainingGuidePage() {
  return `
    <div class="pagehead"><div><h1>Swimming training guide</h1>
      <p>How to read a set from its distance, repetitions, pace and recovery.</p>
    </div></div>
    <section class="panel">
      <h2>Set structure and purpose</h2>
      <p>A continuous 400 m swim and 16 × 25 m both cover 400 m. One is a sustained bout.
        The other is a set of short repeats. A single 25 m repeat can be an easy drill or a
        maximal sprint. A set of short repeats can build aerobic volume when the pace is
        controlled and recovery is brief.</p>
      <p>A maximal continuous 400 m is a sustained race effort. Studies in competitive
        swimmers show a large aerobic contribution and a meaningful anaerobic contribution.
        Distance and duration help describe the effort. The swimmer's pace and recovery
        help determine the intended training stimulus.</p>
      <p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5394852/" target="_blank" rel="noopener">Study of aerobic and anaerobic contributions in maximal 400 m front crawl</a></p>
    </section>
    <section class="panel">
      <h2>Common training purposes</h2>
      <p>Coaches use overlapping classifications. This table gives illustrative sets.
        The target pace and recovery determine how each example is actually swum.</p>
      <div class="tablewrap"><table>
        <thead><tr><th scope="col">Purpose</th><th scope="col">What defines it</th><th scope="col">Example</th></tr></thead>
        <tbody>
          <tr><th scope="row">Recovery and technique</th><td>Easy swimming or focused practice of skills such as body position, breathing, starts or turns.</td><td>8 × 25 m alternating drill and easy swim.</td></tr>
          <tr><th scope="row">Aerobic endurance</th><td>Sustained, controlled work, either continuous or accumulated through repeats with brief recovery.</td><td>400 m steady or 8 × 50 m steady with brief rest.</td></tr>
          <tr><th scope="row">Threshold</th><td>Work close to an individually assessed threshold, such as a pace near maximal lactate steady state. The same pace can represent different intensities for different swimmers.</td><td>8 × 100 m at an assessed threshold pace with brief rest.</td></tr>
          <tr><th scope="row">Aerobic power</th><td>Hard work designed to raise oxygen uptake toward its maximum. Repeat duration and recovery shape the response.</td><td>A series of hard 100–200 m repeats at an individually chosen pace and recovery.</td></tr>
          <tr><th scope="row">Race pace</th><td>Practice at the speed of a named event. The target changes with the event and swimmer.</td><td>50 m repeats at target 200 m race pace.</td></tr>
          <tr><th scope="row">Speed endurance and lactate tolerance</th><td>High-intensity work aimed at sustaining speed as fatigue builds. Coaches also use separate lactate-production sets.</td><td>Repeated hard 50 m efforts with recovery chosen for the set's purpose.</td></tr>
          <tr><th scope="row">Sprint and pure speed</th><td>Brief near-maximal or maximal efforts, with enough recovery to preserve speed and execution across repeats.</td><td>6 × 15–25 m fast with generous recovery.</td></tr>
        </tbody>
      </table></div>
      <p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6683628/" target="_blank" rel="noopener">Survey of elite British swimming coaches</a> ·
        <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12371893/" target="_blank" rel="noopener">Middle-distance case study with a seven-zone framework</a></p>
    </section>
    <section class="panel">
      <h2>What your FIT file can tell you</h2>
      <p>MySwimLab can report recorded repeat distance, swim time, pace and rest.
        A missing rest marker may make separate repeats look continuous.
        To interpret training purpose, add the intended set, stroke or drill,
        target race pace and perceived effort. A swimmer-specific test can provide
        an intensity reference. Critical swim speed is a performance estimate
        derived from timed efforts, while maximal lactate steady state is
        assessed from blood lactate measurements during sustained efforts.</p>
      <p><a href="https://pubmed.ncbi.nlm.nih.gov/1521952/" target="_blank" rel="noopener">Critical swim speed study</a> ·
        <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC13747781/" target="_blank" rel="noopener">Example of individually assessed intensity zones in elite swimmers</a></p>
    </section>`;
}
