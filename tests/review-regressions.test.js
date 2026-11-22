import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMessages } from '../src/fit/decoder.js';
import { parseFit } from '../src/fit/swimming-parser.js';
import { distanceBests } from '../src/analytics/best-efforts.js';
import { weekVolumes, formatDate } from '../src/analytics/metrics.js';
import { validateBackup } from '../src/data/backup.js';
import { parseFitFiles } from '../src/data/fit-import.js';
import { sessionsPage } from '../src/ui/sessions-list.js';
import { makeFit } from './fit-fixture.js';
import { state } from '../src/state.js';
import { performancePage } from '../src/ui/other-pages.js';
import { sessionPage } from '../src/ui/session-detail.js';
import { summary } from '../src/analytics/metrics.js';
import { layout } from '../src/ui/layout.js';
import { overview } from '../src/ui/overview.js';
import { qualityBaseline } from '../src/analytics/length-quality.js';

const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const parse = opts => parseFit(arrayBuffer(makeFit(opts)), 'swim.fit');

/** A minimal single-field FIT binary record for generic decoder checks. */
function scalarFit(type, size, bytes, littleEndian = true) {
  const definition = Buffer.from([0x40, 0, littleEndian ? 0 : 1,
    littleEndian ? 77 : 0, littleEndian ? 0 : 77, 1, 1, size, type]);
  const body = Buffer.concat([definition, Buffer.from([0]), bytes]);
  const header = Buffer.alloc(14);
  header[0] = 14;
  header.writeUInt32LE(body.length, 4);
  header.write('.FIT', 8, 'ascii');
  return arrayBuffer(Buffer.concat([header, body, Buffer.alloc(2)]));
}
const scalar = (type, bytes, littleEndian = true) =>
  decodeMessages(scalarFit(type, bytes.length, Buffer.from(bytes), littleEndian))[0].fields[1];

test('a 25-yard FIT pool is 22.86 meters, converted exactly once', () => {
  const swim = parse({ poolMeters: 22.86, poolUnit: 1, durations: [25, 26, 24, 27] });
  assert.equal(swim.poolMeters, 22.86);
  assert.equal(swim.poolUnit, 'yd');
  assert.equal(swim.lengths[0].distance, 22.86);
  assert.equal(swim.distance, 91.44); // distances remain meters with centimeter precision
});

test('yard best efforts are separate from meter best efforts', () => {
  const yard = parse({ poolMeters: 22.86, poolUnit: 1, durations: [25, 26, 24, 27] });
  const meter = parse({ poolMeters: 25, poolUnit: 0, durations: [21, 22, 23, 24] });
  assert.equal(distanceBests([yard, meter], [50], 'yd')[0].time, 50);
  assert.equal(distanceBests([yard, meter], [50], 'm')[0].time, 43);
  assert.equal(distanceBests([yard], [50], 'm')[0].time, null);
});

test('invalid enum is null; zero-capable unsigned types have zero sentinel', () => {
  assert.equal(scalar(0, [255]), null);
  assert.equal(scalar(0, [5]), 5);
  assert.equal(scalar(10, [0]), null);
  assert.equal(scalar(10, [255]), 255);
  assert.equal(scalar(11, [0, 0]), null);
  assert.equal(scalar(11, [255, 255]), 65535);
  assert.equal(scalar(12, [0, 0, 0, 0]), null);
  assert.equal(scalar(12, [255, 255, 255, 255]), 4294967295);
  assert.equal(scalar(16, [0, 0, 0, 0, 0, 0, 0, 0]), null);
});

test('sint64 is signed and sentinel values are null', () => {
  assert.equal(scalar(14, [255, 255, 255, 255, 255, 255, 255, 255]), -1);
  assert.equal(scalar(14, [255, 255, 255, 255, 255, 255, 255, 127]), null);
  assert.equal(scalar(15, [255, 255, 255, 255, 255, 255, 255, 255]), null);
  assert.equal(scalar(16, [255, 255, 255, 255, 255, 255, 255, 255]), 18446744073709551615n);
});

