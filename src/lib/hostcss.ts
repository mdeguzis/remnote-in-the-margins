import type { RNPlugin } from '@remnote/plugin-sdk';
import { log } from './log.ts';

/**
 * CSS injected into RemNote's OWN page, as opposed to into a widget.
 *
 * A widget can only style the inside of its own iframe. The iframe ELEMENT, and
 * whatever RemNote wraps it in, live in the host document and are out of reach
 * from in there. That is why the toolbar button sat on an opaque white
 * rectangle no matter what the widget's own stylesheet said: the white was
 * never inside the iframe to begin with.
 *
 * Only the index widget may call registerCSS. From anywhere else RemNote
 * refuses it with a visible toast.
 */
const CSS_ID = 'margins-host';

/**
 * Make our own widget frames transparent, and nothing else.
 *
 * Targeted by `src`, which is the one attribute guaranteed to identify our
 * iframes and no one else's: it always begins with this plugin's rootURL. A
 * blanket `iframe { background: transparent }` would reach every other plugin
 * on the page, which is not ours to change.
 *
 * The parent is included through `:has()` because the wrapper RemNote puts
 * around the frame is as likely to be the thing painting as the frame itself,
 * and there is no way to tell from inside the sandbox which of the two it is.
 */
export async function applyHostCSS(plugin: RNPlugin): Promise<void> {
  const root = plugin.rootURL;
  if (!root) {
    log('WARN', 'no rootURL, cannot target our own widget frames', { source: 'applyHostCSS' });
    return;
  }

  // The URL is used inside an attribute selector, so a stray quote would break
  // out of it. Nothing here is user supplied, but the escape costs one line.
  const safe = root.replace(/["\\]/g, '\\$&');

  // Matching on the pluginId query parameter as well as the origin, because a
  // released build serves from RemNote's own CDN rather than from localhost and
  // only the id is common to both. Read from the manifest so it cannot drift
  // from the id RemNote actually loaded, dev suffix included.
  //
  // Empty is handled by dropping the selector entirely rather than emitting it
  // with a blank value. `iframe[src*="pluginId="]` matches EVERY plugin's frame,
  // so a missing id would silently turn this sheet into one that restyles other
  // people's widgets.
  const id = (plugin.manifest?.id ?? '').replace(/["\\]/g, '\\$&');

  const css = `
iframe[src^="${safe}"]${id ? `,\niframe[src*="pluginId=${id}"]` : ''} {
  background: transparent !important;
  background-color: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}
/* The wrapper, and its wrapper.
 
   Measured inside the frame, every element from html down to our own root is
   already transparent, so whatever is painting white is out here. Which of the
   ancestors it is cannot be told from inside the sandbox, so a few levels are
   covered. Not many more than this: each level up is a larger element, and past the
   slot RemNote reserved for the widget this would start clearing backgrounds
   that belong to the app. Three, after two did not settle it. */
:where(*):has(> iframe[src^="${safe}"]),
:where(*):has(> * > iframe[src^="${safe}"]),
:where(*):has(> * > * > iframe[src^="${safe}"]) {
  background: transparent !important;
  background-color: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

`;

  await plugin.app.registerCSS(CSS_ID, css);
  log('DEBUG', 'host CSS applied to our widget frames', {
    rootURL: root,
    cssId: CSS_ID,
    source: 'applyHostCSS',
  });
}

/** Take it back off, or the rules outlive the plugin being disabled. */
export async function clearHostCSS(plugin: RNPlugin): Promise<void> {
  await plugin.app.registerCSS(CSS_ID, '');
}
