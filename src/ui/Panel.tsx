import * as React from 'react';
import { AppEvents, useAPIEventListener, usePlugin, useTrackerPlugin } from '@remnote/plugin-sdk';

import { cleanQuote, elideQuote } from '../lib/anchor.ts';
import { createComment, deleteComment, updateComment } from '../lib/actions.ts';
import { chooseTarget } from '../lib/comments.ts';
import { jumpToComment } from '../lib/doc.ts';
import { countLabel } from '../lib/format.ts';
import { describeError, log } from '../lib/log.ts';
import { clearPending, getPending, PENDING_EVENT_KEY, type Pending } from '../lib/pending.ts';
import type { Anchor } from '../lib/types.ts';
import { CommentCard } from './CommentCard.tsx';
import { DiagnosticsPanel } from './Diagnostics.tsx';
import { Composer } from './Composer.tsx';
import {
  rootClass,
  useAnchorHealth,
  useComments,
  useFocusedDocId,
  useLastTextSelection,
  useSettings,
} from './hooks.tsx';

/**
 * The sidebar panel: everything the user does with existing comments.
 *
 * It follows whichever document has focus rather than pinning to the one it was
 * opened from. Pinning reads as a bug the first time you switch documents and
 * the panel keeps showing the last one's comments.
 */
