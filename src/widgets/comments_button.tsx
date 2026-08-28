import * as React from 'react';
import { renderWidget, usePlugin, useRunAsync, WidgetLocation } from '@remnote/plugin-sdk';

import { countLabel } from '../lib/format.ts';
import { log } from '../lib/log.ts';
import { setPending } from '../lib/pending.ts';
import { SIDEBAR_WIDGET } from '../lib/widgets.ts';
import { MarginsIcon } from '../ui/Icon.tsx';
import { Styles } from '../ui/Styles.tsx';
import {
  rootClass,
  useCommentCount,
  useDocIdForPane,
  useLastTextSelection,
  useSettings,
} from '../ui/hooks.tsx';

/**
 * The speech bubble in the pane header, alongside the star.
 *
 * One button, two jobs, decided by whether anything is selected: with a
 * selection it comments on that text, without one it opens the panel for a
 * comment on the whole document. That is the behaviour asked for, and it is
 * also the reason the selection has to be grabbed on POINTER DOWN.
 *
 * Clicking a button inside a widget iframe takes focus away from the editor,
 * and the selection can be gone by the time the click handler runs. Pointer
 * down fires first, so the read is started there and the click handler just
 * awaits whatever it found.
 */
function CommentsButton(): JSX.Element {
  const plugin = usePlugin();
  const settings = useSettings();
  const ctx = useRunAsync(
    async () => await plugin.widget.getWidgetContext<WidgetLocation.PaneHeader>(),
    [],
  );
  // Not useRunAsync: the pane id is stable across navigation, so a one-shot read
  // keeps reporting the document that was open when this button mounted.
  const docId = useDocIdForPane(ctx?.paneId);
  const count = useCommentCount(docId);

  // Sampled continuously rather than read on click. See useLastTextSelection:
  // by the time a click handler inside this iframe can ask the host, focus has
  // left the editor and the selection is already gone.
  const selection = useLastTextSelection();

  const onClick = async () => {
    const anchor = selection.read();

    if (!docId) {
      await plugin.app.toast('Open a document first.');
      log('WARN', 'comment button clicked with no document in the pane', {
        paneId: ctx?.paneId,
        source: 'comments_button.onClick',
      });
      return;
    }

    await setPending(plugin, docId, anchor);
    if (anchor) selection.clear();
    await plugin.window.openWidgetInRightSidebar(SIDEBAR_WIDGET);
    log('DEBUG', 'comment button opened the panel', {
      docId,
      paneId: ctx?.paneId,
      anchored: Boolean(anchor),
      remId: anchor?.remId,
      source: 'comments_button.onClick',
    });
  };

  const selected = selection.current;
  const label = selected
    ? `Comment on "${selected.quote.length > 40 ? selected.quote.slice(0, 40) + '…' : selected.quote}"`
    : count
      ? `Comments (${countLabel(count)})`
      : 'Comment on this document';

  return (
    <span className={`${rootClass()} itm-btn-slot rn-clr-content-secondary`}>
      <Styles />
      <button
        className={'itm-toolbar-btn' + (selected ? ' itm-toolbar-btn--armed' : '')}
        title={label}
        aria-label={label}
        onClick={() => void onClick()}
      >
        <MarginsIcon />
        {settings.showCount && count ? <span className="itm-count">{count}</span> : null}
      </button>
    </span>
  );
}

renderWidget(CommentsButton);
