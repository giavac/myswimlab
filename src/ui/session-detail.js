/** Inspect one session, with optional browser-local annotations. */
import { selectedSession, sortedSessions, state } from '../state.js';
import { BEST_DISTANCES, distanceBests } from '../analytics/best-efforts.js';
import { lengthDrift, pace, formatNumber, formatSeconds, formatDuration, formatDate } from '../analytics/metrics.js';
import { intervals } from '../analytics/intervals.js';
import { lineChart } from './charts.js';
import { emptyState, intervalTable, lengthTable, metric } from './components.js';
import { escapeHtml, tag, recordNumber } from './shared.js';
import {
  active, assessLengths, paceTotals, qualityBaseline, FAST_TIME_RATIO, LOW_STROKE_RATIO
} from '../analytics/length-quality.js';

const percent = ratio => `${Math.round(ratio * 100)}%`;

export function sessionPage() {
  const session = selectedSession();
  if (!session) {
    return `<div class="pagehead"><h1>Session analysis</h1></div>
      ${emptyState('No swim selected', 'Import a FIT file to see an analysis.')}`;
  }

  const draft = state.drafts.get(session.id);
  const noteText = draft?.notes ?? session.notes ?? '';
  const equipmentText = draft?.equipment ?? (session.equipment || []).join(', ');
  const lengths = session.lengths || [];
  const quality = assessLengths(session);
  const excluded = quality.map((flag, index) => flag.excluded ? index : -1).filter(index => index >= 0);
  // Chart labels use the record number from the length table, not a new count.
  const shown = lengths.map((length, index) => ({ length, index, record: recordNumber(index) }))
    .filter(({ length }, index) => active(length) && !quality[index].excluded);
  const totals = paceTotals(session);
  const workout = intervals(session, quality);
  const paceByLength = shown.map(({ length, record }) => ({
    label: record, value: length.duration * 100 / length.distance
  }));
  const strokesByLength = shown.filter(({ length }) => Number.isFinite(length.strokes))
    .map(({ length, record }) => ({ label: record, value: length.strokes }));
  const drift = lengthDrift(session);
  const correctedPace = totals.excluded > 0;
  const swimType = session.sport === 'pool' ? `Pool ${formatNumber(session.poolUnit === 'yd' ? session.poolMeters / 0.9144 : session.poolMeters, 2)}${escapeHtml(session.poolUnit || 'm')}` : 'Open water';
  const hasRestExcluded = session.sport === 'pool' && session.durationBasis !== 'timer';
  const movingTimeDescription = hasRestExcluded
    ? session.restDuration > 0
      ? `Excludes ${formatDuration(session.restDuration)} recorded rest`
      : 'Active lengths only'
    : 'FIT timer time (rest may be included)';
  // Current all-time bests across all loaded sessions, not only the selected period.
  const unit = session.poolUnit || 'm';
  const personalBests = session.sport === 'pool'
    ? distanceBests(sortedSessions(), BEST_DISTANCES, unit)
      .filter(effort => effort.session?.id === session.id)
    : [];
  const unitHtml = escapeHtml(unit);
  // Shade the retained lengths inside the longest best effort.
  const longestBest = personalBests[personalBests.length - 1];
  const bandPoints = longestBest
    ? shown.map(({ index }, point) => index >= longestBest.start && index <= longestBest.end ? point : -1)
      .filter(point => point >= 0)
    : [];
  const band = bandPoints.length
    ? { from: bandPoints[0], to: bandPoints[bandPoints.length - 1], label: `PB ${longestBest.distance} ${unit}` }
    : null;
  const baseline = qualityBaseline(session);

  return `
    <div class="pagehead">
      <div>
        <div class="breadcrumb">LAB / 02 / SESSION / ${formatDate(session.date)}</div>
        <h1>${escapeHtml(session.title)}</h1>
        <p>${formatDate(session.date)} · ${swimType} · ${escapeHtml(session.source)} data</p>
        ${personalBests.length ? tag(`◆ Personal best × ${personalBests.length}`, 'pb') : ''}
      </div>
      <div class="pageactions">
        <button class="danger-lite" data-delete="${escapeHtml(session.id)}">Remove session</button>
        <button class="subtle" data-page="sessions">All sessions</button>
      </div>
    </div>

    <div class="metrics four">
      ${metric('Distance', `${formatNumber(totals.distance, 2)} <small>m</small>`, totals.excluded ? `FIT total ${formatNumber(session.distance, 2)} m · ${totals.excluded} excluded` : 'Recorded or reconstructed')}
      ${metric(hasRestExcluded ? 'Swim time' : 'Timer time', formatDuration(totals.duration), movingTimeDescription)}
      ${metric(correctedPace ? 'Pace · adjusted' : 'Pace · average', `${formatSeconds(pace(session))} <small>/100m</small>`, correctedPace ? `▲ ${totals.excluded} flagged ${totals.excluded === 1 ? 'length' : 'lengths'} · distance adjusted` : 'Moving pace', correctedPace ? 'warn' : '')}
      ${metric('Δ Stroke drift', drift === null ? '—' : `${drift >= 0 ? '+' : ''}${drift.toFixed(1)} <small>%</small>`, 'Stroke count: last ¼ vs first ¼')}
    </div>

    ${hasRestExcluded && session.restDuration > 0 && Number.isFinite(session.timerDuration) &&
      Math.abs(session.duration + session.restDuration - session.timerDuration) < 1 ? `
      <p class="fineprint">Swimming ${formatDuration(session.duration)} + recorded rest ${formatDuration(session.restDuration)} = FIT timer ${formatDuration(session.timerDuration)}.</p>
    ` : ''}

    ${session.sport === 'pool' && workout.length ? `
      <section class="panel" aria-label="Intervals">
        <div class="panelhead"><div><h2>Intervals</h2><p>Lengths between rest markers · flagged distance removed, swim time retained</p></div><span class="fig">${workout.length} INTERVALS</span></div>
        ${intervalTable(session, workout)}
      </section>
    ` : ''}

    ${personalBests.length ? `
      <section class="panel pb-panel" aria-label="Personal bests">
        <b class="panel-label">◆ Personal best · ${personalBests.length} ${personalBests.length === 1 ? 'distance' : 'distances'}</b>
        <p>Fastest continuous segment among all loaded sessions. Flagged lengths contribute time only. Recorded rests break an effort.</p>
        <div class="tablewrap"><table>
          <thead><tr><th>Dist</th><th>Time</th><th>Pace /100${unitHtml}</th><th>Records</th></tr></thead>
          <tbody>${personalBests.map(effort => `
            <tr><td class="pb-dist">${effort.distance} ${unitHtml}</td><td>${formatSeconds(effort.time)}</td>
              <td>${formatSeconds(effort.time * 100 / effort.distance)}</td>
              <td>${effort.start === effort.end ? `REC ${recordNumber(effort.start)}` : `REC ${recordNumber(effort.start)}–${recordNumber(effort.end)}`}</td></tr>`).join('')}
          </tbody>
        </table></div>
      </section>
    ` : ''}

    ${excluded.length ? `
      <section class="panel quality-panel" aria-label="Swimming length data quality">
        <b class="panel-label">▲ Data quality · ${excluded.length} ${excluded.length === 1 ? 'length' : 'lengths'} excluded</b>
        <p>Flagged lengths contribute time only to swim totals and continuous efforts. You can override each decision.</p>
        <p class="rule">Rule: pace &lt; ${percent(FAST_TIME_RATIO)} of median AND strokes &lt; ${percent(LOW_STROKE_RATIO)} of median.
          ${baseline ? `Session median: ${formatSeconds(baseline.timePerMeter * session.poolMeters)} · ${formatNumber(baseline.strokes, 1)} strokes per length.` : 'Not enough lengths with strokes for a median; only manual decisions apply.'}</p>
        <div class="tablewrap"><table>
          <thead><tr><th>Rec</th><th>Duration</th><th>Strokes</th><th>Decision</th><th></th></tr></thead>
          <tbody>${excluded.map(index => `
            <tr><td class="warn">▲ ${recordNumber(index)}</td>
              <td>${formatSeconds(lengths[index].duration)}${baseline ? ` <span class="muted">/ ${formatSeconds(baseline.timePerMeter * lengths[index].distance)}</span>` : ''}</td>
              <td>${formatNumber(lengths[index].strokes)}${baseline ? ` <span class="muted">/ ${formatNumber(baseline.strokes, 1)}</span>` : ''}</td>
              <td>${quality[index].manual === 'exclude' ? 'Manual' : 'Automatic'}</td>
              <td><button class="quality-jump" data-jump-length="${index}">Review REC ${recordNumber(index)}</button></td></tr>`).join('')}
          </tbody>
        </table></div>
      </section>
    ` : ''}

    ${session.sport === 'open-water' ? `
      <section class="panel info"><b>Open-water session</b>
        <p>Distance and time are supported. Length-by-length charts apply only to pool swimming.</p>
      </section>` : ''}

    <div class="twocol">
      <section class="panel">
        <div class="panelhead"><div><h2>Pace by length</h2><p>Seconds per 100 m · excluded lengths omitted · x: REC</p></div><span class="fig">FIG.1 · S /100M</span></div>
        ${lineChart(paceByLength, { unit: 'pace', label: 'Pace per length', band })}
      </section>
      <section class="panel">
        <div class="panelhead"><div><h2>Strokes per length</h2><p>As counted by the watch · excluded lengths omitted · x: REC</p></div><span class="fig">FIG.2 · COUNT</span></div>
        ${lineChart(strokesByLength, { label: 'Strokes per length' })}
      </section>
    </div>

    <div class="twocol unequal">
      <section class="panel">
        <div class="panelhead"><div><h2>Recorded lengths</h2><p>Rest markers appear as separate entries</p></div><span class="fig">${lengths.length} RECORDS · ${lengths.filter(length => length.isRest).length} REST</span></div>
        ${lengthTable(session)}
      </section>
      <section class="panel">
        <div class="panelhead"><div><h2>Session notes</h2><p>Add details your watch could not record</p></div></div>
        <label class="fieldlabel" for="notes">Workout structure, technique, effort</label>
        <textarea id="notes" rows="6" placeholder="e.g., 5 × 200 with 10 s rest">${escapeHtml(noteText)}</textarea>
        <label class="fieldlabel" for="equipment">Equipment used (comma-separated)</label>
        <input id="equipment" type="text" value="${escapeHtml(equipmentText)}" placeholder="Paddles, Pull buoy..."/>
        <button class="primary save" data-save="${escapeHtml(session.id)}">Save annotations</button>
        <p class="fineprint">Annotations stay in this browser and are included in JSON backup.</p>
      </section>
    </div>`;
}
