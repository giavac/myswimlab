import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLengths, paceTotals } from '../src/analytics/length-quality.js';
import { distanceBests } from '../src/analytics/best-efforts.js';
import { pace, summary, weekVolumes } from '../src/analytics/metrics.js';
import { intervalTable, lengthTable, recentTable } from '../src/ui/components.js';
import { parseFit } from '../src/fit/swimming-parser.js';
import { makeFit } from './fit-fixture.js';
import { validateBackup } from '../src/data/backup.js';

function exampleSession() {
  const lengths = Array.from({ length: 12 }, (_, sequence) => ({
    sequence,
    index: sequence,
    isRest: false,
    distance: 25,
    duration: sequence === 5 ? 13.249 : sequence === 6 ? 22.688 : 29,
    strokes: sequence === 5 ? 4 : 13
  }));
  const duration = lengths.reduce((total, length) => total + length.duration, 0);
  return {
    id: 'sample', date: '2026-11-11T08:00:00Z', source: 'FIT', sport: 'pool',
    poolUnit: 'm', distance: 300, duration, durationBasis: 'active-lengths',
    lengths, notes: '', equipment: []
  };
}

test('fast length with implausibly low strokes is suspected and excluded', () => {
  const session = exampleSession();
  const flags = assessLengths(session);
  assert.equal(flags.filter(flag => flag.excluded).length, 1);
  assert.equal(flags[5].automatic, true);
  assert.match(flags[5].reason, /few strokes/);
  assert.equal(flags[6].excluded, false);
});

test('genuine fast length with normal strokes is not automatically excluded', () => {
  const session = exampleSession();
  session.lengths[5].strokes = 12;
  assert.equal(assessLengths(session)[5].excluded, false);
});

test('eight reference lengths are required for automatic quality decisions', () => {
  const session = exampleSession();
  session.lengths = session.lengths.slice(0, 7);
  assert.equal(assessLengths(session)[5].excluded, false);
});

test('manual decisions override automatic detection and can exclude otherwise normal lengths', () => {
  const session = exampleSession();
  session.lengthOverrides = { 5: 'keep', 4: 'exclude' };
  const flags = assessLengths(session);
  assert.equal(flags[5].automatic, true);
  assert.equal(flags[5].excluded, false);
  assert.equal(flags[4].automatic, false);
  assert.equal(flags[4].excluded, true);
});

test('suspect lengths contribute no distance or time to continuous best efforts', () => {
  const session = exampleSession();
  assert.equal(distanceBests([session], [25])[0].time, 22.688);
  const [best50] = distanceBests([session], [50]);
  assert.equal(best50.time, 22.688 + 29);
});

test('adjusted pace removes both suspect seconds and distance without changing FIT totals', () => {
  const session = exampleSession();
  const raw = { duration: session.duration, distance: session.distance };
  const totals = paceTotals(session);
  assert.equal(totals.excluded, 1);
  assert.equal(totals.distance, 275);
  assert.ok(Math.abs(totals.duration - (session.duration - 13.249)) < 0.001);
  assert.equal(session.duration, raw.duration);
  assert.equal(session.distance, raw.distance);
  assert.ok(Math.abs(pace(session) - 100 * totals.duration / totals.distance) < 1e-6);
  assert.equal(summary([session]).distance, 275);
  assert.equal(summary([session]).excluded, 1);
});

test('distance corrections preserve extra FIT distance and avoid double subtraction', () => {
  const session = exampleSession();
  session.distance = 310;
  assert.equal(paceTotals(session).distance, 285);
  session.distance = 275;
  assert.equal(paceTotals(session).distance, 275);
});

test('a corrected 1000 m FIT swim contributes 800 m and 1000 m bests', () => {
  const durations = Array(42).fill(25);
  const strokes = Array(42).fill(18);
  for (const index of [10, 30]) {
    durations[index] = 5;
    strokes[index] = 2;
  }
  const parse = options => {
    const bytes = makeFit({ durations, strokes, ...options });
    return parseFit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'long-swim.fit');
  };
  const session = parse();
  assert.equal(session.distance, 1050);
  assert.deepEqual(paceTotals(session), { distance: 1000, duration: 1000, excluded: 2 });
  assert.equal(weekVolumes([session])[0].value, 1);
  assert.match(recentTable([session]), /<td>1,000 m<\/td>/);
  assert.match(intervalTable(session), /<td>1,000 m<\/td>/);
  const bests = distanceBests([session]);
  assert.equal(bests.find(best => best.distance === 800).time, 800);
  assert.equal(bests.find(best => best.distance === 1000).time, 1000);
  assert.equal(distanceBests([parse({ restAfter: [20] })], [800])[0].time, null);
  session.lengthOverrides = { 10: 'keep' };
  assert.equal(paceTotals(session).distance, 1025);
});

test('length table shows quality status and native clickable decisions', () => {
  const html = lengthTable(exampleSession());
  assert.match(html, /Suspected artifact/);
  assert.match(html, /data-quality-sequence="5" data-quality-decision="keep"/);
  assert.match(html, /data-quality-sequence="4" data-quality-decision="exclude"/);
});

test('backup validates saved length decisions', () => {
  const session = exampleSession();
  session.lengthOverrides = { 5: 'keep' };
  assert.equal(validateBackup({ format: 'myswimlab', sessions: [session] }).length, 1);
  session.lengthOverrides = { 5: 'discard-source-file' };
  assert.throws(() => validateBackup({ format: 'myswimlab', sessions: [session] }), /Invalid session/);
});
