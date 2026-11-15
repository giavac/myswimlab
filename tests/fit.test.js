import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMessages } from '../src/fit/decoder.js';
import { parseFit } from '../src/fit/swimming-parser.js';
import { makeFit } from './fit-fixture.js';

function decode(options) {
  const buffer = makeFit(options);
  return parseFit(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), 'test.fit');
}

test('FIT decoder identifies session and length messages', () => {
  const binary = makeFit();
  const messages = decodeMessages(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
  assert.equal(messages.filter(message => message.global === 18).length, 1);
  assert.equal(messages.filter(message => message.global === 101).length, 4);
});

test('pool FIT files produce a normalized swimming session', () => {
  const session = decode({ durations: [23, 24, 22, 25] });
  assert.equal(session.sport, 'pool');
  assert.equal(session.poolMeters, 25);
  assert.equal(session.distance, 100);
  assert.equal(session.duration, 94);
  assert.equal(session.lengths.length, 4);
  assert.deepEqual(session.lengths.map(length => length.strokes), [20, 21, 22, 23]);
});

test('regression: sub_sport 18 is open-water, not pool', () => {
  const session = decode({ subSport: 18 });
  assert.equal(session.sport, 'open-water');
  assert.equal(session.poolMeters, null);
});

test('rest markers are retained as zero-distance lengths', () => {
  const session = decode({ durations: [23, 24], restAfter: [0] });
  assert.deepEqual(session.lengths.map(length => length.isRest), [false, true, false]);
  assert.deepEqual(session.lengths.map(length => length.distance), [25, 0, 25]);
});

test('non-swimming activity is rejected', () => {
  assert.throws(() => decode({ sport: 1 }), /non-swimming activity/);
});

test('invalid FIT header is rejected', () => {
  assert.throws(() => decodeMessages(new ArrayBuffer(16)), /valid FIT file header/);
});
