import type { Anchor, Comment, RemId } from './types.ts';

/**
 * Pure operations on a document's comment list.
 *
 * Kept free of the plugin object on purpose: this is the part where an off by
 * one loses somebody's note, and it is only cheap to test if it never has to
 * reach RemNote. `storage.ts` is the thin layer that reads a list, calls one of
 * these, and writes it back.
 */

/** Build a new comment. `now` and `id` are injected so tests are not timing dependent. */
export function makeComment(args: {
  id: string;
  docId: RemId;
  body: string;
  anchor?: Anchor;
  now: number;
}): Comment {
  return {
    id: args.id,
    docId: args.docId,
    body: args.body,
    anchor: args.anchor,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

export function addComment(list: Comment[], comment: Comment): Comment[] {
  return [...list, comment];
}

/**
 * Replace a comment's body.
 *
 * Returns the list unchanged when the id is unknown, so a stale sidebar acting
 * on a comment somebody else already deleted cannot resurrect it as a new one.
 */
export function editComment(list: Comment[], id: string, body: string, now: number): Comment[] {
  return list.map((c) => (c.id === id ? { ...c, body, updatedAt: now } : c));
}

export function removeComment(list: Comment[], id: string): Comment[] {
  return list.filter((c) => c.id !== id);
}

export function findComment(list: Comment[], id: string): Comment | undefined {
  return list.find((c) => c.id === id);
}

/** Update one comment's cached offsets after a re-anchor found the quote elsewhere. */
export function reanchor(list: Comment[], id: string, start: number, end: number): Comment[] {
  return list.map((c) =>
    c.id === id && c.anchor ? { ...c, anchor: { ...c.anchor, start, end } } : c,
  );
}

/**
 * True when no other comment still needs the highlight on this stretch of text.
 *
 * Deleting a comment clears the highlight it painted, but two comments can
 * overlap the same words, and clearing on the first delete would strip the
 * highlight out from under the second one. Overlap is tested rather than exact
 * equality, because "the same stretch" is a matter of degree once the text has
 * been edited underneath both of them.
 */
export function highlightStillNeeded(list: Comment[], deletedId: string, anchor: Anchor): boolean {
  return list.some(
    (c) =>
      c.id !== deletedId &&
      c.anchor?.remId === anchor.remId &&
      c.anchor.start < anchor.end &&
      anchor.start < c.anchor.end,
  );
}

/** Comments belonging to a given Rem, in document order. */
export function commentsOnRem(list: Comment[], remId: RemId): Comment[] {
  return list.filter((c) => c.anchor?.remId === remId).sort((a, b) => a.anchor!.start - b.anchor!.start);
}

/**
 * What a comment being written will attach to.
 *
 * Extracted from the panel and made pure because getting the ORDER wrong is not
 * a visible mistake: it produced a composer whose heading silently kept showing
 * the first phrase you selected, no matter what you selected afterwards, and the
 * only cure was closing and reopening the sidebar.
 *
 * `choice` is what the user has explicitly decided: 'document' to comment on the
 * page as a whole, an Anchor when the toolbar button handed one over, or
 * undefined when they have not said.
 *
 * `live` is whatever is selected at this instant.
 */
export function chooseTarget(
  choice: Anchor | 'document' | undefined,
  live: Anchor | undefined,
): Anchor | undefined {
  // An explicit "on the document" sticks. It is the one decision the live
  // selection must not silently override, or the button does nothing.
  if (choice === 'document') return undefined;

  // Live wins over a handed-over anchor so the heading follows the selection.
  // Safe because the caller remembers the last real selection rather than
  // dropping to undefined when focus moves into the composer.
  return live ?? choice;
}
