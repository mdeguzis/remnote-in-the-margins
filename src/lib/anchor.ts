import type { Anchor, AnchorResolution, Comment } from './types.ts';

/**
 * Work out where a comment's text lives NOW.
 *
 * Offsets alone cannot survive editing: type one character at the start of a
 * line and every anchor after it points a character short, so the sidebar would
 * jump to the wrong place while looking perfectly healthy. That silent kind of
 * wrong is worse than a visible failure, so the quote is treated as the real
 * anchor and the offsets as a hint about where to start looking.
 *
 * `fullText` must be the plain text of the anchor's Rem, produced by the same
 * thing that produced the offsets. Ask RemNote for it (`richText.toString`)
 * rather than flattening the rich text here, or the two notions of "character
 * offset" will disagree over rem references and images.
 */
export function resolveAnchor(anchor: Anchor, fullText: string): AnchorResolution {
  const { quote, start, end } = anchor;

  // An empty quote can be found anywhere, so it can never be re-anchored. It
  // should not exist - the composer refuses an empty selection - but a stored
  // one would otherwise match at index 0 and jump somewhere arbitrary.
  if (quote.length === 0) {
    return { status: 'lost' };
  }

  if (fullText.slice(start, end) === quote) {
    return { status: 'exact', start, end };
  }

  const occurrences = allIndexesOf(fullText, quote);
  if (occurrences.length === 0) {
    return { status: 'lost' };
  }

  // More than one match is the normal case for a short quote ("the", a name
  // repeated down the line). Nearest to where it used to be beats first-match:
  // an edit high up the line shifts every later anchor by the same small
  // amount, so the closest occurrence is almost always the right one, whereas
  // first-match would drag every comment on the line to its first word.
  const nearest = occurrences.reduce((best, at) =>
    Math.abs(at - start) < Math.abs(best - start) ? at : best,
  );
  return { status: 'moved', start: nearest, end: nearest + quote.length };
}

/** Every index at which `needle` occurs in `haystack`, including overlaps. */
export function allIndexesOf(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return out;
    out.push(at);
    from = at + 1;
  }
}

/**
 * Sort comments into the order they should be read in.
 *
 * Document level comments first, oldest first, because they are about the whole
 * page and there is no position to sort them by. Anchored comments then follow
 * the text: the sidebar should read top to bottom like the document does.
 *
 * `remOrder` maps a RemId to its position in the document. Anything missing
 * from it sorts to the end rather than to the top, so a comment on a Rem that
 * has moved out of view does not shove itself to the front of the list.
 */
export function sortComments(comments: Comment[], remOrder: Map<string, number>): Comment[] {
  return [...comments].sort((a, b) => {
    if (!a.anchor && !b.anchor) return a.createdAt - b.createdAt;
    if (!a.anchor) return -1;
    if (!b.anchor) return 1;

    const ai = remOrder.get(a.anchor.remId) ?? Number.MAX_SAFE_INTEGER;
    const bi = remOrder.get(b.anchor.remId) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    if (a.anchor.start !== b.anchor.start) return a.anchor.start - b.anchor.start;
    return a.createdAt - b.createdAt;
  });
}

/** Collapse whitespace so a quote reads as one line. */
export function cleanQuote(quote: string): string {
  return quote.replace(/\s+/g, ' ').trim();
}

/**
 * Shorten a quote for the sidebar without cutting a word in half.
 *
 * Truncates at the END rather than dropping the middle. The card title is read
 * as a sentence beginning, and an ellipsis in the middle of one reads as damage;
 * the full text is a hover away, so nothing is lost by ending it cleanly.
 *
 * The cut lands on a word boundary when there is one reasonably close, because
 * "What about thi…" is worse than "What about…" at conveying the same thing.
 */
export function elideQuote(quote: string, max = 120): string {
  const clean = cleanQuote(quote);
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Only honour a word boundary in the last quarter, or a long word would
  // shorten the title dramatically.
  const body = lastSpace > max * 0.75 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}
