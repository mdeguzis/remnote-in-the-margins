import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jumpToComment } from '../src/lib/doc.ts';
import { DEFAULTS } from '../src/lib/settings.ts';
import { makeFakeRemNote, selectionIsOn } from './fakeRemNote.mjs';

/*
 * Regression tests for clicking a comment to jump to its text.
 *
 * Every bug in this area was a SEQUENCING bug against a host whose calls all
 * report success whether or not they did anything, so none of them could have
 * been caught by testing a pure function. These drive the real jumpToComment
 * against a fake host that models the observed behaviour (see fakeRemNote.mjs),
 * and assert the OUTCOME - did we end up on the right Rem - rather than the
 * sequence of calls, so the implementation can change without the tests
 * becoming a transcript.
 *
 * The three starting states below are the three that behave differently. Each
 * one shipped broken at some point.
 */

const TEXT = 'He unclosed his eyes and saw again the water below him. By diving I could evade the bullets.';
const TARGET = 'remTarget';
const OTHER = 'remOther';

const comment = {
  id: 'c1',
  docId: 'doc1',
  body: 'a note',
  createdAt: 1,
  updatedAt: 1,
  anchor: { remId: TARGET, start: 55, end: 78, quote: TEXT.slice(55, 78) },
};

/** Navigation only: the highlight blink is exercised separately. */
const NO_PULSE = { ...DEFAULTS, pulseOnJump: false, paintHighlight: false };

const world = (selection) =>
  makeFakeRemNote({
    rems: { [TARGET]: TEXT, [OTHER]: 'Some other paragraph entirely.', doc1: 'the document' },
    selection,
  });

test('lands on the target when a caret is already in the editor', async () => {
  const { plugin, state } = world({ type: 'Text', remId: OTHER, range: { start: 5, end: 5 } });

  const outcome = await jumpToComment(plugin, comment, NO_PULSE);

  assert.equal(outcome, 'jumped');
  assert.equal(selectionIsOn(state, TARGET), true);
});

test('lands when a STALE Rem selection is left over from a previous jump', async () => {
  // The "works once, then never again" bug: selectRem does nothing while a Rem
  // selection is active, so the second click silently did nothing at all.
  const { plugin, state } = world({ type: 'Rem', remIds: [OTHER] });

  const outcome = await jumpToComment(plugin, comment, NO_PULSE);

  assert.equal(outcome, 'jumped');
  assert.equal(selectionIsOn(state, TARGET), true);
  assert.ok(
    state.calls.includes('collapseSelection'),
    'must clear the stale selection, or selectRem is a no-op',
  );
});

test('lands with NOTHING selected, as on a freshly loaded page', async () => {
  // selectRem cannot work with no editor context. openRemInContext is the only
  // remedy, and it was unreachable while the fallback was gated on failure.
  const { plugin, state } = world(undefined);

  const outcome = await jumpToComment(plugin, comment, NO_PULSE);

  assert.equal(outcome, 'jumped');
  assert.equal(selectionIsOn(state, TARGET), true);
  assert.ok(
    state.calls.some((c) => c.startsWith('openRemInContext')),
    'with no selection, openRemInContext is the only thing that works',
  );
});

test('two jumps in a row both land, which is the case that kept regressing', async () => {
  const { plugin, state } = world({ type: 'Text', remId: OTHER, range: { start: 0, end: 0 } });

  assert.equal(await jumpToComment(plugin, comment, NO_PULSE), 'jumped');
  assert.equal(selectionIsOn(state, TARGET), true);

  // The first jump leaves a Rem selection behind. That is the trap.
  assert.equal(state.selection.type, 'Rem');

  assert.equal(await jumpToComment(plugin, comment, NO_PULSE), 'jumped');
  assert.equal(selectionIsOn(state, TARGET), true);
});

test('five jumps in a row all land', async () => {
  const { plugin, state } = world(undefined);
  for (let i = 0; i < 5; i++) {
    assert.equal(await jumpToComment(plugin, comment, NO_PULSE), 'jumped', `jump ${i + 1}`);
    assert.equal(selectionIsOn(state, TARGET), true, `jump ${i + 1} landed`);
  }
});

