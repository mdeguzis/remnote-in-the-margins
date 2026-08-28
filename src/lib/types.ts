/** A Rem's id, as RemNote hands it to us. */
export type RemId = string;

/**
 * Where a comment is attached in the document.
 *
 * `start` and `end` are character offsets into the plain text of ONE Rem, the
 * same string RemNote's own editor indexes when it reports a selection. They
 * are a cache, not the identity of the anchor: the moment the user edits that
 * line every offset after the edit point is wrong. `quote` is what makes the
 * anchor survive that - see `resolveAnchor`.
 */
export interface Anchor {
  remId: RemId;
  start: number;
  end: number;
  /** The commented text itself, captured when the comment was made. */
  quote: string;
}

/**
 * One comment.
 *
 * A comment with no `anchor` is a comment on the document as a whole, which is
 * what you get from the toolbar button when nothing is selected.
 */
export interface Comment {
  id: string;
  /** The document this comment is filed under. */
  docId: RemId;
  anchor?: Anchor;
  body: string;
  createdAt: number;
  updatedAt: number;
}

/** How well an anchor still matches the text it was made on. */
export type AnchorStatus =
  /** The offsets still point at the quote. Nothing has moved. */
  | 'exact'
  /** The quote is still in the line, somewhere else. Offsets updated. */
  | 'moved'
  /** The quote is gone. The comment survives; the jump does not. */
  | 'lost';

export interface AnchorResolution {
  status: AnchorStatus;
  /** Absent when `status` is 'lost'. */
  start?: number;
  end?: number;
}
