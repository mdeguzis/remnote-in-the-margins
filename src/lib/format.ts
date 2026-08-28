/**
 * When a comment was written, in the shortest form that is still unambiguous.
 *
 * Relative for the first week, because "3h ago" is what you want while a
 * conversation is live, then absolute, because "43 days ago" is not something
 * anybody can turn into a date in their head.
 *
 * `now` is a parameter rather than a call to Date.now inside, so the tests are
 * not timing dependent.
 */
export function formatWhen(at: number, now: number): string {
  const seconds = Math.round((now - at) / 1000);

  if (seconds < 0) return 'just now'; // clock skew between synced devices
  if (seconds < 45) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const month = d.toLocaleString(undefined, { month: 'short' });
  return sameYear ? `${month} ${d.getDate()}` : `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "3 comments", "1 comment", "No comments". */
export function countLabel(n: number): string {
  if (n === 0) return 'No comments';
  return n === 1 ? '1 comment' : `${n} comments`;
}