test('does NOT reopen the document when the host cannot say which one is open', async () => {
  // focusedDocumentId returns undefined once focus is inside a Rem. Treating
  // that as "we are on the wrong document" reopened the document on every
  // click, and reopening resets the scroll to the top.
  const { plugin, state } = world({ type: 'Text', remId: OTHER, range: { start: 0, end: 0 } });
  plugin.window.getOpenPaneRemId = async () => undefined;

  await jumpToComment(plugin, comment, NO_PULSE);

  assert.equal(
    state.calls.some((c) => c.startsWith('openRem:')),
    false,
    'not knowing where we are is not evidence of being in the wrong place',
  );
});

test('reopens the document when we are demonstrably on a different one', async () => {
  const { plugin, state } = world({ type: 'Text', remId: OTHER, range: { start: 0, end: 0 } });
  plugin.window.getOpenPaneRemId = async () => 'someOtherDocument';

  await jumpToComment(plugin, comment, NO_PULSE);

  assert.ok(state.calls.some((c) => c.startsWith('openRem:')), 'should navigate to the right doc');
});

test('a comment whose text has been edited away reports lost and navigates nowhere', async () => {
  const { plugin, state } = makeFakeRemNote({
    rems: { [TARGET]: 'This paragraph no longer contains the quoted words.', doc1: 'the document' },
    selection: { type: 'Text', remId: OTHER, range: { start: 0, end: 0 } },
  });

  const outcome = await jumpToComment(plugin, comment, NO_PULSE);

  assert.equal(outcome, 'lost');
  assert.equal(state.calls.length, 0, 'nothing should move when there is nowhere to go');
});

test('a document level comment opens the document and does not touch the editor', async () => {
  const { plugin, state } = world({ type: 'Text', remId: OTHER, range: { start: 0, end: 0 } });

  const outcome = await jumpToComment(plugin, { ...comment, anchor: undefined }, NO_PULSE);

  assert.equal(outcome, 'no-anchor');
  assert.equal(state.calls.some((c) => c.startsWith('selectRem')), false);
});

test('a comment on a Rem that no longer exists reports missing-rem', async () => {
  const { plugin } = world({ type: 'Text', remId: OTHER, range: { start: 0, end: 0 } });
  const orphan = { ...comment, anchor: { ...comment.anchor, remId: 'deletedRem' } };

  assert.equal(await jumpToComment(plugin, orphan, NO_PULSE), 'missing-rem');
});

test('text that has MOVED is still found, and reports moved', async () => {
  const shifted = 'Hi. ' + TEXT;
  const { plugin, state } = makeFakeRemNote({
    rems: { [TARGET]: shifted, doc1: 'the document' },
    selection: { type: 'Text', remId: OTHER, range: { start: 0, end: 0 } },
  });

  assert.equal(await jumpToComment(plugin, comment, NO_PULSE), 'moved');
  assert.equal(selectionIsOn(state, TARGET), true);
});

test('never collapses the selection AFTER writing to the Rem', async () => {
  // Writing to a Rem invalidates the selection, so a collapse afterwards
  // collapses something else, and 'start' of something else is the top of the
  // document. That produced a jump that landed correctly and then snapped away.
  //
  // Stated as an invariant rather than as a required call, because the jump may
  // legitimately have no collapse to do. What must never happen is one that
  // comes after a write.
  const { plugin, state } = world({ type: 'Text', remId: OTHER, range: { start: 0, end: 0 } });

  await jumpToComment(plugin, comment, { ...DEFAULTS, pulseOnJump: true, paintHighlight: true });

  const firstWrite = state.calls.findIndex((c) => c.startsWith('setText'));
  const lastCollapse = state.calls.lastIndexOf('collapseSelection');
  assert.ok(firstWrite !== -1, 'the blink should write to the Rem');
  if (lastCollapse !== -1) {
    assert.ok(lastCollapse < firstWrite, `collapse at ${lastCollapse} came after write at ${firstWrite}`);
  }
});

test('the blink returns the highlight to its resting colour', async () => {
  // A blink that throws halfway leaves the text the wrong colour permanently.
  const { plugin, state } = world({ type: 'Text', remId: OTHER, range: { start: 0, end: 0 } });

  await jumpToComment(plugin, comment, { ...DEFAULTS, pulseOnJump: true, paintHighlight: true });

  const writes = state.calls.filter((c) => c.startsWith('setText'));
  assert.ok(writes.length >= 4, 'a blink is remove, flash, remove, restore');
  assert.equal(writes.length % 2, 0, 'every colour change should be paired with its undo');
});
