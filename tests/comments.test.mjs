import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addComment,
  commentsOnRem,
  editComment,
  findComment,
  highlightStillNeeded,
  makeComment,
  removeComment,
  reanchor,
  chooseTarget,
} from '../src/lib/comments.ts';

const A = (over) => ({ remId: 'r1', start: 0, end: 5, quote: 'hello', ...over });

const seed = () => [
  makeComment({ id: 'c1', docId: 'd', body: 'first', anchor: A(), now: 100 }),
  makeComment({ id: 'c2', docId: 'd', body: 'second', now: 200 }),
];

test('a new comment records the same time for created and updated', () => {
  const c = makeComment({ id: 'x', docId: 'd', body: 'hi', now: 42 });
  assert.equal(c.createdAt, 42);
  assert.equal(c.updatedAt, 42);
  assert.equal(c.anchor, undefined);
});

test('adding does not mutate the existing list', () => {
  const list = seed();
  const next = addComment(list, makeComment({ id: 'c3', docId: 'd', body: 'third', now: 300 }));
  assert.equal(list.length, 2);
  assert.equal(next.length, 3);
});

test('editing changes the body and the updated time, and nothing else', () => {
  const list = seed();
  const next = editComment(list, 'c1', 'rewritten', 999);
  const c = findComment(next, 'c1');
  assert.equal(c.body, 'rewritten');
  assert.equal(c.updatedAt, 999);
  assert.equal(c.createdAt, 100, 'created time must survive an edit');
  assert.deepEqual(c.anchor, A(), 'an edit must not move the anchor');
  assert.equal(findComment(next, 'c2').body, 'second', 'neighbours untouched');
});

test('editing an id that is not there leaves the list alone', () => {
  // A stale sidebar acting on something already deleted must not resurrect it.
  const list = seed();
  const next = editComment(list, 'ghost', 'text', 1);
  assert.equal(next.length, 2);
  assert.equal(findComment(next, 'ghost'), undefined);
});

test('removing takes out exactly one comment', () => {
  const next = removeComment(seed(), 'c1');
  assert.deepEqual(next.map((c) => c.id), ['c2']);
});

test('removing an unknown id is a no-op, not an error', () => {
  assert.equal(removeComment(seed(), 'ghost').length, 2);
});

test('reanchor updates the offsets and keeps the quote', () => {
  const next = reanchor(seed(), 'c1', 30, 35);
  assert.deepEqual(findComment(next, 'c1').anchor, { remId: 'r1', start: 30, end: 35, quote: 'hello' });
});

test('reanchor ignores a document level comment', () => {
  const next = reanchor(seed(), 'c2', 1, 2);
  assert.equal(findComment(next, 'c2').anchor, undefined);
});

/*
 * The overlap rule below is the one that quietly loses a highlight. Two
 * comments on overlapping words share one painted range, so deleting either of
 * them must not strip the paint off the other.
 */

test('a highlight is dropped when nothing else covers that text', () => {
  const list = [makeComment({ id: 'c1', docId: 'd', body: 'x', anchor: A(), now: 1 })];
  assert.equal(highlightStillNeeded(list, 'c1', A()), false);
});

test('a highlight is kept when another comment overlaps it', () => {
  const list = [
    makeComment({ id: 'c1', docId: 'd', body: 'x', anchor: A({ start: 0, end: 10 }), now: 1 }),
    makeComment({ id: 'c2', docId: 'd', body: 'y', anchor: A({ start: 5, end: 15 }), now: 2 }),
  ];
  assert.equal(highlightStillNeeded(list, 'c1', A({ start: 0, end: 10 })), true);
});

test('touching but not overlapping ranges are independent', () => {
  // [0,5) and [5,10) share no character, so deleting one must clear its own paint.
  const list = [
    makeComment({ id: 'c1', docId: 'd', body: 'x', anchor: A({ start: 0, end: 5 }), now: 1 }),
    makeComment({ id: 'c2', docId: 'd', body: 'y', anchor: A({ start: 5, end: 10 }), now: 2 }),
  ];
  assert.equal(highlightStillNeeded(list, 'c1', A({ start: 0, end: 5 })), false);
});

test('an overlapping comment on a DIFFERENT Rem does not keep the highlight', () => {
  const list = [
    makeComment({ id: 'c1', docId: 'd', body: 'x', anchor: A(), now: 1 }),
    makeComment({ id: 'c2', docId: 'd', body: 'y', anchor: A({ remId: 'other' }), now: 2 }),
  ];
  assert.equal(highlightStillNeeded(list, 'c1', A()), false);
});

test('a document level comment never keeps a highlight alive', () => {
  const list = [
    makeComment({ id: 'c1', docId: 'd', body: 'x', anchor: A(), now: 1 }),
    makeComment({ id: 'c2', docId: 'd', body: 'y', now: 2 }),
  ];
  assert.equal(highlightStillNeeded(list, 'c1', A()), false);
});

test('commentsOnRem filters to one Rem and orders by position', () => {
  const list = [
    makeComment({ id: 'late', docId: 'd', body: 'x', anchor: A({ start: 40, end: 45 }), now: 1 }),
    makeComment({ id: 'early', docId: 'd', body: 'y', anchor: A({ start: 2, end: 7 }), now: 2 }),
    makeComment({ id: 'elsewhere', docId: 'd', body: 'z', anchor: A({ remId: 'r2' }), now: 3 }),
    makeComment({ id: 'doc', docId: 'd', body: 'w', now: 4 }),
  ];
  assert.deepEqual(commentsOnRem(list, 'r1').map((c) => c.id), ['early', 'late']);
});


/*
 * The composer heading is meant to follow the selection as it changes. Getting
 * this order wrong is invisible in review and obvious in use: an anchor handed
 * over by the toolbar button pinned the heading to the first phrase selected,
 * for the whole life of the composer, and only closing the sidebar cleared it.
 */

const A1 = { remId: 'r1', start: 0, end: 5, quote: 'first' };
const A2 = { remId: 'r2', start: 9, end: 15, quote: 'second' };

test('the live selection wins over one handed over by the button', () => {
  assert.deepEqual(chooseTarget(A1, A2), A2);
});

test('a handed over anchor is used when nothing is selected now', () => {
  assert.deepEqual(chooseTarget(A1, undefined), A1);
});

test('choosing the document explicitly is never overridden by a selection', () => {
  // Otherwise "Comment on the document instead" does nothing while text
  // happens to be selected, which is exactly when somebody would click it.
  assert.equal(chooseTarget('document', A2), undefined);
});

test('with no choice and no selection there is no anchor', () => {
  assert.equal(chooseTarget(undefined, undefined), undefined);
});

test('with no choice, a live selection is used', () => {
  assert.deepEqual(chooseTarget(undefined, A2), A2);
});
