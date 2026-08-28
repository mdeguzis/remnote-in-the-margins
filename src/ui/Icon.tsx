import * as React from 'react';

/**
 * The toolbar icon: a comment bubble.
 *
 * Deliberately NOT the ruled-paper logo. The logo identifies the plugin in the
 * marketplace, where it has room and needs to be distinctive. This sits in a row
 * with RemNote's own emoji, star and options icons, and there the job is the
 * opposite: say "comment" instantly, at 20px, in the same visual language as its
 * neighbours. A notepad at that size reads as a generic document.
 *
 * Matched to RemNote's own header icons, which are 20px, single colour and drawn
 * with currentColor so they inherit the toolbar's content colour.
 */
export function MarginsIcon({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 14.2a2.3 2.3 0 0 1-2.3 2.3H8.6L4.2 19.8V5.5a2.3 2.3 0 0 1 2.3-2.3h11.7a2.3 2.3 0 0 1 2.3 2.3z" />
      <path d="M8.5 8.2h8" />
      <path d="M8.5 11.6h5" />
    </svg>
  );
}
