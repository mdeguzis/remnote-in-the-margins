# Changelog

## 0.2.0

First working version. 0.1.0 was never released; it is the version the project
was built under before anything ran in RemNote.

Comments anchored to a text selection, in a right sidebar panel.

- Select text and comment on it. The commented words keep a RemNote highlight,
  so it is visible in the document that a comment exists.
- Comment on a document as a whole when nothing is selected.
- The composer heading follows the selection live, so you can see what a comment
  will attach to before writing it.
- Click a comment to jump to its text. The line is selected, and the exact
  characters are selected too when the host reports focus on the right line.
- Edit and delete. Deleting takes the highlight back off, unless another comment
  still covers those words.
- Comments follow their text through edits: the quote is re-found when the
  cached offsets go stale, and a comment whose text is gone says so rather than
  disappearing.
- The panel follows the document you are on, and the toolbar count with it.
- Entry points: the toolbar button next to the star, the selected text menu
  (under the toolbar's Search and Plugins button), Ctrl+Shift+M, and the
  document menu.

Known gaps: hover over commented text does not show the comment, and clicking a
comment cannot toggle the sidebar shut, because the SDK has no counterpart to
`openWidgetInRightSidebar`.
