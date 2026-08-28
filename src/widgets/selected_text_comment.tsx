import * as React from 'react';
import { renderWidget, usePlugin, useRunAsync } from '@remnote/plugin-sdk';

import { createComment } from '../lib/actions.ts';
import { elideQuote } from '../lib/anchor.ts';
import { captureSelection, focusedDocumentId } from '../lib/doc.ts';
import { describeError, log } from '../lib/log.ts';
import type { Anchor } from '../lib/types.ts';
import { Composer } from '../ui/Composer.tsx';
import { rootClass, useDebugLogging } from '../ui/hooks.tsx';
import { Styles } from '../ui/Styles.tsx';

/**
 * The composer that appears in RemNote's own selected text menu.
 *
 * This is the primary way to make a comment, and the reason it exists next to
 * the toolbar button: this widget is rendered by RemNote BECAUSE there is a
 * selection, so it can read that selection without racing a blur. The toolbar
 * button has to work harder for the same thing.
 *
 * It saves in place instead of handing off to the sidebar. Commenting on a
 * phrase should not move the reader out of the paragraph they are reading.
 */
function SelectedTextComment(): JSX.Element {
  const plugin = usePlugin();
  useDebugLogging();
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const target = useRunAsync(async () => {
    const [anchor, docId] = await Promise.all([captureSelection(plugin), focusedDocumentId(plugin)]);
    return { anchor, docId };
  }, []);

  if (done) {
    return (
      <div className={`${rootClass()} itm-selmenu`}>
        <Styles />
        <div className="itm-hint">Comment saved.</div>
      </div>
    );
  }

  if (!target) {
    return (
      <div className={`${rootClass()} itm-selmenu`}>
        <Styles />
        <div className="itm-hint">Reading the selection…</div>
      </div>
    );
  }

  if (!target.anchor || !target.docId) {
    return (
      <div className={`${rootClass()} itm-selmenu`}>
        <Styles />
        <div className="itm-hint">
          {target.docId
            ? 'Select some text to comment on it.'
            : 'Open a document to comment on its text.'}
        </div>
      </div>
    );
  }

  const anchor: Anchor = target.anchor;
  const docId = target.docId;

  return (
    <div className={`${rootClass()} itm-selmenu`}>
      <Styles />
      <div className="itm-quote">{elideQuote(anchor.quote)}</div>
      <Composer
        submitLabel="Comment"
        placeholder="Write a comment on this text"
        busy={busy}
        onCancel={() => void plugin.widget.closePopup()}
        onSubmit={(body) => {
          setBusy(true);
          void (async () => {
            try {
              await createComment(plugin, docId, body, anchor);
              setDone(true);
            } catch (err) {
              const described = describeError(err);
              log('ERROR', 'could not save a comment from the selection menu', {
                docId,
                remId: anchor.remId,
                ...described,
                source: 'selected_text_comment',
              });
              await plugin.app.toast(`Could not save that comment: ${described.message}`);
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    </div>
  );
}

renderWidget(SelectedTextComment);
