import test from 'node:test';
import assert from 'node:assert/strict';
import { listFitEntries, readFitFolder } from '../src/data/folder-source.js';
import { makeFit } from './fit-fixture.js';

const binary = makeFit();
const file = {
  name: 'swim.fit',
  size: binary.length,
  arrayBuffer: async () => binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
};

function directory(name, children = []) {
  return {
    name, kind: 'directory',
    async *values() { for (const child of children) yield child; }
  };
}

const fileHandle = (name, value = file) => ({
  name, kind: 'file', getFile: async () => ({ ...value, name })
});

test('an empty folder contains zero swimming sessions', async () => {
  const result = await readFitFolder(directory('empty'));
  assert.deepEqual(result.sessions, []);
  assert.equal(result.ignored, 0);
});

test('folder reader only takes FIT files, recursively', async () => {
  const input = directory('root', [
    fileHandle('notes.txt'),
    directory('2026', [fileHandle('swim.fit')])
  ]);
  const entries = await listFitEntries(input);
  assert.deepEqual(entries.map(item => item.path), ['2026/swim.fit']);
  const result = await readFitFolder(input);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].filename, '2026/swim.fit');
});

test('non-swimming FIT activity is ignored rather than presented', async () => {
  const other = makeFit({ sport: 1 });
  const input = directory('root', [
    fileHandle('bike.fit', {
      size: other.length,
      arrayBuffer: async () => other.buffer.slice(other.byteOffset, other.byteOffset + other.byteLength)
    })
  ]);
  const result = await readFitFolder(input);
  assert.equal(result.sessions.length, 0);
  assert.equal(result.ignored, 1);
});
