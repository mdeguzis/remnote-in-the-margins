import * as React from 'react';
import { AppEvents, useAPIEventListener, usePlugin, useTrackerPlugin } from '@remnote/plugin-sdk';

import { DIAGNOSTICS_KEY, type Diagnostics } from '../lib/diagnostics.ts';
import { captureSelection } from '../lib/doc.ts';
import { isSandboxed, matchCanvasToTheme } from './Styles.tsx';

/**
 * A readout of what the plugin can actually see about itself.
 *
 * Deliberately visible in the panel rather than only in the console. The console
 * is not open on the machine where the problem is happening, and asking somebody
 * to paste the outerHTML of an element is a request that has gone unanswered
 * often enough to stop relying on it. If the plugin knows the answer it should
 * show the answer.
 *
 * Shown only when Verbose logging is on, so it costs nothing the rest of the time.
 */
export function DiagnosticsPanel(): JSX.Element {
  const plugin = usePlugin();
  const [tick, setTick] = React.useState(0);
  useAPIEventListener(AppEvents.StorageSessionChange, DIAGNOSTICS_KEY, () => setTick((n) => n + 1));

  const report = useTrackerPlugin(
    async (p) => await p.storage.getSession<Diagnostics>(DIAGNOSTICS_KEY),
    [tick],
  );

  // Whether the host will tell a widget about the editor selection AT ALL is
  // the question behind "my comment came out document level". Polled here so it
  // can simply be read off the screen: select some text, look at this row.
  const [selection, setSelection] = React.useState<string>('not checked yet');
  React.useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const anchor = await captureSelection(plugin);
        if (stopped) return;
        setSelection(anchor ? JSON.stringify(anchor.quote.slice(0, 40)) : 'none');
      } catch (err) {
        if (!stopped) setSelection('error reading it');
      }
    };
    void check();
    const timer = setInterval(() => void check(), 700);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [plugin]);

  const widgetFramed = isSandboxed();
  // Walk up from our own root and report what each ancestor INSIDE the iframe
  // is painting. This settles the white-rectangle question outright: if every
  // one of these is transparent, the white is outside the iframe and only host
  // CSS can reach it. Guessing at that from screenshots cost several rounds.
  const painted = React.useMemo(() => paintedAncestors(), [tick]);
  const rows: [string, string][] = [
    ['this widget', widgetFramed ? 'sandboxed (in an iframe)' : 'native (in RemNote page)'],
    ['index plugin', report ? (report.indexNative ? 'native' : 'sandboxed') : 'unknown'],
    ['selection seen now', selection],
    ['canvas color-scheme', matchCanvasToTheme()],
    ['token via <html>', readTokenFrom(document.documentElement, '--rn-clr-content-primary')],
    ['token via .plugin', readTokenFrom(document.querySelector('.plugin'), '--rn-clr-content-primary')],
    ['text colour token', readToken('--rn-clr-content-primary')],
    ['surface token', readToken('--rn-clr-background-primary')],
  ];

  const registrations = report ? Object.entries(report.registrations) : [];

  return (
    <div className="itm-diag">
      <div className="itm-diag-title">Diagnostics</div>
      {rows.map(([k, v]) => (
        <div className="itm-diag-row" key={k}>
          <span>{k}</span>
          <span className="itm-diag-val">{v}</span>
        </div>
      ))}

      <div className="itm-diag-title">Backgrounds above us</div>
      {painted.length === 0 ? (
        <div className="itm-diag-row">
          <span className="itm-diag-val">nothing measurable</span>
        </div>
      ) : (
        painted.map((row) => (
          <div className="itm-diag-row" key={row.what}>
            <span>{row.what}</span>
            <span className={'itm-diag-val' + (row.opaque ? ' itm-diag-bad' : '')}>{row.bg}</span>
          </div>
        ))
      )}

      <div className="itm-diag-title">Registered</div>
      {registrations.length === 0 ? (
        <div className="itm-diag-row">
          <span className="itm-diag-val">no report yet, reload the plugin</span>
        </div>
      ) : (
        registrations.map(([what, r]) => (
          <div className="itm-diag-row" key={what}>
            <span>{what.replace(/^the /, '')}</span>
            <span className={'itm-diag-val' + (r.ok ? '' : ' itm-diag-bad')}>
              {r.ok ? 'ok' : (r.error ?? 'failed')}
            </span>
          </div>
        ))
      )}

      <button
        className="itm-link"
        onClick={() => {
          const text = JSON.stringify({ widgetFramed, painted, report }, null, 2);
          navigator.clipboard?.writeText(text).then(
            () => void plugin.app.toast('Diagnostics copied.'),
            () => {
              console.log('[margins] diagnostics\n' + text);
              void plugin.app.toast('Clipboard unavailable, written to the console.');
            },
          );
        }}
      >
        Copy all
      </button>
    </div>
  );
}

/**
 * The computed background of every element between our root and the document,
 * inside this iframe.
 *
 * An opaque value here means the white is OURS to fix with the widget's own
 * stylesheet. All-transparent means it is the iframe element or RemNote's
 * wrapper in the host page, which a widget cannot touch at all and only the
 * index plugin's registerCSS can reach.
 */
function paintedAncestors(): { what: string; bg: string; opaque: boolean }[] {
  if (typeof document === 'undefined') return [];
  const out: { what: string; bg: string; opaque: boolean }[] = [];
  const seen = new Set<Element>();

  let node: Element | null = document.querySelector('.itm-root');
  // Fall back to body if the root has not mounted yet.
  if (!node) node = document.body;

  while (node && !seen.has(node)) {
    seen.add(node);
    const bg = getComputedStyle(node).backgroundColor || 'unset';
    const transparent = bg === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg);
    const name =
      node === document.documentElement
        ? 'html'
        : node === document.body
          ? 'body'
          : node.tagName.toLowerCase() + (node.className ? '.' + String(node.className).split(/\s+/)[0] : '');
    out.push({ what: name, bg: transparent ? 'transparent' : bg, opaque: !transparent });
    node = node.parentElement;
  }
  return out.reverse();
}

/**
 * What a RemNote design token resolves to here.
 *
 * The panel binds its whole palette to these, so "is the token present" is now
 * the only theming question worth asking. An empty answer means RemNote renamed
 * it and the per-mode fallback is what is on screen.
 */
/** Where a token is readable from matters: they are not set on <html>. */
function readTokenFrom(el: Element | null, name: string): string {
  if (!el) return 'element absent';
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || 'ABSENT here';
}

function readToken(name: string): string {
  if (typeof document === 'undefined') return 'unknown';
  const root = document.querySelector('.itm-root') ?? document.body;
  if (!root) return 'unknown';
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  return value || 'ABSENT (using fallback)';
}