test('big-endian scalar fields decode correctly', () => {
  assert.equal(scalar(4, [0x12, 0x34], false), 0x1234);
  assert.equal(scalar(6, [0x12, 0x34, 0x56, 0x78], false), 0x12345678);
});

test('compressed timestamps remain correct past the 32-bit signed boundary', () => {
  // Message definition contains explicit timestamp field 253 followed by a
  // compact message (local type 0, offset 1) without its own timestamp field.
  const definition = Buffer.from([0x40, 0, 0, 77, 0, 1, 253, 4, 6]);
  const base = Buffer.alloc(5);
  base[0] = 0;
  base.writeUInt32LE(2 ** 31 + 31, 1);
  const compressed = Buffer.from([0x81]);
  const body = Buffer.concat([definition, base, compressed]);
  const header = Buffer.alloc(14); header[0] = 14;
  header.writeUInt32LE(body.length, 4); header.write('.FIT', 8, 'ascii');
  const messages = decodeMessages(arrayBuffer(Buffer.concat([header, body, Buffer.alloc(2)])));
  assert.equal(messages[0].fields[253], 2 ** 31 + 31);
  assert.equal(messages[1].fields[253], 2 ** 31 + 33);
});

test('developer fields are skipped without misaligning the next message', () => {
  const def = Buffer.from([0x60, 0, 0, 77, 0, 1, 1, 1, 2, 1, 0, 2, 3]);
  const body = Buffer.concat([def, Buffer.from([0, 9, 19, 0, 0, 4, 7, 0])]);
  const header = Buffer.alloc(14); header[0] = 14;
  header.writeUInt32LE(body.length, 4); header.write('.FIT', 8, 'ascii');
  const messages = decodeMessages(arrayBuffer(Buffer.concat([header, body, Buffer.alloc(2)])));
  assert.deepEqual(messages.map(m => m.fields[1]), [9, 4]);
});

test('multiple swimming session records are explicitly rejected, not merged', () => {
  assert.throws(() => parse({ additionalSession: true }), /Multi-session FIT/);
});

test('session list actually renders all entries and has keyboard-focusable buttons', () => {
  const session = parse({});
  const html = sessionsPage([session]);
  assert.match(html, /All sessions/);
  assert.match(html, /<button class="session-link" data-select=/);
  // The full session list must not silently truncate at 100 activities.
  const many = Array.from({ length: 115 }, (_, i) => ({ ...session, id: `id-${i}` }));
  const manyHtml = sessionsPage(many);
  assert.match(manyHtml, /data-select="id-114"/);
});

test('backup validation checks all sessions before a database transaction', () => {
  const valid = parse({});
  const invalid = { ...valid, id: 'bad', date: 'garbage' };
  assert.equal(validateBackup({format:'myswimlab', sessions:[valid]}).length, 1);
  assert.throws(() => validateBackup({format:'myswimlab', sessions:[valid, invalid]}), /position 2/);
  assert.throws(() => validateBackup({format:'myswimlab', sessions:[valid, valid]}), /Duplicate session/);
});

test('the 300 FIT-file limit applies to manual imports', async () => {
  const files = Array.from({length:301}, (_, i) => ({name:`${i}.fit`}));
  await assert.rejects(parseFitFiles(files), /over 300 FIT files/);
});

test('missing FIT timestamps produce stable hash IDs and valid fallback dates', () => {
  const raw = arrayBuffer(makeFit({ omitTimestamps: true }));
  const first = parseFit(raw, 'swim.fit', {
    fileHash: 'abc123', fallbackDate: '2026-11-01T08:00:00.000Z'
  });
  const second = parseFit(raw, 'swim.fit', {
    fileHash: 'abc123', fallbackDate: '2026-11-03T08:00:00.000Z'
  });
  assert.equal(first.id, 'fit-sha256-abc123');
  assert.equal(first.id, second.id);
  assert.equal(first.date, '2026-11-01T08:00:00.000Z');
});

