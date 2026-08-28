import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeStoredList } from '../src/lib/storage.ts';

/*
 * The bug this exists to stop coming back:
 *
 *   "Comments for VsW39vxan0dSKoPYb are corrupt: expected an array, found object"
 *
 * on a document that had no comments at all. RemNote's synced storage returns an
 * empty OBJECT for a key it has never seen, not undefined, so the panel refused
 * to open on every document until somebody had already commented on it, which is
 * impossible by definition.
 */

test('an unset key comes back as {} and that means empty, not corrupt', () => {
  assert.deepEqual(normalizeStoredList({}, 'Comments'), []);
});

test('undefined and null are empty too', () => {
  assert.deepEqual(normalizeStoredList(undefined, 'Comments'), []);
  assert.deepEqual(normalizeStoredList(null, 'Comments'), []);
});

test('a real array passes through untouched', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  assert.equal(normalizeStoredList(list, 'Comments'), list);
});

test('an empty array is empty, and is not confused with a missing key', () => {
  assert.deepEqual(normalizeStoredList([], 'Comments'), []);
});

test('an array that lost its type in transit is rebuilt in order', () => {
  // A JSON round trip somewhere in the sync layer can turn [a, b] into
  // {"0": a, "1": b}. Losing somebody's comments to that would be unforgivable.
  const stored = { 0: { id: 'a' }, 1: { id: 'b' }, 2: { id: 'c' } };
  assert.deepEqual(normalizeStoredList(stored, 'Comments'), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('an object with real keys is corrupt and says so rather than reporting empty', () => {
  // Returning [] here would tell somebody their comments are gone when they are
  // only unreadable, which is the failure mode worth being loud about.
  assert.throws(
    () => normalizeStoredList({ hello: 'world' }, 'Comments for doc1'),
    /Comments for doc1 is corrupt/,
  );
});

test('a gap in the numeric keys is not silently compacted', () => {
  // {"0": a, "2": c} is not an array with a hole, it is something unexpected.
  // Quietly returning [a, c] would renumber comments and mis-anchor them.
  assert.throws(() => normalizeStoredList({ 0: 'a', 2: 'c' }, 'Comments'), /corrupt/);
});

test('key order in the source does not matter, because JavaScript decides it', () => {
  // Integer-like keys are always enumerated in ascending numeric order whatever
  // order they were written in, so { 1: 'b', 0: 'a' } and { 0: 'a', 1: 'b' } are
  // the same object and there is nothing to distinguish. Rebuilding in key order
  // is therefore right, not a guess.
  assert.deepEqual(Object.keys({ 1: 'b', 0: 'a' }), ['0', '1']);
  assert.deepEqual(normalizeStoredList({ 1: 'b', 0: 'a' }, 'Comments'), ['a', 'b']);
});

test('a scalar is corrupt', () => {
  assert.throws(() => normalizeStoredList('nope', 'Comments'), /corrupt/);
  assert.throws(() => normalizeStoredList(42, 'Comments'), /corrupt/);
});
