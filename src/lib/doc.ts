import type { RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import { resolveAnchor } from './anchor.ts';
import { describeError, log } from './log.ts';
import {
  PULSE_COLOR,
  PULSE_FALLBACK,
  PULSE_MS,
  PULSE_TIMES,
  type HighlightColor,
  type Settings,
} from './settings.ts';
import { SELECTION_TEXT } from './types.ts';
import type { Anchor, Comment, RemId } from './types.ts';

/**
 * Everything that talks to the document itself: reading a selection, painting
 * the highlight that marks commented text, and jumping back to it.
 *
 * None of this is unit testable without RemNote, which is exactly why the
 * arithmetic it depends on lives in `anchor.ts` instead.
 */

/**
 * What each selection log last said, so an unchanged answer is not repeated.
 *
 * Keyed by message, because there are two of these and deduplicating them
 * against a single shared value means they cancel each other out. The
 * "captured an anchor" line originally had no deduplication at all and fired on
 * every poll: several hundred identical entries, which is worse than no logging
 * because it buries everything else.
 */
/**
 * Does the host's selection sit on this Rem?
 *
 * Both shapes, because a Rem selection carries `remIds` (an array) and a text
 * selection carries `remId`. Reading only one of them is how an earlier version
 * of this check silently never matched.
 */
function landedOn(selection: unknown, remId: RemId): boolean {
  const one = (selection as { remId?: string } | undefined)?.remId;
  if (typeof one === 'string') return one === remId;
  const many = (selection as { remIds?: string[] } | undefined)?.remIds;
  return Array.isArray(many) ? many.includes(remId) : false;
}

const lastSelectionLog = new Map<string, string>();

function logSelectionOnce(message: string, context: Record<string, unknown>): void {
  const signature = JSON.stringify(context);
  if (lastSelectionLog.get(message) === signature) return;
  lastSelectionLog.set(message, signature);
  // DEBUG, behind the "Enable debug console messages" setting. It was
  // temporarily INFO while the selection path was unproven, because the setting
  // did not reach widgets and gating it produced silence instead of an answer.
  // That is fixed, so this is back to being opt in. Deduplicated, so a 400ms
  // poll costs one line per actual change rather than several per second.
  log('DEBUG', message, context);
}

/** The plain text of a Rem, as RemNote counts characters. */
async function plainTextOf(plugin: RNPlugin, richText: RichTextInterface | undefined): Promise<string> {
  if (!richText) return '';
  // Deliberately RemNote's own flattening rather than a local one. The offsets
  // in an Anchor come from the host's editor, so the string they index into has
  // to come from the host too - a local flattener that renders a rem reference
  // differently would put every anchor a few characters out.
  return await plugin.richText.toString(richText);
}

/** Which document is open in a pane. */
export async function documentIdForPane(
  plugin: RNPlugin,
  paneId: string | undefined,
): Promise<RemId | undefined> {
  const id = await plugin.window.getOpenPaneRemId(paneId);
  return id ?? undefined;
}

/** Which document is open in whichever pane has focus. */
export async function focusedDocumentId(plugin: RNPlugin): Promise<RemId | undefined> {
  const paneId = await plugin.window.getFocusedPaneId();
  return await documentIdForPane(plugin, paneId);
}

/**
 * The user's current text selection, as an anchor.
 *
 * Returns undefined when nothing is selected, or when what is selected is a set
 * of whole Rem rather than a stretch of text. Selecting whole lines is a
 * different gesture with a different meaning, and quietly turning it into a
 * character range would comment on something the user did not point at.
 */
export async function captureSelection(plugin: RNPlugin): Promise<Anchor | undefined> {
  let selection: Awaited<ReturnType<RNPlugin['editor']['getSelection']>>;
  try {
    selection = await plugin.editor.getSelection();
  } catch (err) {
    // A THROW here and an empty answer mean completely different things: one is
    // "the host refused", the other is "nothing is selected". They were
    // indistinguishable while this was silently swallowed upstream.
    log('WARN', 'captureSelection: getSelection threw', {
      ...describeError(err),
      source: 'editor.getSelection',
    });
    return undefined;
  }

  // Logged in full, but only when the answer CHANGES. "My comment came out
  // document level" has several causes that look identical from outside: the
  // host returning nothing, returning a Rem selection instead of a Text one, or
  // returning a range that collapses. This line distinguishes them. It is
  // deduplicated because the caller polls several times a second and an
  // unreadable console is no more use than no console.
  logSelectionOnce('captureSelection: raw selection from host', {
    present: Boolean(selection),
    type: selection?.type ?? 'none',
    remId: (selection as { remId?: string } | undefined)?.remId ?? null,
    // remIds, not just remId. A Rem selection carries the array and no remId, so
    // logging only remId printed "null" for every Rem selection and hid the one
    // field that says which line the host thinks is selected.
    remIds: (selection as { remIds?: string[] } | undefined)?.remIds ?? null,
    keys: selection ? Object.keys(selection) : null,
    range: (selection as { range?: { start: number; end: number } } | undefined)?.range ?? null,
    expectedType: SELECTION_TEXT,
    source: 'editor.getSelection',
  });

  if (!selection || selection.type !== SELECTION_TEXT) {
    return undefined;
  }

  const { remId, range, richText } = selection;
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (end <= start) {
    log('DEBUG', 'captureSelection: selection is empty', { remId, start, end, source: 'editor.getSelection' });
    return undefined;
  }

  // The quote is taken from the REM's own text, sliced with the host's offsets,
  // NOT from selection.richText.
  //
  // That distinction was the bug. `substring(selection.richText, start, end)`
  // assumes selection.richText is the whole line, so the offsets index into it.
  // If it is instead the SELECTED fragment, those offsets fall past its end, the
  // substring comes back empty, and an empty quote is discarded as "whitespace
  // only" - which is exactly what happened: the host reported a perfectly good
  // Text selection with a remId and a range, and the comment still came out
  // attached to the document.
  //
  // Reading the Rem is also the version that cannot drift: resolveAnchor later
  // matches this quote against the Rem's text using the same offsets, so both
  // ends of the anchor now come from one string.
  let quote = '';
  const rem = await plugin.rem.findOne(remId);
  if (rem?.text) {
    const full = await plugin.richText.toString(rem.text);
    quote = full.slice(start, end);
  }

  // Fall back to whatever the selection itself carries, which covers the case
  // where the Rem cannot be read but the host handed us the text anyway.
  if (quote.trim().length === 0 && richText) {
    quote = await plugin.richText.toString(richText);
  }

  if (quote.trim().length === 0) {
    log('WARN', 'captureSelection: selection produced no text', {
      remId,
      start,
      end,
      hadRem: Boolean(rem),
      source: 'captureSelection',
    });
    return undefined;
  }

  logSelectionOnce('captureSelection: captured an anchor', {
    remId,
    start,
    end,
    quoteLength: quote.length,
    quotePreview: quote.slice(0, 40),
    source: 'captureSelection',
  });
  return { remId, start, end, quote };
}

/** Paint RemNote's own highlight over a comment's text, so it is visible in the document. */
export async function paintHighlight(
  plugin: RNPlugin,
  anchor: Anchor,
  color: HighlightColor,
): Promise<void> {
  await reformat(plugin, anchor, color, 'apply');
}

/** Take the highlight back off, when the last comment on that text is deleted. */
export async function clearHighlight(
  plugin: RNPlugin,
  anchor: Anchor,
  color: HighlightColor,
): Promise<void> {
  await reformat(plugin, anchor, color, 'remove');
}

async function reformat(
  plugin: RNPlugin,
  anchor: Anchor,
  color: HighlightColor,
  op: 'apply' | 'remove',
): Promise<void> {
  const rem = await plugin.rem.findOne(anchor.remId);
  if (!rem) {
    log('WARN', `highlight ${op} skipped, Rem not found`, {
      remId: anchor.remId,
      source: 'rem.findOne',
      op,
    });
    return;
  }

  const text = rem.text ?? [];
  const full = await plainTextOf(plugin, text);
  const at = resolveAnchor(anchor, full);
  if (at.status === 'lost') {
    log('WARN', `highlight ${op} skipped, anchor text is gone`, {
      remId: anchor.remId,
      quoteLength: anchor.quote.length,
      source: 'resolveAnchor',
      op,
    });
    return;
  }

  const next =
    op === 'apply'
      ? await plugin.richText.applyTextFormatToRange(text, at.start!, at.end!, color)
      : await plugin.richText.removeTextFormatFromRange(text, at.start!, at.end!, color);

  await rem.setText(next);
  log('DEBUG', `highlight ${op}`, {
    remId: anchor.remId,
    start: at.start,
    end: at.end,
    color,
    anchorStatus: at.status,
    source: 'richText.applyTextFormatToRange',
    op,
  });
}

export type JumpOutcome = 'jumped' | 'moved' | 'lost' | 'no-anchor' | 'missing-rem';

/**
 * Go to the text a comment was made on and make it obvious where that is.
 *
 * The visible flash is RemNote's own selection: selecting the range both scrolls
 * it into view and renders it highlighted, without writing anything to the
 * document. The optional colour pulse on top of that is a real edit to the Rem,
 * which is why it is a setting rather than the only mechanism.
 */
export async function jumpToComment(
  plugin: RNPlugin,
  comment: Comment,
  settings: Settings,
): Promise<JumpOutcome> {
  const { anchor } = comment;
  if (!anchor) {
    // A document level comment has nowhere to jump to. Open the document so the
    // click still does something recognisable.
    const doc = await plugin.rem.findOne(comment.docId);
    if (doc) await plugin.window.openRem(doc);
    log('DEBUG', 'jump: document level comment, opened the document', {
      commentId: comment.id,
      docId: comment.docId,
      source: 'window.openRem',
    });
    return 'no-anchor';
  }

  const rem = await plugin.rem.findOne(anchor.remId);
  if (!rem) {
    log('WARN', 'jump failed: the Rem this comment was made on no longer exists', {
      commentId: comment.id,
      remId: anchor.remId,
      source: 'rem.findOne',
    });
    return 'missing-rem';
  }

  const full = await plainTextOf(plugin, rem.text);
  const at = resolveAnchor(anchor, full);
  if (at.status === 'lost') {
    log('WARN', 'jump failed: the commented text has been edited away', {
      commentId: comment.id,
      remId: anchor.remId,
      quoteLength: anchor.quote.length,
      source: 'resolveAnchor',
    });
    return 'lost';
  }

  // If the reader has navigated somewhere else, put them back on the document
  // first, or selecting a Rem that is not on screen does nothing visible.
  // Reopen ONLY when we positively know we are on a different document.
  //
  // `openDocId !== comment.docId` also fires when openDocId is undefined, and
  // focusedDocumentId does return undefined once focus has moved into a Rem -
  // which is exactly the state the previous jump left behind. So the second
  // click on a comment reopened the document, and reopening resets the scroll
  // to the top. That is the "works once, then jumps to the top forever" bug.
  //
  // Not knowing where we are is not evidence of being in the wrong place. Same
  // fail-open rule as the focus check below.
  const openDocId = await focusedDocumentId(plugin);
  if (openDocId && openDocId !== comment.docId) {
    const doc = await plugin.rem.findOne(comment.docId);
    if (doc) await plugin.window.openRem(doc);
    log('DEBUG', 'jump: reopened the document first', {
      commentId: comment.id,
      wasOn: openDocId,
      openedDocId: comment.docId,
      source: 'window.openRem',
    });
  }

  // Three ways to land on the text, tried in order and INDEPENDENTLY.
  //
  // Previously these were two bare awaits in sequence, so if selectRem rejected
  // - and there is no SDK guarantee it works for a Rem that is merely on screen
  // rather than focused - selectText never ran and the whole jump failed with
  // nothing on screen and nothing in the console to say why.
  //
  // Each step is now attempted, reported, and allowed to fail on its own.
  const step = async (what: string, fn: () => Promise<unknown>): Promise<boolean> => {
    try {
      await fn();
      log('DEBUG', `jump: ${what} ok`, { commentId: comment.id, remId: anchor.remId, source: 'jumpToComment' });
      return true;
    } catch (err) {
      log('WARN', `jump: ${what} failed`, {
        commentId: comment.id,
        remId: anchor.remId,
        ...describeError(err),
        source: 'jumpToComment',
      });
      return false;
    }
  };

  // Where the editor was before we touched anything. A jump that misbehaves is
  // almost always explained by where focus already was, and that is invisible
  // once the jump has run.
  const before = await plugin.editor.getSelection().catch(() => undefined);
  log('DEBUG', 'jump: editor state before', {
    commentId: comment.id,
    targetRemId: anchor.remId,
    beforeType: (before as { type?: string } | undefined)?.type ?? 'none',
    beforeRemId: (before as { remId?: string } | undefined)?.remId ?? null,
    beforeRemIds: (before as { remIds?: string[] } | undefined)?.remIds ?? null,
    beforeRange: (before as { range?: unknown } | undefined)?.range ?? null,
    source: 'jumpToComment',
  });

  // No pre-emptive collapse here. It was tried, and mutation testing showed
  // removing it changed nothing: the verify-and-retry below already covers the
  // stale-Rem case, so the pre-collapse was a second mechanism for a problem
  // that already had one. Two paths to the same fix is how they drift.
  //
  // Selecting the line is what scrolls it into view.
  let selectedRem = await step('selectRem', () => plugin.editor.selectRem([anchor.remId]));

  // And where it ended up, so a wrong landing is visible rather than inferred.
  let after = await plugin.editor.getSelection().catch(() => undefined);

  // One retry, because a no-op selectRem reports success and the only way to
  // know it did nothing is to look. Collapsing first is what makes the retry
  // different from the attempt that just failed.
  if (!landedOn(after, anchor.remId)) {
    await step('collapseSelection (retry)', () => plugin.editor.collapseSelection('start'));
    selectedRem = await step('selectRem (retry)', () =>
      plugin.editor.selectRem([anchor.remId]),
    );
    after = await plugin.editor.getSelection().catch(() => undefined);
  }

  log('DEBUG', 'jump: editor state after selectRem', {
    commentId: comment.id,
    targetRemId: anchor.remId,
    afterType: (after as { type?: string } | undefined)?.type ?? 'none',
    afterRemId: (after as { remId?: string } | undefined)?.remId ?? null,
    afterRemIds: (after as { remIds?: string[] } | undefined)?.remIds ?? null,
    landedOnTarget: landedOn(after, anchor.remId),
    source: 'jumpToComment',
  });

  // There is deliberately NO editor.selectText call here, and that is the fix
  // rather than an omission.
  //
  // Evidence, from a log of several jumps in one session: the jump that SKIPPED
  // selectText landed correctly, and every jump that RAN it broke - scrolling to
  // the top of the document and raising the formatting toolbar over an unrelated
  // paragraph. It only ran from the second jump onward, because the first found
  // no selection to confirm against, which is exactly the "works once, then
  // never again" report.
  //
  // selectRem scrolls the line into view, which is the part that matters, and
  // the highlight blink below marks the precise words. selectText was only ever
  // adding precision to the selection highlight, and it cost correctness.
  //
  // Four rounds went into guarding, delaying and collapsing around this call
  // before reading the log the other way up and noticing that the working case
  // was the one that never made it.
  const selectedText = false;

  // Last resort, gated on whether we LANDED rather than on whether the calls
  // succeeded.
  //
  // That distinction is the fix. selectRem resolves ok even when it does
  // nothing, so a fallback conditioned on failure never ran. The case it exists
  // for is a fresh page where no editor is focused at all (beforeType 'none'):
  // there, selectRem has no context to work from and reports success twice
  // while the view does not move. Landing is the only honest test.
  if (!landedOn(after, anchor.remId)) {
    log('INFO', 'jump: selectRem did not land, opening the Rem in context', {
      commentId: comment.id,
      remId: anchor.remId,
      beforeType: (before as { type?: string } | undefined)?.type ?? 'none',
      source: 'jumpToComment',
    });
    await step('openRemInContext', () => rem.openRemInContext());
  }

  if (settings.pulseOnJump && settings.paintHighlight) {
    // Collapse FIRST, then blink. The order is the whole fix.
    //
    // Selecting text is what scrolls it into view, but it also raises RemNote's
    // formatting toolbar over the paragraph, which is noise when the user asked
    // to LOOK at something rather than edit it.
    //
    // Collapsing has to happen while the selection is still OURS. The pulse
    // rewrites the Rem's text eight times, and those writes disturb whatever
    // selection exists; collapsing afterwards was therefore collapsing something
    // else, and 'start' of something else is the top of the document. That is
    // the "works once, then jumps to the top" report, and it survived the
    // earlier openRem fix because it has a different cause: every step still
    // logged ok, because every step DID succeed.
    //
    // Collapsed to the start of the range, so the caret stays on the words we
    // just scrolled to.
    // No selection to collapse: nothing selects text any more, so RemNote's
    // formatting toolbar never appears and there is nothing to dismiss.
    await pulse(plugin, { ...anchor, start: at.start!, end: at.end! }, settings.highlightColor);
  }

  log('DEBUG', 'jump: done', {
    commentId: comment.id,
    remId: anchor.remId,
    start: at.start,
    end: at.end,
    anchorStatus: at.status,
    selectedRem,
    selectedText,
    source: 'jumpToComment',
  });
  return at.status === 'moved' ? 'moved' : 'jumped';
}

/**
 * Briefly recolour the highlight, then put it back.
 *
 * Best effort on purpose. A pulse is decoration, and failing to decorate must
 * not turn a successful jump into an error the user sees - but it is logged,
 * because a pulse that throws halfway leaves the wrong colour on the text and
 * that needs to be diagnosable.
 */
async function pulse(plugin: RNPlugin, anchor: Anchor, resting: HighlightColor): Promise<void> {
  const flash: HighlightColor = resting === PULSE_COLOR ? PULSE_FALLBACK : PULSE_COLOR;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    for (let i = 0; i < PULSE_TIMES; i++) {
      await clearHighlight(plugin, anchor, resting);
      await paintHighlight(plugin, anchor, flash);
      await wait(PULSE_MS);
      await clearHighlight(plugin, anchor, flash);
      await paintHighlight(plugin, anchor, resting);
      // No trailing pause after the last blink: it would just delay the caller.
      if (i < PULSE_TIMES - 1) await wait(PULSE_MS);
    }
  } catch (err) {
    log('ERROR', 'pulse failed, the highlight colour may be left wrong', {
      remId: anchor.remId,
      resting,
      flash,
      ...describeError(err),
      source: 'doc.pulse',
    });
  }
}

/**
 * Position of every Rem in a document, for sorting the sidebar in reading order.
 *
 * Returns an empty map when the document cannot be read, and the caller falls
 * back to creation order. That is a cosmetic degradation and it is logged; it
 * is not the same as having no comments.
 */
export async function remOrder(plugin: RNPlugin, docId: RemId): Promise<Map<RemId, number>> {
  const order = new Map<RemId, number>();
  const doc = await plugin.rem.findOne(docId);
  if (!doc) {
    log('WARN', 'remOrder: document not found, sidebar will sort by creation time', {
      docId,
      source: 'rem.findOne',
    });
    return order;
  }
  const all = await doc.allRemInDocumentOrPortal();
  all.forEach((r, i) => order.set(r._id, i));
  log('DEBUG', 'remOrder: built', { docId, size: order.size, source: 'allRemInDocumentOrPortal' });
  return order;
}
