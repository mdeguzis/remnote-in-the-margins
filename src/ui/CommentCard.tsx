import * as React from 'react';

import { cleanQuote, elideQuote } from '../lib/anchor.ts';
import { formatWhen } from '../lib/format.ts';
import type { AnchorStatus, Comment } from '../lib/types.ts';
import { Composer } from './Composer.tsx';

/**
 * One comment in the sidebar.
 *
 * The whole card is the jump target rather than a small "go to" link, because
 * jumping is what you do with a comment nearly every time you touch one, and a
 * link would make the common case the fiddly one. The buttons stop propagation
 * so editing does not also navigate the document out from under the editor.
 */
export function CommentCard({
  comment,
  status,
  busy,
  onJump,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  /** How well the anchor still matches the document. Undefined while it is being checked. */
  status: AnchorStatus | undefined;
  busy: boolean;
  onJump: () => void;
  onEdit: (body: string) => void;
  onDelete: () => void;
}): JSX.Element {
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // A "sure?" that stays armed forever is a trap for the next click. Disarm it.
  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const lost = status === 'lost';
  const anchored = Boolean(comment.anchor);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={
        'itm-card' + (editing ? ' itm-card--editing' : '') + (lost ? ' itm-card--lost' : '')
      }
      onClick={editing ? undefined : onJump}
      title={editing ? undefined : lost ? 'The commented text is gone' : 'Go to this text'}
    >
      {/*
        The commented words are the TITLE of the card, not a footnote to it.
        When a jump fails, or before you have clicked anything, this line is the
        only thing that says where in the document the comment belongs, so it
        has to be the first thing read and it has to be quotable at a glance.
        100 characters: enough to place a sentence, short enough to stay a title.
      */}
      {anchored ? (
        <div
          className={'itm-quote' + (lost ? ' itm-quote--lost' : '')}
          title={cleanQuote(comment.anchor!.quote)}
        >
          {elideQuote(comment.anchor!.quote, 120)}
        </div>
      ) : (
        <div className="itm-quote itm-quote--doc">On this document</div>
      )}

      {editing ? (
        <div onClick={stop}>
          <Composer
            initial={comment.body}
            submitLabel="Save"
            placeholder="Edit this comment"
            busy={busy}
            onSubmit={(body) => {
              setEditing(false);
              onEdit(body);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="itm-body">{comment.body}</div>
          <div className="itm-meta">
            <span>
              {formatWhen(comment.updatedAt, Date.now())}
              {comment.updatedAt !== comment.createdAt ? ' (edited)' : ''}
            </span>
            {status === 'moved' ? <span title="The text moved; this comment followed it">moved</span> : null}
            {lost ? <span title="This text is no longer in the document">text gone</span> : null}
            <span className="itm-meta-spacer" />
            <button
              className="itm-link"
              onClick={(e) => {
                stop(e);
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button
              className="itm-link itm-link--danger"
              onClick={(e) => {
                stop(e);
                if (confirming) onDelete();
                else setConfirming(true);
              }}
            >
              {confirming ? 'Sure?' : 'Delete'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
