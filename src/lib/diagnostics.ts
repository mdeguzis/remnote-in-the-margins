import type { RNPlugin } from '@remnote/plugin-sdk';
import { log } from './log.ts';

/**
 * What the plugin knows about its own situation, published for the panel to
 * show and for the user to paste into a bug report.
 *
 * This exists because three separate rounds were spent guessing at questions the
 * plugin could simply have answered: is it sandboxed or native, did the widget
 * registrations actually succeed, which theme signal won. Guessing at those from
 * screenshots is slow and it was wrong more than once. A plugin that cannot say
 * what happened to it is a plugin that gets debugged by speculation.
 */
export const DIAGNOSTICS_KEY = 'margins.diagnostics.v1';

export interface Diagnostics {
  /** Registration name to outcome, in the order they were attempted. */
  registrations: Record<string, { ok: boolean; error?: string }>;
  /** True when the index plugin is running inside RemNote's own page. */
  indexNative: boolean;
  rootURL: string;
  at: number;
}

export async function publishDiagnostics(
  plugin: RNPlugin,
  diagnostics: Omit<Diagnostics, 'at'>,
): Promise<void> {
  await plugin.storage.setSession(DIAGNOSTICS_KEY, { ...diagnostics, at: Date.now() });
  log('DEBUG', 'diagnostics published', {
    registrations: Object.keys(diagnostics.registrations).length,
    indexNative: diagnostics.indexNative,
    source: 'storage.setSession',
    field: DIAGNOSTICS_KEY,
  });
}
