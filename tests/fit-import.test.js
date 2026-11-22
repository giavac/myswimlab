import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFitFiles } from '../src/data/fit-import.js';
import { makeFit } from './fit-fixture.js';

function fitFile(name, options) {
  const binary = makeFit(options);
  return {
    name,
    size: binary.length,
    arrayBuffer: async () => binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
  };
}

test('an empty file selection contains zero swimming sessions', async () => {
  assert.deepEqual(await parseFitFiles([]), { sessions: [], failures: [], ignored: 0 });
});

test('manual import accepts FIT filenames case-insensitively and removes duplicates', async () => {
  const result = await parseFitFiles([
    { name: 'notes.txt' },
    fitFile('swim.FIT'),
    fitFile('duplicate.fit')
  ]);
  assert.deepEqual(result.sessions.map(session => session.filename), ['swim.FIT']);
  assert.deepEqual(result.failures, []);
});

test('manual import ignores non-swimming FIT activities', async () => {
  const result = await parseFitFiles([fitFile('bike.fit', { sport: 1 })]);
  assert.equal(result.sessions.length, 0);
  assert.equal(result.ignored, 1);
  assert.deepEqual(result.failures, []);
});
