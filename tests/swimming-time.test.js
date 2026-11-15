/** Regression tests for FIT timers that include pool-rest intervals. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFit } from '../src/fit/swimming-parser.js';
import { pace, summary } from '../src/analytics/metrics.js';
import { makeFit } from './fit-fixture.js';

function swim(options) {
  const bytes = makeFit(options);
  return parseFit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'swim.fit');
}

test('pool pace and swimming time exclude explicit idle lengths', () => {
  // Two 25 m lengths in 30 s each, with 40 s idle between them.
  // The FIT session timer therefore totals 100 s, NOT 60 s.
  const session = swim({ durations: [30, 30], restAfter: [0], restSeconds: 40 });
  assert.equal(session.distance, 50);
  assert.equal(session.duration, 60);
  assert.equal(session.timerDuration, 100);
  assert.equal(session.restDuration, 40);
  assert.equal(session.elapsed, 110);
  assert.equal(session.durationBasis, 'active-lengths');
  assert.equal(pace(session), 120); // 2:00 / 100 m, not 3:20.
  assert.equal(summary([session]).pace, 120);
  assert.equal(summary([session]).duration, 60);
});

test('pool pace excludes rest even when optional swim time field 78 is missing', () => {
  const session = swim({ durations: [25, 30], restAfter: [0], omitSwimTime: true });
  assert.equal(session.duration, 55);
  assert.equal(session.restDuration, 10);
  assert.equal(session.timerDuration, 65);
  assert.equal(pace(session), 110);
});

test('open-water activities keep FIT session timer instead of pool-length totals', () => {
  const session = swim({ durations: [25, 30], restAfter: [0], subSport: 18 });
  assert.equal(session.sport, 'open-water');
  assert.equal(session.duration, 65);
  assert.equal(session.durationBasis, 'timer');
  assert.equal(session.restDuration, null);
});

test('existing v0.4.1 session IDs remain stable when swimming time changes', () => {
  const session = swim({ durations: [25, 30], restAfter: [0] });
  assert.equal(session.id, `fit-${session.date}-50-65.0`);
  assert.equal(session.duration, 55);
});
