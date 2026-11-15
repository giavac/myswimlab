import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceBests } from '../src/analytics/best-efforts.js';
import { pace, summary, weekVolumes, lengthDrift } from '../src/analytics/metrics.js';

const length = (duration, sequence, isRest = false) => ({
  duration, sequence, index: sequence, isRest,
  distance: isRest ? 0 : 25, strokes: isRest ? null : 20
});

const makeSession = lengths => ({
  id: 'sample', date: '2026-11-04T09:00:00Z', sport: 'pool',
  distance: lengths.filter(item => !item.isRest).length * 25,
  duration: lengths.filter(item => !item.isRest).reduce((total, item) => total + item.duration, 0),
  lengths
});

test('best efforts are measured from contiguous lengths', () => {
  const session = makeSession([length(23, 0), length(24, 1), length(22, 2), length(25, 3)]);
  const [best25, best50, best100, best200] = distanceBests([session], [25, 50, 100, 200]);
  assert.equal(best25.time, 22);
  assert.equal(best50.time, 46);
  assert.equal(best100.time, 94);
  assert.equal(best200.time, null);
});

test('best efforts do not cross a rest marker', () => {
  const session = makeSession([length(23, 0), length(0, 1, true), length(22, 2)]);
  assert.equal(distanceBests([session], [50])[0].time, null);
});

test('best efforts do not cross missing indices', () => {
  const session = makeSession([length(23, 0), length(22, 2)]);
  assert.equal(distanceBests([session], [50])[0].time, null);
});

test('open water is excluded from pool-length best efforts', () => {
  const session = makeSession([length(23, 0), length(22, 1)]);
  session.sport = 'open-water';
  assert.equal(distanceBests([session], [50])[0].time, null);
});

test('summary calculates volume and mean strokes from normalized data', () => {
  const session = makeSession([length(23, 0), length(24, 1)]);
  assert.equal(pace(session), 94);
  const result = summary([session]);
  assert.equal(result.distance, 50);
  assert.equal(result.stroke, 20);
  assert.equal(result.sessions, 1);
});

test('weekly totals aggregate by the local Monday', () => {
  const first = { ...makeSession([length(23, 0)]), date: '2026-11-02T12:00:00Z' };
  const second = { ...first, id: 'later', date: '2026-11-04T12:00:00Z' };
  assert.deepEqual(weekVolumes([first, second]).map(item => item.value), [0.05]);
});

test('stroke drift reports null for short sessions', () => {
  assert.equal(lengthDrift(makeSession([length(23, 0)])), null);
});
