/** Inspect one session, with optional browser-local annotations. */
import { selectedSession, state } from '../state.js';
import { lengthDrift, pace, formatNumber, formatSeconds, formatDuration, formatDate } from '../analytics/metrics.js';
import { lineChart } from './charts.js';
import { emptyState, lengthTable, metric } from './components.js';
import { escapeHtml } from './shared.js';
import { active, assessLengths, paceTotals } from '../analytics/length-quality.js';

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
  const shown = lengths.map((length, index) => ({ length, record: String(index + 1) }))
    .filter(({ length }, index) => active(length) && !quality[index].excluded);
  const totals = paceTotals(session);
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
  const removeButton = state.sourceMode === 'manual'
    ? `<button class="danger-lite" data-delete="${escapeHtml(session.id)}">Remove session</button>`
    : '';

  return `
    <div class="pagehead">
      <div>
        <div class="breadcrumb">SESSIONS / ${formatDate(session.date)}</div>
        <h1>${escapeHtml(session.title)}</h1>
        <p>${formatDate(session.date)} · ${swimType} · ${escapeHtml(session.source)} data</p>
      </div>
      <div class="pageactions">
        ${removeButton}
        <button class="subtle" data-page="sessions">All sessions</button>
      </div>
    </div>

    <div class="metrics four">
      ${metric('Distance', `${formatNumber(session.distance)} <small>m</small>`, 'Recorded or reconstructed', 'wave')}
      ${metric(hasRestExcluded ? 'Swimming time' : 'Timer time', formatDuration(session.duration), movingTimeDescription, 'calendar')}
      ${metric(correctedPace ? 'Filtered pace' : 'Average pace', `${formatSeconds(pace(session))} <small>/100m</small>`, correctedPace ? `${totals.excluded} suspect ${totals.excluded === 1 ? 'length' : 'lengths'} omitted` : 'Moving pace', 'chart')}
      ${metric('Length drift', drift === null ? '—' : `${drift >= 0 ? '+' : ''}${drift.toFixed(1)}%`, 'Stroke count: last vs first quarter', 'wave')}
    </div>

    ${hasRestExcluded && session.restDuration > 0 && Number.isFinite(session.timerDuration) &&
      Math.abs(session.duration + session.restDuration - session.timerDuration) < 1 ? `
      <p class="fineprint">Swimming ${formatDuration(session.duration)} + recorded rest ${formatDuration(session.restDuration)} = FIT timer ${formatDuration(session.timerDuration)}.</p>
    ` : ''}

    ${excluded.length ? `
      <section class="panel quality-panel" aria-label="Swimming length data quality">
        <b>Data quality: ${excluded.length} ${excluded.length === 1 ? 'length' : 'lengths'} excluded from pace analytics and best efforts</b>
        <p>Original FIT distance, swimming time, and rest records are unchanged. The app flags only very fast lengths with unusually few strokes. You can override each decision.</p>
        <p>${excluded.map(index => `<button class="quality-jump" data-jump-length="${index}">Review record #${index + 1} (${formatSeconds(lengths[index].duration)}, ${formatNumber(lengths[index].strokes)} strokes)</button>`).join(' ')}</p>
      </section>
    ` : ''}

    ${session.sport === 'open-water' ? `
      <section class="panel info"><b>Open-water session</b>
        <p>Distance and time are supported. Length-by-length charts apply only to pool swimming.</p>
      </section>` : ''}

    <div class="twocol">
      <section class="panel">
        <div class="panelhead"><div><h2>Pace by length</h2><p>Seconds per 100 m · excluded lengths omitted</p></div></div>
        ${lineChart(paceByLength, { unit: 'pace', label: 'Pace per length' })}
      </section>
      <section class="panel">
        <div class="panelhead"><div><h2>Strokes per length</h2><p>As counted by the watch · excluded lengths omitted</p></div></div>
        ${lineChart(strokesByLength, { color: '#0b9a9a', label: 'Strokes per length' })}
      </section>
    </div>

    <div class="twocol unequal">
      <section class="panel">
        <div class="panelhead"><div><h2>Recorded lengths</h2><p>Rest markers appear as separate entries</p></div><span class="muted">${lengths.length} records</span></div>
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
