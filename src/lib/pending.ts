import type { RNPlugin } from '@remnote/plugin-sdk';
import { log } from './log.ts';
import type { Anchor, RemId } from './types.ts';

/**
 * A selection handed from the toolbar button to the sidebar.
 *
 * The two are separate iframes, and the RightSidebar location is given no
 * context data at all, so there is nowhere to pass an argument. Session storage
 * is the channel that works from every surface, and it is session rather than
 * synced because a half finished comment is not something to sync to a phone.
 */
const PENDING_KEY = 'margins.pending.v1';

/** How long a handoff stays valid. */
const STALE_MS = 30_000;

export interface Pending {
  docId: RemId;
  anchor?: Anchor;
  at: number;
}

export async function setPending(
  plugin: RNPlugin,
  docId: RemId,
  anchor: Anchor | undefined,
): Promise<void> {
  await plugin.storage.setSession(PENDING_KEY, { docId, anchor, at: Date.now() } satisfies Pending);
  log('DEBUG', 'pending selection stored for the sidebar', {
    docId,
    anchored: Boolean(anchor),
    remId: anchor?.remId,
    source: 'storage.setSession',
    field: PENDING_KEY,
  });
}

/**
 * Read the handoff, if there is a fresh one for this document.
 *
 * An old one is ignored rather than used: reopening the sidebar an hour later
 * should not silently reopen a composer over a selection the user has long
 * forgotten making.
 */
export async function getPending(plugin: RNPlugin, docId: RemId | undefined): Promise<Pending | undefined> {
  const stored = await plugin.storage.getSession<Pending>(PENDING_KEY);
  if (!stored || !docId) return undefined;
  if (stored.docId !== docId) return undefined;
  if (Date.now() - stored.at > STALE_MS) {
    log('DEBUG', 'ignoring a stale pending selection', {
      docId,
      ageMs: Date.now() - stored.at,
      source: 'storage.getSession',
      field: PENDING_KEY,
    });
    return undefined;
  }
  return stored;
}

export async function clearPending(plugin: RNPlugin): Promise<void> {
  await plugin.storage.setSession(PENDING_KEY, undefined);
}

export const PENDING_EVENT_KEY = PENDING_KEY;