test("local calendar dates and week grouping use the user timezone", () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Honolulu';
    const utcMonday = '2026-11-02T00:30:00Z'; // Sunday afternoon in Honolulu
    assert.notEqual(formatDate(utcMonday, {weekday:'short'}), 'Mon');
    const output = weekVolumes([{
      id:'a', date:utcMonday, distance:100, duration:1, lengths:[]
    }]);
    assert.deepEqual(output.map(v => v.value), [0.1]);
    assert.equal(output[0].label, '26 Oct');
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test('backup validation rejects an unknown pool unit', () => {
  const valid = parse({});
  const xss = { ...valid, poolUnit: '<img src=x onerror=alert(1)>' };
  assert.throws(() => validateBackup({format:'myswimlab', sessions:[xss]}), /position 1/);
  assert.equal(validateBackup({format:'myswimlab', sessions:[{ ...valid, poolUnit: 'yd' }]}).length, 1);
  assert.equal(validateBackup({format:'myswimlab', sessions:[{ ...valid, poolUnit: null }]}).length, 1);
});

test('backup validation rejects malformed length entries', () => {
  const valid = parse({});
  const bad = [null, 'x', [], { ...valid.lengths[0], isRest: 'no' },
    { ...valid.lengths[0], distance: 'far' }, { ...valid.lengths[0], duration: '1' }];
  for (const length of bad) {
    const session = { ...valid, lengths: [...valid.lengths, length] };
    assert.throws(() => validateBackup({format:'myswimlab', sessions:[session]}), /position 1/);
  }
});

test('pool unit text is escaped in rendered pages', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const session = { ...parse({}), poolUnit: payload };
  state.sessions = [session];
  state.selectedSessionId = session.id;
  for (const html of [performancePage([session]), overview([session]), sessionPage()]) {
    assert.doesNotMatch(html, /<img/);
  }
});

test('length charts label points with the record number from the length table', () => {
  const session = parse({ durations: [23, 24, 22], restAfter: [0] });
  state.sessions = [session];
  state.selectedSessionId = session.id;
  const labels = [...sessionPage().matchAll(/text-anchor="middle" font-size="11">(\d+)<\/text>/g)]
    .map(match => match[1]);
  // Record 2 is the rest marker, so the pace and stroke charts show 001, 003, 004.
  assert.deepEqual(labels, ['001', '003', '004', '001', '003', '004']);
});

test('the swimming + rest = timer line shows only when the values add up', () => {
  const session = parse({ durations: [23, 24], restAfter: [0] });
  state.sessions = [session];
  state.selectedSessionId = session.id;
  assert.match(sessionPage(), /= FIT timer/);
  state.sessions = [{ ...session, timerDuration: session.timerDuration + 60 }];
  assert.doesNotMatch(sessionPage(), /= FIT timer/);
});

test('summary stroke mean ignores non-rest lengths with no distance', () => {
  const session = parse({ durations: [23, 24] });
  const odd = { ...session.lengths[0], sequence: 2, index: 2, distance: 0, strokes: 99 };
  const base = summary([session]);
  const withOdd = summary([{ ...session, lengths: [...session.lengths, odd] }]);
  assert.equal(withOdd.stroke, base.stroke);
  assert.equal(withOdd.activeLengths, base.activeLengths);
});

test('session analysis marks only distances where the session holds the current best', () => {
  const fast = parse({ durations: [20, 20, 20, 20] });
  const slow = parse({ durations: [25, 25, 25, 25, 25, 25, 25, 25] });
  state.sessions = [fast, slow];
  state.period = '7'; // PBs compare all loaded sessions, not the selected period.

  state.selectedSessionId = fast.id;
  const fastHtml = sessionPage();
  assert.match(fastHtml, /Personal best · 3 distances/);
  assert.ok(fastHtml.includes('<td class="pb-dist">100 m</td><td>1:20</td>'));
  assert.ok(!fastHtml.includes('pb-dist">200 m'));

  state.selectedSessionId = slow.id;
  const slowHtml = sessionPage();
  assert.match(slowHtml, /Personal best · 1 distance</);
  assert.ok(slowHtml.includes('<td class="pb-dist">200 m</td><td>3:20</td>'));
  assert.ok(slowHtml.includes('REC 001–008'));
  assert.ok(!slowHtml.includes('pb-dist">25 m'));
  state.period = 'all';
});

