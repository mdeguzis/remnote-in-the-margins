import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countLabel, formatWhen } from '../src/lib/format.ts';

const NOW = new Date(2026, 7, 26, 12, 0, 0).getTime();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('recent times are relative', () => {
  assert.equal(formatWhen(NOW - 10 * 1000, NOW), 'just now');
  assert.equal(formatWhen(NOW - 5 * MIN, NOW), '5m ago');
  assert.equal(formatWhen(NOW - 3 * HOUR, NOW), '3h ago');
  assert.equal(formatWhen(NOW - 3 * DAY, NOW), '3d ago');
});

test('past a week it becomes a date, because "43 days ago" is not a date', () => {
  const out = formatWhen(NOW - 40 * DAY, NOW);
  assert.match(out, /^[A-Z][a-z]{2} \d{1,2}$/, out);
});

test('a date in another year carries the year', () => {
  const out = formatWhen(new Date(2024, 2, 4).getTime(), NOW);
  assert.match(out, /2024$/, out);
});

test('a timestamp from the future reads as just now rather than a negative age', () => {
  // Two synced devices with slightly different clocks produce exactly this.
  assert.equal(formatWhen(NOW + 5 * MIN, NOW), 'just now');
});

test('countLabel gets the singular right', () => {
  assert.equal(countLabel(0), 'No comments');
  assert.equal(countLabel(1), '1 comment');
  assert.equal(countLabel(7), '7 comments');
});
