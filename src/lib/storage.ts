import type { RNPlugin } from '@remnote/plugin-sdk';
import type { Comment, RemId } from './types.ts';
import { log } from './log.ts';

/**
 * Comments live in SYNCED storage, one key per document plus an index.
 *
 * One key per document rather than a single blob keyed by document: the blob is
 * simpler, but every edit rewrites the whole thing, so two devices editing
 * comments on two different documents would collide over one value. Per
 * document keys confine a conflict to the document actually being edited.
 *
 * The price is that RemNote's storage has no way to list keys, so the set of
 * documents that have comments has to be tracked by hand in `INDEX_KEY`.
 */
const KEY_PREFIX = 'margins.doc.v1.';
const INDEX_KEY = 'margins.index.v1';

/*
 * A SESSION key, deliberately not one of the synced keys above: it carries a
 * timestamp, not data, and every widget listens to it to know a re-read is due.
 */
export const COMMENTS_CHANGED_EVENT_KEY = "margins.changed.v1";

export function docKey(docId: RemId): string {
  return `${KEY_PREFIX}${docId}`;
}

/**
 * Turn whatever synced storage hands back into a list.
 *
 * RemNote does NOT return `undefined` for a key it has never seen: it returns an
 * empty OBJECT. Treating that as corrupt made the panel refuse to open on every
 * document that had no comments yet, which is every document to begin with.
 *
 * PREVIOUSLY BELIEVED: an unset key reads back as `undefined`. It does not.
 *
 * An array-like object is also accepted, because a value that has been through
 * a JSON round trip somewhere in the sync layer can come back with "0", "1",
 * "2" for keys instead of as a real array. Anything else genuinely is corrupt
 * and throws, because silently returning an empty list there would tell somebody
 * their comments are gone when they are only unreadable.
 */
export function normalizeStoredList<T>(stored: unknown, what: string): T[] {
  if (stored === undefined || stored === null) return [];
  if (Array.isArray(stored)) return stored as T[];

  if (typeof stored === 'object') {
    const keys = Object.keys(stored as object);

    // The unset key case. Not a failure, and by far the most common path.
    if (keys.length === 0) return [];

    // Integer keys in ascending order: an array that lost its type in transit.
    if (keys.every((key, i) => key === String(i))) {
      log('WARN', 'stored value came back array-like rather than as an array', {
        what,
        length: keys.length,
        source: 'storage.getSynced',
      });
      return Object.values(stored as Record<string, T>);
    }
  }

  log('ERROR', 'stored value is not a list and cannot be repaired', {
    what,
    actualType: Array.isArray(stored) ? 'array' : typeof stored,
    keys: typeof stored === 'object' ? Object.keys(stored as object).slice(0, 8) : undefined,
    source: 'storage.getSynced',
  });
  throw new Error(`${what} is corrupt: expected a list, found ${typeof stored}.`);
}

/**
 * Read one document's comments.
 *
 * A document that has never been commented on reads back as empty, which is a
 * real answer and not a failure. A storage error is NOT swallowed into that same
 * empty list: it propagates, so the sidebar can say the read failed instead of
 * quietly showing nothing and letting the user believe their comments are gone.
 */
export async function readComments(plugin: RNPlugin, docId: RemId): Promise<Comment[]> {
  const stored = await plugin.storage.getSynced(docKey(docId));
  return normalizeStoredList<Comment>(stored, `Comments for ${docId}`);
}

/** Write one document's comments and keep the index in step. */
export async function writeComments(
  plugin: RNPlugin,
  docId: RemId,
  comments: Comment[],
): Promise<void> {
  await plugin.storage.setSynced(docKey(docId), comments);
  await updateIndex(plugin, docId, comments.length > 0);
  log('DEBUG', 'wrote comments', {
    docId,
    count: comments.length,
    source: 'storage.setSynced',
    field: docKey(docId),
  });
}

/** Every document that currently has at least one comment. */
export async function readIndex(plugin: RNPlugin): Promise<RemId[]> {
  const stored = await plugin.storage.getSynced(INDEX_KEY);
  try {
    return normalizeStoredList<RemId>(stored, 'The comment index');
  } catch {
    // Unlike a comment list, a corrupt index is recoverable in place: it can be
    // rebuilt from the per document keys, and losing it costs the "how many
    // documents" count rather than anybody's comments. Already logged above.
    return [];
  }
}

async function updateIndex(plugin: RNPlugin, docId: RemId, present: boolean): Promise<void> {
  const index = await readIndex(plugin);
  const has = index.includes(docId);
  if (present === has) return;
  const next = present ? [...index, docId] : index.filter((id) => id !== docId);
  await plugin.storage.setSynced(INDEX_KEY, next);
  log('DEBUG', 'comment index updated', {
    docId,
    present,
    size: next.length,
    source: 'storage.setSynced',
    field: INDEX_KEY,
  });
}

/**
 * Nudge every open widget to re-read.
 *
 * Widgets live in separate iframes and `useSyncedStorageState` does not
 * reliably see a write made in another one, so the sidebar can sit on stale
 * comments with nothing to show that it has. Bumping a session key that every
 * widget listens to is the signal that a re-read is due.
 */
export async function announceChange(plugin: RNPlugin): Promise<void> {
  await plugin.storage.setSession(COMMENTS_CHANGED_EVENT_KEY, Date.now());
}
