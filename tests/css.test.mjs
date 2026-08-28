import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BASE_CSS, SANDBOX_RESET_CSS } from '../src/ui/css.ts';

/*
 * The stylesheet lives in a template literal, so ONE backtick anywhere inside
 * it, including inside a comment, terminates the string. TypeScript then reports
 * it as a nonsense parse error pointing at CSS ("Property 'itm' does not exist
 * on type '...'"), which looks like anything except what it is.
 *
 * Writing `.itm-framed` in a comment to be tidy is enough to do it. That
 * happened three times in one session before this test existed.
 */

test('the stylesheet source contains no backticks that would end the literal', () => {
  const source = readFileSync(new URL('../src/ui/css.ts', import.meta.url), 'utf8');
  for (const name of ['BASE_CSS', 'SANDBOX_RESET_CSS']) {
    const after = source.split(`export const ${name} = ` + '`')[1];
    assert.ok(after, `${name} not found`);
    const body = after.split('`;')[0];
    assert.equal(body.includes('`'), false, `${name} contains a backtick, which ends the literal early`);
  }
});

test('both stylesheets are non-empty strings', () => {
  assert.equal(typeof BASE_CSS, 'string');
  assert.ok(BASE_CSS.length > 500);
  assert.equal(typeof SANDBOX_RESET_CSS, 'string');
  assert.ok(SANDBOX_RESET_CSS.includes('transparent'));
});

test('rules that reach outside our markup stay in the sandbox-only sheet', () => {
  // In native mode the widget mounts into RemNote's own document, so a bare
  // html/body/* rule in BASE_CSS would restyle the entire app.
  const offenders = BASE_CSS.split('\n')
    .filter((line) => /^\s*(html|body|\*)\s*[,{]/.test(line))
    .map((l) => l.trim());
  assert.deepEqual(offenders, [], 'these belong in SANDBOX_RESET_CSS');
});