export function Panel(): JSX.Element {
  const plugin = usePlugin();
  const settings = useSettings();
  const docId = useFocusedDocId();
  const state = useComments(docId);
  const comments = state.status === 'ok' ? state.comments : [];
  const health = useAnchorHealth(comments);

  // Three separate facts, because collapsing them into one value is what made
  // the composer stop following the selection.
  //
  //   open          is the composer showing at all
  //   handedOver    an anchor the toolbar button passed in, if any
  //   forcedDocument  the user CLICKED "comment on the document instead"
  //
  // Previously "opened with nothing selected" was stored as the same value as
  // "user chose the document", and chooseTarget treats that choice as sticky, so
  // selecting text afterwards could never change the heading. Opening a composer
  // is not a decision about what to attach to; only the link is.
  const [open, setOpen] = React.useState(false);
  const [handedOver, setHandedOver] = React.useState<Anchor | undefined>(undefined);
  const [forcedDocument, setForcedDocument] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const closeComposer = React.useCallback(() => {
    setOpen(false);
    setHandedOver(undefined);
    setForcedDocument(false);
  }, []);

  // The panel watches the selection itself, so the composer can say what it is
  // about to comment on WHILE the user is still choosing it. Without this the
  // panel is a black box: you select a phrase, open the composer, and have no
  // way of knowing whether it caught the selection until after you have written
  // the comment and saved it.
  const live = useLastTextSelection(45_000, open ? 250 : 1200);

  const effective = chooseTarget(forcedDocument ? 'document' : handedOver, live.current);

  const docName = useTrackerPlugin(
    async (p) => {
      if (!docId) return undefined;
      const rem = await p.rem.findOne(docId);
      return rem?.text ? await p.richText.toString(rem.text) : undefined;
    },
    [docId],
  );

  // A selection handed over by the toolbar button opens the composer on arrival.
  const [pendingTick, setPendingTick] = React.useState(0);
  useAPIEventListener(AppEvents.StorageSessionChange, PENDING_EVENT_KEY, () =>
    setPendingTick((n) => n + 1),
  );
  const pending = useTrackerPlugin<Pending | undefined>(
    async (p) => await getPending(p, docId),
    [docId, pendingTick],
  );
  React.useEffect(() => {
    if (!pending) return;
    setOpen(true);
    setHandedOver(pending.anchor);
    setForcedDocument(false);
    void clearPending(plugin);
  }, [pending, plugin]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const described = describeError(err);
      log('ERROR', `${what} failed`, { docId, ...described, source: 'Panel' });
      await plugin.app.toast(`Could not ${what}: ${described.message}`);
    } finally {
      setBusy(false);
    }
  };

  const jump = (id: string) =>
    void run('go to that text', async () => {
      const comment = comments.find((c) => c.id === id);
      if (!comment) return;
      const outcome = await jumpToComment(plugin, comment, settings);
      if (outcome === 'lost') {
        await plugin.app.toast('That text has been edited away, so there is nowhere to jump to.');
      } else if (outcome === 'missing-rem') {
        await plugin.app.toast('The line this comment was made on no longer exists.');
      }
    });

  return (
    <div className={`${rootClass()} itm-panel rn-clr-background-primary`}>
      <div className="itm-head">
        <div className="itm-title">Comments</div>
        <div className="itm-sub">
          {/* The document name is the thing that tells you these comments belong
              to what is on screen, so it reads as a heading in its own right
              rather than as grey small print after the word "Comments". */}
          <span className="itm-doc" title={docName}>
            {docName ? docName : docId ? 'this document' : 'no document open'}
          </span>
          {state.status === 'ok' ? <span className="itm-count-label">{countLabel(comments.length)}</span> : null}
        </div>
      </div>

      {!open ? (
        <div className="itm-actions">
          <button
            className="itm-action itm-action--wide"
            disabled={!docId || busy}
            onClick={() => {
              setOpen(true);
              setHandedOver(undefined);
              setForcedDocument(false);
            }}
          >
            Comment on this document
          </button>
        </div>
      ) : (
        <div>
          <div
            className={'itm-quote' + (effective ? '' : ' itm-quote--doc')}
            title={effective ? cleanQuote(effective.quote) : undefined}
          >
            {effective ? elideQuote(effective.quote) : 'On this document'}
          </div>
          <div className="itm-target">
            {effective ? (
              <>
                <span className="itm-target-live">commenting on the selected text</span>
                <button className="itm-link" onClick={() => setForcedDocument(true)}>
                  Comment on the document instead
                </button>
              </>
            ) : (
              <span className="itm-target-live">
                {forcedDocument
                  ? 'commenting on the whole document'
                  : 'select some text to comment on it, or write below for a comment on the document'}
              </span>
            )}
          </div>
          <Composer
            submitLabel="Comment"
            placeholder="Write a comment"
            busy={busy}
            onCancel={closeComposer}
            onSubmit={(body) => {
              const anchor = effective;
              closeComposer();
              if (anchor) live.clear();
              void run('save that comment', async () => {
                if (!docId) throw new Error('No document is open.');
                await createComment(plugin, docId, body, anchor);
              });
            }}
          />
        </div>
      )}

      <div className="itm-list">
        {state.status === 'loading' ? <div className="itm-empty">Loading…</div> : null}

        {state.status === 'no-document' ? (
          <div className="itm-empty">Open a document to see its comments.</div>
        ) : null}

        {state.status === 'error' ? (
          <div className="itm-error">
            Could not read the comments for this document. Nothing has been deleted; the panel just
            cannot show them. {state.message}
          </div>
        ) : null}

        {state.status === 'ok' && comments.length === 0 ? (
          <div className="itm-empty">
            No comments yet. Select some text in the document and pick <code>Comment</code>, or use
            the button above to comment on the document as a whole.
          </div>
        ) : null}

        {comments.map((c) => (
          <CommentCard
            key={c.id}
            comment={c}
            status={health.get(c.id)}
            busy={busy}
            onJump={() => jump(c.id)}
            onEdit={(body) =>
              void run('save that edit', async () => {
                if (!docId) return;
                await updateComment(plugin, docId, c.id, body);
              })
            }
            onDelete={() =>
              void run('delete that comment', async () => {
                if (!docId) return;
                await deleteComment(plugin, docId, c.id);
              })
            }
          />
        ))}

        {settings.verbose ? <DiagnosticsPanel /> : null}

        <div className="itm-tail" />
      </div>
    </div>
  );
}
