import { test } from 'node:test';
import assert from 'node:assert/strict';

import { allIndexesOf, cleanQuote, elideQuote, resolveAnchor, sortComments } from '../src/lib/anchor.ts';

/*
 * An anchor is a promise that clicking a comment lands on the words it was made
 * about. Text underneath it changes constantly, so the interesting cases are
 * all about what happens AFTER an edit, not before one.
 */

const anchor = (over) => ({ remId: 'r1', start: 10, end: 15, quote: 'brown', ...over });

test('offsets that still match are used as they are', () => {
  const res = resolveAnchor(anchor(), 'The quick brown fox');
  assert.deepEqual(res, { status: 'exact', start: 10, end: 15 });
});

test('an edit earlier in the line shifts the anchor and it follows', () => {
  // "Well, " inserted at the front pushes everything six characters right.
  const res = resolveAnchor(anchor(), 'Well, The quick brown fox');
  assert.equal(res.status, 'moved');
  assert.equal('Well, The quick brown fox'.slice(res.start, res.end), 'brown');
});

test('deleting the commented text loses the anchor rather than guessing', () => {
  const res = resolveAnchor(anchor(), 'The quick fox');
  assert.deepEqual(res, { status: 'lost' });
});

test('with the quote repeated, the occurrence nearest the old position wins', () => {
  // The comment was made on the SECOND "brown", at 18. Two characters are then
  // inserted at the front, so 18 no longer matches and both occurrences are
  // candidates. First-match would drag the comment back to the first "brown",
  // which is a different word than the one the user pointed at.
  const before = 'A brown dog and a brown fox';
  assert.equal(before.slice(18, 23), 'brown', 'fixture: 18 is the second brown');

  const after = 'Hi ' + before;
  const res = resolveAnchor({ remId: 'r1', start: 18, end: 23, quote: 'brown' }, after);
  assert.equal(res.status, 'moved');
  assert.equal(res.start, 21, 'should follow the second brown, not snap to the first');
  assert.equal(after.slice(res.start, res.end), 'brown');
});

test('an empty quote can never be re-anchored', () => {
  // It would otherwise match at index 0 and jump somewhere arbitrary.
  assert.deepEqual(resolveAnchor(anchor({ quote: '' }), 'anything at all'), { status: 'lost' });
});

test('an anchor into a line that is now empty is lost, not index 0', () => {
  assert.deepEqual(resolveAnchor(anchor(), ''), { status: 'lost' });
});

test('offsets pointing past the end of the line do not throw', () => {
  const res = resolveAnchor({ remId: 'r1', start: 900, end: 905, quote: 'brown' }, 'The brown fox');
  assert.equal(res.status, 'moved');
  assert.equal(res.start, 4);
});

test('allIndexesOf finds overlapping matches', () => {
  assert.deepEqual(allIndexesOf('aaaa', 'aa'), [0, 1, 2]);
  assert.deepEqual(allIndexesOf('abc', 'z'), []);
  assert.deepEqual(allIndexesOf('abc', ''), []);
});

test('sortComments reads down the document, with document level comments first', () => {
  const order = new Map([
    ['rA', 0],
    ['rB', 1],
  ]);
  const list = [
    { id: 'late-on-B', createdAt: 3, anchor: { remId: 'rB', start: 5, end: 8, quote: 'x' } },
    { id: 'doc', createdAt: 2 },
    { id: 'second-on-A', createdAt: 1, anchor: { remId: 'rA', start: 20, end: 22, quote: 'y' } },
    { id: 'first-on-A', createdAt: 9, anchor: { remId: 'rA', start: 2, end: 4, quote: 'z' } },
  ];
  assert.deepEqual(
    sortComments(list, order).map((c) => c.id),
    ['doc', 'first-on-A', 'second-on-A', 'late-on-B'],
  );
});

test('a comment on a Rem that is no longer in the document sorts last, not first', () => {
  // MAX_SAFE_INTEGER rather than -1 on purpose: an orphan shoving itself to the
  // top of the list is the opposite of useful.
  const order = new Map([['rA', 0]]);
  const list = [
    { id: 'orphan', createdAt: 1, anchor: { remId: 'gone', start: 0, end: 1, quote: 'q' } },
    { id: 'present', createdAt: 2, anchor: { remId: 'rA', start: 0, end: 1, quote: 'q' } },
  ];
  assert.deepEqual(
    sortComments(list, order).map((c) => c.id),
    ['present', 'orphan'],
  );
});

test('sortComments does not mutate its input', () => {
  const list = [
    { id: 'b', createdAt: 2 },
    { id: 'a', createdAt: 1 },
  ];
  sortComments(list, new Map());
  assert.deepEqual(list.map((c) => c.id), ['b', 'a']);
});

test('elideQuote truncates at the end and marks it', () => {
  // The card title reads as a sentence beginning, so it ends cleanly rather
  // than having its middle removed; the full text is on hover.
  const long = 'start of the quote ' + 'x'.repeat(200);
  const short = elideQuote(long, 40);
  assert.ok(short.length <= 41, `got ${short.length}`);
  assert.ok(short.startsWith('start of the quote'), short);
  assert.ok(short.endsWith('…'), short);
});

test('elideQuote prefers a word boundary when one is close to the limit', () => {
  // "one two three four…" and not "one two three four f…". The check is that
  // what remains is a WHOLE-WORD prefix of the original: the character following
  // it in the source is a space, so no word was cut in half.
  const source = 'one two three four five six seven eight';
  const out = elideQuote(source, 20);
  assert.ok(out.endsWith('…'), out);

  const body = out.slice(0, -1);
  assert.ok(source.startsWith(body), `not a prefix: ${body}`);
  assert.equal(source[body.length], ' ', `cut mid-word: ${body}`);
});

test('elideQuote does not gut the title for one very long word', () => {
  // A word boundary is only honoured in the last quarter, or "a" followed by a
  // 60 character word would elide to almost nothing.
  const out = elideQuote('a ' + 'y'.repeat(60), 20);
  assert.ok(out.length > 10, out);
});

test('elideQuote collapses whitespace and leaves a short quote alone', () => {
  assert.equal(elideQuote('  hello\n  world  '), 'hello world');
});

test('cleanQuote collapses whitespace without shortening, for the hover text', () => {
  const long = 'a'.repeat(300);
  assert.equal(cleanQuote(long), long);
  assert.equal(cleanQuote(' one\n\ttwo '), 'one two');
});
