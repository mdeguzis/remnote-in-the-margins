import type { RNPlugin } from '@remnote/plugin-sdk';
import { addComment, editComment, highlightStillNeeded, makeComment, removeComment } from './comments.ts';
import { clearHighlight, paintHighlight } from './doc.ts';
import { describeError, log } from './log.ts';
import { readSettings } from './settings.ts';
import { announceChange, readComments, writeComments } from './storage.ts';
import type { Anchor, Comment, RemId } from './types.ts';

/**
 * The three things a user can do to a comment, each as one call that leaves
 * storage, the highlight in the document and every open widget in agreement.
 *
 * Splitting these across the widgets is how the highlight ends up out of step
 * with the list, so nothing else writes to storage directly.
 */

/** Unique enough for a per document list, and readable in a log line. */
function newId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function createComment(
  plugin: RNPlugin,
  docId: RemId,
  body: string,
  anchor?: Anchor,
): Promise<Comment> {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error('A comment needs some text.');
  }

  const comment = makeComment({ id: newId(), docId, body: trimmed, anchor, now: Date.now() });
  const list = await readComments(plugin, docId);
  await writeComments(plugin, docId, addComment(list, comment));

  const settings = await readSettings(plugin);
  if (anchor && settings.paintHighlight) {
    // Best effort: the comment is already saved, and failing to paint the
    // highlight must not lose it. It IS reported, because a comment with no
    // visible mark on the text looks like nothing happened.
    try {
      await paintHighlight(plugin, anchor, settings.highlightColor);
    } catch (err) {
      log('ERROR', 'comment saved but the highlight could not be painted', {
        commentId: comment.id,
        remId: anchor.remId,
        ...describeError(err),
        source: 'actions.createComment',
      });
      await plugin.app.toast('Comment saved, but the text could not be highlighted.');
    }
  }

  await announceChange(plugin);
  log('INFO', 'comment created', {
    commentId: comment.id,
    docId,
    anchored: Boolean(anchor),
    remId: anchor?.remId,
    bodyLength: trimmed.length,
    source: 'actions.createComment',
  });
  return comment;
}

export async function updateComment(
  plugin: RNPlugin,
  docId: RemId,
  id: string,
  body: string,
): Promise<void> {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error('A comment needs some text.');
  }

  const list = await readComments(plugin, docId);
  const next = editComment(list, id, trimmed, Date.now());
  if (next === list || !next.some((c) => c.id === id)) {
    log('WARN', 'edit ignored, no comment with that id', { commentId: id, docId, source: 'actions.updateComment' });
    return;
  }

  await writeComments(plugin, docId, next);
  await announceChange(plugin);
  log('INFO', 'comment edited', { commentId: id, docId, bodyLength: trimmed.length, source: 'actions.updateComment' });
}

export async function deleteComment(plugin: RNPlugin, docId: RemId, id: string): Promise<void> {
  const list = await readComments(plugin, docId);
  const doomed = list.find((c) => c.id === id);
  if (!doomed) {
    log('WARN', 'delete ignored, no comment with that id', { commentId: id, docId, source: 'actions.deleteComment' });
    return;
  }

  await writeComments(plugin, docId, removeComment(list, id));

  const settings = await readSettings(plugin);
  if (doomed.anchor && settings.paintHighlight) {
    // Two comments can overlap the same words. Clearing unconditionally would
    // strip the highlight out from under whichever one is left behind.
    const stillNeeded = highlightStillNeeded(list, id, doomed.anchor);
    if (stillNeeded) {
      log('DEBUG', 'highlight kept, another comment still covers that text', {
        commentId: id,
        remId: doomed.anchor.remId,
        source: 'comments.highlightStillNeeded',
      });
    } else {
      try {
        await clearHighlight(plugin, doomed.anchor, settings.highlightColor);
      } catch (err) {
        log('ERROR', 'comment deleted but the highlight could not be cleared', {
          commentId: id,
          remId: doomed.anchor.remId,
          ...describeError(err),
          source: 'actions.deleteComment',
        });
        await plugin.app.toast('Comment deleted, but the highlight is still on the text.');
      }
    }
  }

  await announceChange(plugin);
  log('INFO', 'comment deleted', { commentId: id, docId, anchored: Boolean(doomed.anchor), source: 'actions.deleteComment' });
}
