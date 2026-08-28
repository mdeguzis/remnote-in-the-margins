/**
 * A fake RemNote host that models the editor behaviours this plugin had to
 * discover the hard way.
 *
 * These are not invented rules. Each one was observed in a real session and is
 * the direct cause of a bug that shipped:
 *
 *   1. selectRem is a NO-OP when a Rem selection is already active. It resolves
 *      successfully and the selection does not change. Since selectRem leaves a
 *      Rem selection behind, this made the jump work exactly once.
 *   2. selectRem is a NO-OP when NOTHING is selected. With no editor focused
 *      there is no context to work from, so a freshly loaded page could not
 *      jump at all.
 *   3. collapseSelection turns an EXISTING selection into a Text caret, which is
 *      what makes case 1 recoverable. With nothing selected it does nothing,
 *      which is why case 2 needs a different remedy.
 *   4. openRemInContext focuses the Rem regardless of prior state, which is the
 *      only remedy for case 2.
 *   5. Every one of these resolves successfully whether or not it did anything.
 *      That is why the code must verify by READING THE SELECTION BACK, and why
 *      a fallback gated on a rejected promise never runs.
 *
 * If RemNote's behaviour ever changes, this fake is the thing to update, and the
 * tests that fail will say exactly which assumption moved.
 */

export function makeFakeRemNote({ rems, selection = undefined, docId = 'doc1' }) {
  const state = {
    selection,
    docId,
    /** Ordered record of every host call, for asserting sequence. */
    calls: [],
    texts: new Map(Object.entries(rems)),
  };

  const record = (name, detail) => state.calls.push(detail === undefined ? name : `${name}:${detail}`);

  const remObject = (id) => ({
    _id: id,
    get text() {
      return [state.texts.get(id) ?? ''];
    },
    setText: async (rich) => {
      record('setText', id);
      state.texts.set(id, String(rich[0] ?? ''));
    },
    openRemInContext: async () => {
      record('openRemInContext', id);
      // Rule 4: focuses the Rem whatever the prior state was.
      state.selection = { type: 'Text', remId: id, range: { start: 0, end: 0 } };
    },
    allRemInDocumentOrPortal: async () => Object.keys(rems).map((k) => ({ _id: k })),
  });

  const plugin = {
    rem: {
      findOne: async (id) => (state.texts.has(id) ? remObject(id) : undefined),
    },
    richText: {
      toString: async (rich) => String(rich?.[0] ?? ''),
      applyTextFormatToRange: async (text) => text,
      removeTextFormatFromRange: async (text) => text,
    },
    editor: {
      getSelection: async () => state.selection,
      selectRem: async (ids) => {
        record('selectRem', ids[0]);
        // Rules 1 and 2: silently does nothing unless a text caret exists.
        if (state.selection?.type !== 'Text') return;
        state.selection = { type: 'Rem', remIds: [ids[0]] };
      },
      collapseSelection: async () => {
        record('collapseSelection');
        // Rule 3, and note what it does NOT do: with nothing selected there is
        // nothing to collapse, so it cannot conjure a caret. Modelling it as if
        // it could made the fake claim the fresh-page case was already fixed.
        if (!state.selection) return;
        const remId = state.selection.remId ?? state.selection.remIds?.[0];
        if (!remId) return;
        state.selection = { type: 'Text', remId, range: { start: 0, end: 0 } };
      },
      selectText: async () => record('selectText'),
    },
    window: {
      getFocusedPaneId: async () => 'pane_0',
      getOpenPaneRemId: async () => state.docId,
      openRem: async (rem) => record('openRem', rem?._id),
    },
  };

  return { plugin, state };
}

/** Is the host's selection on this Rem, by either selection shape? */
export function selectionIsOn(state, remId) {
  const s = state.selection;
  if (!s) return false;
  if (typeof s.remId === 'string') return s.remId === remId;
  return Array.isArray(s.remIds) ? s.remIds.includes(remId) : false;
}
