import * as React from 'react';
import { AppEvents, useAPIEventListener, usePlugin, useTrackerPlugin } from '@remnote/plugin-sdk';

import { resolveAnchor, sortComments } from '../lib/anchor.ts';
import { captureSelection, documentIdForPane, focusedDocumentId, remOrder } from '../lib/doc.ts';
import { describeError, log } from '../lib/log.ts';
import { setDebugLogging } from '../lib/log.ts';
import { DEFAULTS, readSettings, type Settings } from '../lib/settings.ts';
import { COMMENTS_CHANGED_EVENT_KEY, docKey, readComments } from '../lib/storage.ts';
import type { Anchor, AnchorStatus, Comment, RemId } from '../lib/types.ts';
import { isSandboxed } from './Styles.tsx';

/**
 * The class every widget root carries.
 *
 * One fact, not two. Whether we are inside an iframe matters, because
 * `height: 100vh` means the widget when framed and the whole browser viewport
 * when mounted natively into RemNote's page.
 *
 * The theme is deliberately NOT here. RemNote's own `--rn-clr-*` tokens resolve
 * inside the widget and already carry the active theme's values, so the palette
 * binds to them and nothing has to detect anything. What used to be here - a
 * JavaScript detector, a color-scheme bridge, a session storage channel and a
 * user setting - were four mechanisms answering a question the tokens answer
 * for free, and all four could be wrong at once. They were.
 */
export function rootClass(): string {
  return isSandboxed() ? 'itm-root itm-framed' : 'itm-root';
}

/** The current settings, re-read whenever the user changes one. */
export function useSettings(): Settings {
  const settings = useTrackerPlugin(async (plugin) => await readSettings(plugin), []);
  return settings ?? DEFAULTS;
}

/**
 * Apply the debug console setting to THIS widget.
 *
 * Must be called from every widget, and that is not busywork. The flag lives in
 * a module variable, and every widget runs in its own iframe with its own copy
 * of every module, so the index plugin setting it has no effect anywhere else.
 * The setting appeared to work, because the index plugin's own lines obeyed it,
 * while the widgets - where nearly all the interesting logging happens - ignored
 * it completely. The symptom is asking a user to turn on logging and getting
 * silence back.
 */
export function useDebugLogging(): void {
  const { debug } = useSettings();
  React.useEffect(() => setDebugLogging(debug), [debug]);
}

/** A counter to force a re-read, and the function that bumps it. */
function useRefresh(): [number, () => void] {
  const [n, setN] = React.useState(0);
  return [n, React.useCallback(() => setN((x) => x + 1), [])];
}

/**
 * Re-run something whenever the user navigates.
 *
 * `useTrackerPlugin` re-runs when the DATA it touched changes, and which
 * document is open is not data in that sense: `getFocusedPaneId` and
 * `getOpenPaneRemId` are questions about the UI. So a tracker over them runs
 * exactly once and then never again, and the panel keeps showing the comments
 * of whichever document happened to be open when it mounted. That is what made
 * the sidebar say "sub doc 2 - 3 comments" while sub doc 1 was on screen.
 *
 * All four events are subscribed because they cover different ways of arriving
 * at a new document, and none of them alone covers the lot: following a link,
 * the back button, clicking another pane, and changing the pane layout. A slow
 * poll sits underneath as a safety net, since being wrong here is not a cosmetic
 * problem - it shows one document's comments over another document's text.
 */
function useNavigationTick(): number {
  const [tick, bump] = useRefresh();
  useAPIEventListener(AppEvents.URLChange, undefined, bump);
  useAPIEventListener(AppEvents.GlobalOpenRem, undefined, bump);
  useAPIEventListener(AppEvents.FocusedPaneChange, undefined, bump);
  useAPIEventListener(AppEvents.CurrentWindowTreeChange, undefined, bump);

  React.useEffect(() => {
    const timer = setInterval(bump, 2000);
    return () => clearInterval(timer);
  }, [bump]);

  return tick;
}

/** The document open in whichever pane has focus, kept current as you navigate. */
export function useFocusedDocId(): RemId | undefined {
  const tick = useNavigationTick();
  return useTrackerPlugin(async (plugin) => await focusedDocumentId(plugin), [tick]);
}

/**
 * The document open in a specific pane, kept current as you navigate.
 *
 * The pane id does not change when you open a different document in it, so a
 * one-shot read of this is stale from the first navigation onwards. That is what
 * left the toolbar badge showing another document's comment count.
 */
export function useDocIdForPane(paneId: string | undefined): RemId | undefined {
  const tick = useNavigationTick();
  return useTrackerPlugin(
    async (plugin) => (paneId ? await documentIdForPane(plugin, paneId) : undefined),
    [paneId, tick],
  );
}

export type CommentsState =
  | { status: 'loading' }
  | { status: 'no-document' }
  | { status: 'ok'; comments: Comment[] }
  | { status: 'error'; message: string };

/**
 * A document's comments, in reading order, kept live.
 *
 * `useSyncedStorageState` looks like the obvious fit and is the wrong tool: a
 * write made in a different widget's iframe does not reliably reach it, so the
 * sidebar sits on a stale list with nothing on screen to say so. A tracker
 * re-run driven by an explicit event is the reliable version of the same thing.
 */
