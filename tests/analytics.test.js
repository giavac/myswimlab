import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceBests } from '../src/analytics/best-efforts.js';
import { pace, summary, weekVolumes, weeklyTraining, lengthDrift } from '../src/analytics/metrics.js';

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

test('weekly averages include gaps and separate the week in progress', () => {
  const session = (day, distance, duration) => ({
    date: new Date(2026, 10, day, 12).toISOString(), distance, duration
  });
  const results = weeklyTraining([
    session(17, 2000, 2400), session(3, 3000, 3600), session(4, 1000, 1200)
  ], new Date(2026, 10, 20, 12));

  assert.deepEqual(results.completed.map(week => [new Date(week.week).getDate(), week.sessions]), [[2, 2], [9, 0]]);
  assert.deepEqual(results.average, { distance: 2000, duration: 2400, sessions: 1 });
  assert.equal(results.activeWeeks, 1);
  assert.deepEqual(results.current, { distance: 2000, duration: 2400, sessions: 1 });
});

test('historical selections end with their last swim week', () => {
  const session = { date: new Date(2026, 10, 3, 12).toISOString(), distance: 1500, duration: 1800 };
  const results = weeklyTraining([session], new Date(2026, 10, 23, 12));
  assert.equal(results.completed.length, 1);
  assert.equal(results.current, null);

  const currentOnly = weeklyTraining([session], new Date(2026, 10, 4, 12));
  assert.equal(currentOnly.average, null);
  assert.equal(currentOnly.current.sessions, 1);
  assert.equal(weeklyTraining([]).average, null);
});
