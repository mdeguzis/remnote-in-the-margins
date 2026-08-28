import {
  AppEvents,
  declareIndexPlugin,
  PluginCommandMenuLocation,
  type ReactRNPlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';

import { captureSelection, focusedDocumentId } from '../lib/doc.ts';
import { applyHostCSS, clearHostCSS } from '../lib/hostcss.ts';
import { describeError, log, setDebugLogging } from '../lib/log.ts';
import { setPending } from '../lib/pending.ts';
import {
  DEFAULTS,
  HIGHLIGHT_COLORS,
  readSettings,
  SETTING_HIGHLIGHT_COLOR,
  SETTING_PAINT_HIGHLIGHT,
  SETTING_PULSE_ON_JUMP,
  SETTING_SHOW_COUNT,
  SETTING_DEBUG,
} from '../lib/settings.ts';
import { readComments, readIndex } from '../lib/storage.ts';
import { publishDiagnostics } from '../lib/diagnostics.ts';
import { SIDEBAR_WIDGET } from '../lib/widgets.ts';

/**
 * What happened to each registration, in the order they were attempted.
 *
 * Kept because "the button is not there" has two very different causes that look
 * identical from the outside: the registration failed, or it succeeded and
 * RemNote put the button somewhere unexpected (the selected text menu tucks
 * plugin entries behind its `...` overflow, for one). Without this you cannot
 * tell them apart without a devtools console, and the answer decides whether the
 * fix is in this file or in where the user is looking.
 */
const registrations = new Map<string, { ok: boolean; error?: string }>();

/**
 * Register one thing, and do not let it take the rest down with it.
 *
 * A single rejected registration aborts every registration queued after it, so
 * one unsupported location silently costs the user the whole plugin. Each call
 * is isolated and each failure is recorded by name.
 */
async function safely(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    registrations.set(what, { ok: true });
  } catch (err) {
    const described = describeError(err);
    registrations.set(what, { ok: false, error: `${described.name}: ${described.message}` });
    log('ERROR', `could not register ${what}`, { ...described, source: 'onActivate' });
  }
}

