import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFit } from '../src/fit/swimming-parser.js';
import { intervals, intervalSets } from '../src/analytics/intervals.js';
import { sessionPage } from '../src/ui/session-detail.js';
import { state } from '../src/state.js';
import { makeFit } from './fit-fixture.js';

const parse = opts => {
  const bytes = makeFit(opts);
  return parseFit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'swim.fit');
};

// 2 × 50 m, then 100 m, then 50 m, in a 25 m pool.
const workout = () => parse({
  durations: [20, 22, 21, 23, 30, 31, 32, 33, 24, 25],
  restAfter: [1, 3, 7],
  restSeconds: 15
});

test('active lengths between rest markers form one interval', () => {
  const list = intervals(workout());
  assert.deepEqual(list.map(item => item.distance), [50, 50, 100, 50]);
  assert.deepEqual(list.map(item => item.duration), [42, 44, 126, 49]);
  assert.deepEqual(list.map(item => item.rest), [15, 15, 15, null]);
  assert.deepEqual(list.map(item => [item.first, item.last]), [[0, 1], [3, 4], [6, 9], [11, 12]]);
  // Fixture strokes are 20 + active-length position.
  assert.deepEqual(list.map(item => item.strokes), [41, 45, 102, 57]);
});

test('consecutive intervals with the same distance form one set', () => {
  const sets = intervalSets(intervals(workout()));
  assert.deepEqual(sets.map(set => [set.intervals.length, set.intervals[0].distance]),
    [[2, 50], [1, 100], [1, 50]]);
});

test('a session without rest markers is one interval; no lengths gives none', () => {
  assert.equal(intervals(parse({ durations: [20, 21, 22] })).length, 1);
  assert.deepEqual(intervals({ lengths: [] }), []);
});

test('a missing stroke count gives no interval stroke total', () => {
  const session = parse({ durations: [20, 21] });
  session.lengths[1] = { ...session.lengths[1], strokes: null };
  assert.equal(intervals(session)[0].strokes, null);
});

test('session view shows the workout structure and one row per interval', () => {
  const session = workout();
  state.sessions = [session];
  state.selectedSessionId = session.id;
  const html = sessionPage();
  assert.match(html, /2 × 50 m · 100 m · 50 m/);
  assert.equal((html.match(/class="interval-row/g) || []).length, 4);
});

test('restart after is interval time plus the rest after it', () => {
  const session = workout();
  state.sessions = [session];
  state.selectedSessionId = session.id;
  const restarts = [...sessionPage().matchAll(/<tr class="interval-row[^]*?<td>([^<]*)<\/td>\s*<\/tr>/g)]
    .map(match => match[1]);
  // 42 + 15, 44 + 15, 126 + 15; the last interval has no rest after it.
  assert.deepEqual(restarts, ['0:57', '0:59', '2:21', '—']);
});

test('yard-pool intervals show yards', () => {
  const session = parse({ poolMeters: 22.86, poolUnit: 1, durations: [25, 26, 24, 27], restAfter: [1] });
  state.sessions = [session];
  state.selectedSessionId = session.id;
  assert.match(sessionPage(), /2 × 50 yd/);
});
