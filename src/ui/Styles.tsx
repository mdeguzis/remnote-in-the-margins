import * as React from 'react';

import { BASE_CSS, SANDBOX_RESET_CSS } from './css.ts';

/**
 * Are we inside the sandbox iframe, or mounted directly into RemNote's page?
 *
 * With `requestNative: true` in the manifest RemNote may run the plugin
 * natively, which means widgets are mounted into the HOST document rather than
 * into an iframe of their own. Every stylesheet rule that names `html`, `body`
 * or `*` then applies to RemNote itself, so the reset that a sandboxed widget
 * needs is exactly the thing that would break a native one.
 *
 * `window.self !== window.top` is the honest test: it asks the question that
 * actually matters (is there a page above us) rather than trusting a flag.
 */
export function isSandboxed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // A cross origin parent throws on access, which itself means we are framed.
    return true;
  }
}

/**
 * The plugin's stylesheet, with the parts that reach outside our own markup
 * included only when it is safe to do so.
 */
export function Styles(): JSX.Element {
  const sandboxed = React.useMemo(() => isSandboxed(), []);
  React.useEffect(() => {
    // Re-run after a tick as well: the widget root does not exist on the first
    // effect pass of the very first render in every path, and reading the token
    // off nothing is what made this a no-op the first time round.
    matchCanvasToTheme();
    const t = setTimeout(() => matchCanvasToTheme(), 300);
    return () => clearTimeout(t);
  }, []);
  return <style>{(sandboxed ? SANDBOX_RESET_CSS : '') + BASE_CSS}</style>;
}

/**
 * Tell the browser which way this frame's canvas should lean.
 *
 * A widget that wants to be transparent still has a canvas underneath it, and
 * the browser paints that from `color-scheme`. Left alone it resolves light and
 * paints WHITE, which is the pale rectangle behind a header button. There is no
 * way to remove the canvas, but there is a way to stop it being white.
 *
 * The theme is read from a token rather than detected, because
 * `--rn-clr-content-primary` IS available inside the frame and is light text
 * exactly when RemNote is dark. Note this is RemNote's own light/dark, not a
 * third party theme: theme CSS is injected into the host page and never reaches
 * this iframe, which is why colour-matching a themed header from in here is
 * impossible and transparency is the only option.
 */
export function matchCanvasToTheme(): string {
  if (typeof document === 'undefined') return 'no document';
  try {
    // Read the token from an element we KNOW is inside RemNote's cascade, not
    // from documentElement. The tokens are set on the .plugin wrapper RemNote
    // mounts us in, so reading them off <html> comes back empty and the whole
    // thing silently did nothing.
    const source =
      document.querySelector('.itm-root') ?? document.querySelector('.plugin') ?? document.body;
    if (!source) return 'no element to read';

    const fg = getComputedStyle(source).getPropertyValue('--rn-clr-content-primary').trim();
    const lum = luminance(fg);
    if (lum === undefined) return `token unreadable (${fg || 'empty'})`;

    // Light TEXT means a dark app.
    const scheme = lum > 0.5 ? 'dark' : 'light';
    document.documentElement.style.colorScheme = scheme;
    return `${scheme} (from ${fg})`;
  } catch (err) {
    return 'threw';
  }
}

function luminance(color: string): number | undefined {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    const n = Number.parseInt(h, 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  const rgb = color.match(/rgba?\(([^)]+)\)/);
  if (!rgb) return undefined;
  const parts = rgb[1].split(/[,\s/]+/).map(Number.parseFloat).filter((n) => !Number.isNaN(n));
  if (parts.length < 3) return undefined;
  return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
}