test('personal-best record numbers match the length table across a rest', () => {
  const session = parse({ durations: [30, 20, 21, 30], restAfter: [0] });
  state.sessions = [session];
  state.selectedSessionId = session.id;
  const html = sessionPage();
  assert.match(html, /pb-dist">25 m<\/td><td>0:20<\/td>[\s\S]*?REC 003</);
  assert.match(html, /pb-dist">50 m<\/td><td>0:41<\/td>[\s\S]*?REC 003–004</);
});

test('a session without a personal best has no badge', () => {
  const fast = parse({ durations: [20, 20, 20, 20] });
  const slow = parse({ durations: [25, 25, 25, 25] });
  state.sessions = [fast, slow];
  state.selectedSessionId = slow.id;
  assert.ok(!sessionPage().includes('Personal best'));
});

test('the footer links to the GitHub issue form in a new tab', () => {
  assert.match(layout(), /<footer>[\s\S]*<a href="https:\/\/github\.com\/giavac\/myswimlab\/issues\/new" target="_blank" rel="noopener">Report an issue<\/a>[\s\S]*<\/footer>/);
});

/** Ten 30 s lengths with 20..29 strokes; record 005 is made suspect (12 s, 5 strokes). */
function sessionWithSuspect() {
  const session = parse({ durations: Array(10).fill(30) });
  session.lengths[4] = { ...session.lengths[4], duration: 12, strokes: 5 };
  return session;
}

test('quality baseline gives the session medians, or null with too few lengths', () => {
  const baseline = qualityBaseline(sessionWithSuspect());
  assert.equal(baseline.timePerMeter, 1.2);
  assert.equal(baseline.strokes, 24);
  assert.equal(qualityBaseline(parse({ durations: Array(7).fill(30) })), null);
});

test('summary reports the stroke sample size', () => {
  assert.equal(summary([parse({})]).strokeLengths, 4);
});

test('data-quality panel shows the rule, the medians and the record ID', () => {
  const session = sessionWithSuspect();
  state.sessions = [session];
  state.selectedSessionId = session.id;
  const html = sessionPage();
  assert.ok(html.includes('Rule: pace &lt; 60% of median AND strokes &lt; 65% of median.'));
  assert.ok(html.includes('Session median: 0:30 · 24 strokes per length.'));
  assert.match(html, /<td class="warn">▲ 005<\/td>\s*<td>0:12 <span class="muted">\/ 0:30<\/span><\/td>/);
  assert.ok(html.includes('>Automatic<'));
  assert.ok(html.includes('Review REC 005'));
});

test('the pace chart shades the longest personal-best segment', () => {
  const session = parse({ durations: Array(8).fill(25) });
  state.sessions = [session];
  state.selectedSessionId = session.id;
  const html = sessionPage();
  assert.equal((html.match(/class="chart-band"/g) || []).length, 1);
  assert.ok(html.includes('>PB 200 m</text>'));
});

test('overview marks new bests, PB holders and suspect counts', () => {
  const latest = { ...parse({ durations: [20, 20, 20, 20] }), date: '2026-11-10T08:00:00.000Z' };
  const older = { ...sessionWithSuspect(), date: '2026-11-01T08:00:00.000Z' };
  state.sessions = [latest, older];
  const html = overview([latest, older]);
  assert.ok(html.includes('100 m · NEW'));
  assert.ok(!html.includes('200 m · NEW'));
  const rows = html.split('<tr data-select=').slice(1);
  assert.match(rows[0], /class="pb-mark"/);
  assert.match(rows[0], /<td class="muted">—<\/td>/);
  assert.match(rows[1], /<td class="warn">▲ 1<\/td>/);
});

test('the top bar shows a status line with the session count', () => {
  state.sessions = [parse({})];
  assert.match(layout(), /class="statusline"[^>]*>.*N=1 · LOCAL<\/div>/);
});