export function useComments(docId: RemId | undefined): CommentsState {
  const [refresh, bump] = useRefresh();

  useAPIEventListener(AppEvents.StorageSessionChange, COMMENTS_CHANGED_EVENT_KEY, bump);
  useAPIEventListener(AppEvents.StorageSyncedChange, docId ? docKey(docId) : undefined, bump);

  const state = useTrackerPlugin<CommentsState>(
    async (plugin) => {
      if (!docId) return { status: 'no-document' };
      try {
        const [comments, order] = await Promise.all([
          readComments(plugin, docId),
          remOrder(plugin, docId),
        ]);
        return { status: 'ok', comments: sortComments(comments, order) };
      } catch (err) {
        const described = describeError(err);
        log('ERROR', 'could not read comments for this document', {
          docId,
          ...described,
          source: 'useComments',
        });
        return { status: 'error', message: described.message };
      }
    },
    [docId, refresh],
  );

  return state ?? { status: 'loading' };
}

/** Just the count, for the toolbar badge. */
export function useCommentCount(docId: RemId | undefined): number | undefined {
  const [refresh, bump] = useRefresh();
  useAPIEventListener(AppEvents.StorageSessionChange, COMMENTS_CHANGED_EVENT_KEY, bump);
  useAPIEventListener(AppEvents.StorageSyncedChange, docId ? docKey(docId) : undefined, bump);

  return useTrackerPlugin(
    async (plugin) => {
      if (!docId) return 0;
      try {
        return (await readComments(plugin, docId)).length;
      } catch (err) {
        // The badge is decoration. A failure is logged and shown as "no badge",
        // never as a number that might be wrong.
        log('WARN', 'comment count unavailable', {
          docId,
          ...describeError(err),
          source: 'useCommentCount',
        });
        return undefined;
      }
    },
    [docId, refresh],
  );
}

/**
 * How well each comment's anchor still matches the document.
 *
 * Checked for the whole list in one pass rather than per card, because every
 * check reads the Rem's text and doing that per card would re-read the same
 * line once for every comment on it.
 *
 * A comment whose anchor cannot be checked is reported as undefined, not as
 * 'lost'. "We could not tell" and "the text is gone" look identical in a card
 * that greys itself out, and only one of them is worth alarming somebody about.
 */
export function useAnchorHealth(comments: Comment[]): Map<string, AnchorStatus> {
  const signature = comments
    .map((c) => (c.anchor ? `${c.id}:${c.anchor.remId}:${c.anchor.start}:${c.anchor.end}` : c.id))
    .join('|');

  const health = useTrackerPlugin<Map<string, AnchorStatus>>(
    async (plugin) => {
      const byRem = new Map<RemId, string>();
      const out = new Map<string, AnchorStatus>();

      for (const c of comments) {
        if (!c.anchor) continue;
        try {
          let full = byRem.get(c.anchor.remId);
          if (full === undefined) {
            const rem = await plugin.rem.findOne(c.anchor.remId);
            if (!rem) {
              out.set(c.id, 'lost');
              continue;
            }
            full = rem.text ? await plugin.richText.toString(rem.text) : '';
            byRem.set(c.anchor.remId, full);
          }
          out.set(c.id, resolveAnchor(c.anchor, full).status);
        } catch (err) {
          log('WARN', 'could not check a comment anchor', {
            commentId: c.id,
            remId: c.anchor.remId,
            ...describeError(err),
            source: 'useAnchorHealth',
          });
        }
      }
      return out;
    },
    [signature],
  );

  return health ?? new Map();
}

/**
 * The last real text selection, remembered.
 *
 * `plugin.editor.getSelection()` is an async round trip to the host, and by the
 * time it answers, clicking a button inside a widget iframe has already moved
 * focus off the editor and RemNote has dropped its selection. Reading it in a
 * pointerdown handler and hoping to win that race does NOT work: the user
 * selected a word, pressed the toolbar button, and got a document level
 * composer, because the selection was gone before the answer came back.
 *
 * So it is not read on demand at all. It is sampled while the user is still in
 * the document, and the most recent one is kept.
 *
 * `maxAgeMs` stops a selection from an hour ago being attached to a comment the
 * user believes is about the document. It was 10s, which turned out to be far
 * too aggressive: select a phrase, read it back, think, then click, and the
 * selection had already been discarded, so the comment silently became a
 * document level one. The armed dot on the button is what actually tells the
 * user which of the two will happen, so the window can afford to be generous.
 */
export function useLastTextSelection(maxAgeMs = 45_000, pollMs = 400) {
  const plugin = usePlugin();
  const latest = React.useRef<{ anchor: Anchor; at: number } | undefined>(undefined);
  const [, force] = React.useState(0);

  React.useEffect(() => {
    let stopped = false;

    const sample = async () => {
      try {
        const anchor = await captureSelection(plugin);
        if (stopped || !anchor) return;
        const had = latest.current?.anchor;
        latest.current = { anchor, at: Date.now() };
        // Only re-render when the selection actually changed, so a 400ms poll
        // does not repaint the header two and a half times a second.
        if (
          !had ||
          had.remId !== anchor.remId ||
          had.start !== anchor.start ||
          had.end !== anchor.end
        ) {
          force((n) => n + 1);
        }
      } catch (err) {
        log('DEBUG', 'selection poll failed', {
          ...describeError(err),
          source: 'useLastTextSelection',
        });
      }
    };

    void sample();
    const timer = setInterval(() => void sample(), pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [plugin, pollMs]);

  /** The remembered selection, if it is still fresh enough to mean anything. */
  const read = React.useCallback((): Anchor | undefined => {
    const held = latest.current;
    if (!held) return undefined;
    if (Date.now() - held.at > maxAgeMs) {
      log('DEBUG', 'ignoring a stale selection', {
        ageMs: Date.now() - held.at,
        maxAgeMs,
        source: 'useLastTextSelection',
      });
      return undefined;
    }
    return held.anchor;
  }, [maxAgeMs]);

  /** Forget it, once it has been turned into a comment. */
  const clear = React.useCallback(() => {
    latest.current = undefined;
    force((n) => n + 1);
  }, []);

  return { read, clear, current: latest.current?.anchor };
}