async function onActivate(plugin: ReactRNPlugin) {
  // Settings first, so the panel is populated in the order somebody reads it.
  await safely('the highlight colour setting', () =>
    plugin.settings.registerDropdownSetting({
      id: SETTING_HIGHLIGHT_COLOR,
      title: 'Highlight colour for commented text',
      description: 'The colour painted over text that has a comment on it.',
      defaultValue: DEFAULTS.highlightColor,
      options: HIGHLIGHT_COLORS.map((c) => ({ key: c, label: c, value: c })),
    }),
  );

  await safely('the paint highlight setting', () =>
    plugin.settings.registerBooleanSetting({
      id: SETTING_PAINT_HIGHLIGHT,
      title: 'Highlight commented text',
      description:
        'Paint the highlight colour over text that has a comment, the way a word processor does. ' +
        'Turning this off keeps comments entirely out of the document, at the cost of there being ' +
        'nothing in the text to show that a comment exists.',
      defaultValue: DEFAULTS.paintHighlight,
    }),
  );

  await safely('the pulse setting', () =>
    plugin.settings.registerBooleanSetting({
      id: SETTING_PULSE_ON_JUMP,
      title: 'Flash the highlight when jumping to a comment',
      description:
        'Blink the highlight twice on arrival so the text is easy to pick out, then drop the ' +
        'selection so the formatting toolbar does not sit over the paragraph. This is a real edit ' +
        'to the Rem, so it adds entries to the undo history. Turn it off and the text is left ' +
        'selected instead, which shows where you landed but brings the toolbar with it.',
      defaultValue: DEFAULTS.pulseOnJump,
    }),
  );

  await safely('the count setting', () =>
    plugin.settings.registerBooleanSetting({
      id: SETTING_SHOW_COUNT,
      title: 'Show the comment count on the toolbar button',
      defaultValue: DEFAULTS.showCount,
    }),
  );

  await safely('the debug console setting', () =>
    plugin.settings.registerBooleanSetting({
      id: SETTING_DEBUG,
      title: 'Enable debug console messages',
      description:
        'Write extra detail to the developer console: what the editor reports for a selection, how ' +
        'each anchor resolves, every storage write and each step of a jump. Off in normal use. ' +
        'Turn it on before reporting a problem, reproduce it, then copy the console.',
      defaultValue: DEFAULTS.debug,
    }),
  );

  // The index plugin is not React and cannot use a tracker hook, so the only
  // way it learns about a settings change is the event.
  // The index plugin has its own module instance, so this covers ONLY its own
  // logging. Each widget applies the same setting for itself via
  // useDebugLogging; see the note there.
  const syncDebug = async () => {
    const settings = await readSettings(plugin);
    setDebugLogging(settings.debug);
  };
  await safely('the debug logging listener', async () => {
    await syncDebug();
    plugin.event.addListener(AppEvents.SettingChanged, SETTING_DEBUG, () => void syncDebug());
  });

  // The pane header button, level with the star.
  await safely('the toolbar button', () =>
    plugin.app.registerWidget('comments_button', WidgetLocation.PaneHeader, {
      dimensions: { height: 'auto', width: 'auto' },
    }),
  );

  // The panel itself. RightSidebar rather than a popup or a pane: a popup's
  // width is capped at roughly a third of what it asks for, and a widget in a
  // pane corrupts RemNote's window tree for the rest of the session.
  await safely('the comments panel', () =>
    plugin.app.registerWidget(SIDEBAR_WIDGET, WidgetLocation.RightSidebar, {
      // height must be a number or 'auto'; a percentage is rejected by the SDK.
      // 'auto' then resolves against nothing, so the panel sets its own height
      // in CSS with 100vh, which inside an iframe IS the iframe.
      dimensions: { height: 'auto', width: '100%' },
      widgetTabTitle: 'Comments',
      widgetTabIcon: `${plugin.rootURL}comment.svg`,
    }),
  );

  // RemNote's own selected text menu. This is the Word-like path: select, comment.
  // Where this actually appears, which is not where it looks like it should.
  //
  // RemNote does NOT give plugins a top level button in the selected text
  // toolbar. Every plugin's entry is grouped behind the toolbar's own plugin
  // button and shown as a TAB. From the official dictionary plugin's README:
  //
  //   "Highlight a word to open the selected text menu. Click on the plugin
  //    button and select the dictionary tab."
  //
  // In current RemNote that button is the "Search & Plugins" item under the
  // toolbar's ... overflow. So an entry registering ok and appearing nowhere in
  // the toolbar is the expected behaviour, not a bug, and several rounds went
  // into looking for a button that was never going to exist.
  //
  // Concrete dimensions rather than 'auto' because this renders as a tab panel
  // with room of its own, and 'auto' can resolve to zero height.
  await safely('the selected text menu entry', () =>
    plugin.app.registerWidget('selected_text_comment', WidgetLocation.SelectedTextMenu, {
      dimensions: { height: 240, width: 360 },
      widgetTabTitle: 'Comment',
      widgetTabIcon: `${plugin.rootURL}comment.svg`,
    }),
  );

  await safely('the comment command', () =>
    plugin.app.registerCommand({
      id: 'margins-comment',
      name: 'Comment on the selection',
      description:
        'Comment on the selected text, or on the whole document when nothing is selected.',
      keywords: 'comment annotate remark note margin',
      keyboardShortcut: 'ctrl+shift+m',
      action: async () => {
        const docId = await focusedDocumentId(plugin);
        if (!docId) {
          await plugin.app.toast('Open a document first.');
          return;
        }
        const anchor = await captureSelection(plugin);
        await setPending(plugin, docId, anchor);
        await plugin.window.openWidgetInRightSidebar(SIDEBAR_WIDGET);
        log('INFO', 'comment command ran', {
          docId,
          anchored: Boolean(anchor),
          source: 'command:margins-comment',
        });
      },
    }),
  );

  await safely('the open panel command', () =>
    plugin.app.registerCommand({
      id: 'margins-open-panel',
      name: 'Open the comments panel',
      keywords: 'comment sidebar panel remark',
      action: async () => {
        await plugin.window.openWidgetInRightSidebar(SIDEBAR_WIDGET);
      },
    }),
  );

  // Commands live in the omnibar, not in the settings panel, which is where
  // people look for them. Diagnostics that cannot be found are not diagnostics,
  // so both of these say so in their description.
  await safely('the debug command', () =>
    plugin.app.registerCommand({
      id: 'margins-debug',
      name: 'Comments: copy debug info',
      description:
        'Copies what In The Margins has stored plus which parts registered, for a bug report. ' +
        'Run this if a button is missing.',
      keywords: 'comment remark debug diagnostic support',
      action: async () => {
        try {
          const settings = await readSettings(plugin);
          const docId = await focusedDocumentId(plugin);
          const index = await readIndex(plugin);
          const here = docId ? await readComments(plugin, docId) : [];
          const report = JSON.stringify(
            {
              settings,
              registrations: Object.fromEntries(registrations),
              focusedDocId: docId ?? null,
              commentsOnThisDocument: here.length,
              documentsWithComments: index.length,
              anchors: here.map((c) => ({
                id: c.id,
                anchored: Boolean(c.anchor),
                remId: c.anchor?.remId ?? null,
                start: c.anchor?.start ?? null,
                end: c.anchor?.end ?? null,
                quoteLength: c.anchor?.quote.length ?? null,
              })),
            },
            null,
            2,
          );

          // The clipboard is often unavailable in a sandboxed iframe. Say which
          // one happened, or the user goes looking in the wrong place.
          try {
            await navigator.clipboard.writeText(report);
            await plugin.app.toast('Debug info copied to the clipboard.');
          } catch {
            console.log('[margins] debug info\n' + report);
            await plugin.app.toast('Clipboard unavailable. Debug info written to the console.');
          }
        } catch (err) {
          const described = describeError(err);
          log('ERROR', 'debug command failed', { ...described, source: 'command:margins-debug' });
          await plugin.app.toast(`Could not gather debug info: ${described.message}`);
        }
      },
    }),
  );

  // The document "..." menu. registerRemMenuItem is the obvious neighbour and is
  // broken in this SDK version: it forwards only id and name while the host
  // requires an html field the SDK never sends. This location works.
  await safely('the document menu entry', () =>
    plugin.app.registerMenuItem({
      id: 'margins-doc-menu',
      name: 'Comments',
      location: PluginCommandMenuLocation.DocumentMenu,
      iconUrl: `${plugin.rootURL}comment.svg`,
      action: async () => {
        await plugin.window.openWidgetInRightSidebar(SIDEBAR_WIDGET);
      },
    }),
  );

  // Only the index widget is allowed to registerCSS, so the opaque frame behind
  // the toolbar button can only be fixed from here.
  await safely('the host stylesheet', () => applyHostCSS(plugin));

  // Publish what happened, so the panel can show it and nobody has to guess at
  // whether a widget registered.
  await safely('the diagnostics report', () =>
    publishDiagnostics(plugin, {
      registrations: Object.fromEntries(registrations),
      // No iframe above us means RemNote granted native mode.
      indexNative: (() => {
        try {
          return window.self === window.top;
        } catch {
          return false;
        }
      })(),
      rootURL: plugin.rootURL ?? '',
    }),
  );

  const failed = [...registrations].filter(([, r]) => !r.ok).map(([what]) => what);
  log('INFO', 'In The Margins activated', {
    registered: registrations.size - failed.length,
    failed: failed.length,
    source: 'onActivate',
  });

  // A silent partial activation is the worst outcome: the plugin looks installed
  // and half of it is missing, with the explanation only in a console nobody has
  // open. Say so once, with the names.
  if (failed.length > 0) {
    await plugin.app.toast(`In The Margins: ${failed.length} part(s) failed to load: ${failed.join(', ')}`);
  }

  void syncDebug();
}

async function onDeactivate(plugin: ReactRNPlugin) {
  // Leaving the sheet registered means it outlives the plugin being turned off.
  try {
    await clearHostCSS(plugin);
  } catch (err) {
    log('WARN', 'could not clear the host stylesheet', { ...describeError(err), source: 'onDeactivate' });
  }
  log('INFO', 'In The Margins deactivated', { source: 'onDeactivate' });
}

declareIndexPlugin(onActivate, onDeactivate);
