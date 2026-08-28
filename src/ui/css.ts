/**
 * The whole stylesheet, as a string.
 *
 * Widgets render in their own iframes, so there is no shared document to hang a
 * stylesheet on and no benefit in a separate CSS build step. Each widget drops
 * this into a `<style>` tag.
 *
 * Theming is entirely `var(--rn-clr-*, fallback)`. Those tokens DO resolve
 * inside a widget iframe and already hold the active theme's values, verified
 * by dumping a live widget's computed style. Binding to them means the panel
 * follows RemNote, including third party themes, with no detection anywhere.
 *
 * PREVIOUSLY BELIEVED, briefly and wrongly, that the tokens do not resolve.
 * That was inferred from a symptom rather than measured, and it cost a
 * hand-rolled palette, a JavaScript detector, a color-scheme bridge, a session
 * storage channel and a user setting. All five are gone. If the panel ever
 * looks wrong again, read a computed style before writing any code.
 */
/**
 * Rules that reach outside our own markup, and are therefore SANDBOX ONLY.
 *
 * In native mode the widget is mounted straight into RemNote's document, so
 * `html`, `body` and `*` here are RemNote's OWN page. Shipping these globally
 * would make the whole app's background transparent and reset the box model on
 * every element RemNote renders. Anything not scoped under `.itm-root` belongs
 * in this string and nowhere else.
 */
export const SANDBOX_RESET_CSS = `
html, body { margin: 0; padding: 0; }

/* RemNote's own wrapper around the mounted widget paints an opaque background.
   Left alone, a widget in a narrow slot shows as an unexplained pale slab. The
   whole chain has to be named: body, the SDK's mount div, and .plugin. */
html, body, body > div, .plugin {
  background: transparent !important;
  box-shadow: none !important;
  border: 0 !important;
}
`;

export const BASE_CSS = `
/* Scoped to our own subtree on purpose. See SANDBOX_RESET_CSS. */
.itm-root, .itm-root * { box-sizing: border-box; }

/*
 * Every colour is RemNote's own token first, with our value only as the
 * fallback if that token is absent.
 *
 * Verified from a live widget: the --rn-clr-* custom properties DO resolve
 * inside the iframe, and they already carry the correct values for whichever
 * theme is active (--rn-clr-content-primary came back as #fff on a dark
 * install). So binding to them means the panel tracks the theme, and any theme
 * the user installs, with no detection code in the path at all.
 *
 * PREVIOUSLY BELIEVED, and wrong twice in opposite directions: first that these
 * properties resolve (right, but the fallbacks were light values so a failure
 * was invisible), then that they do NOT resolve (wrong, and it caused a
 * hand-rolled palette plus three separate detection mechanisms). They resolve.
 *
 * The fallbacks still matter, because they are what renders if a future RemNote
 * renames a token. They are set per mode, so a fallback is never the wrong
 * brightness: light values here, dark values in the block below.
 */
.itm-root {
  --itm-fg: var(--rn-clr-content-primary, #1f2430);
  --itm-fg-dim: var(--rn-clr-content-secondary, #5b6478);
  --itm-fg-faint: var(--rn-clr-content-tertiary, #8b93a7);
  --itm-line: var(--rn-clr-border-opaque, rgba(31, 36, 48, 0.18));
  --itm-line-strong: var(--rn-clr-border-opaque, rgba(31, 36, 48, 0.32));
  --itm-hover: var(--rn-clr-background--hovered, rgba(31, 36, 48, 0.07));
  --itm-field: var(--rn-clr-background-secondary, rgba(31, 36, 48, 0.04));
  --itm-card: var(--rn-clr-background-secondary, rgba(255, 255, 255, 0.55));
  --itm-accent: var(--rn-clr-background-accent, #4f76c9);
  --itm-accent-fg: var(--rn-clr-content-on-color, #ffffff);
  --itm-danger: var(--rn-clr-content-negative, #c2413f);

  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  color: var(--itm-fg);
}

/*
 * The only fallback that remains.
 *
 * The tokens above already carry the right values for the active theme, so this
 * block exists purely for a future RemNote that renames one. Then the per mode
 * fallbacks matter, and this is what makes them dark when they should be.
 *
 * Everything else that used to live here is gone: a JavaScript detector, a
 * color-scheme bridge through the host stylesheet, a session storage channel
 * from the index plugin, and a Panel theme setting. Four mechanisms, all built
 * to answer a question the tokens answer by themselves.
 */
html.dark .itm-root,
:root.dark .itm-root,
.dark .itm-root {
  --itm-fg: var(--rn-clr-content-primary, #f0f3f8);
  --itm-fg-dim: var(--rn-clr-content-secondary, #b3bccd);
  --itm-fg-faint: var(--rn-clr-content-tertiary, #8792a6);
  --itm-line: var(--rn-clr-border-opaque, rgba(223, 227, 236, 0.22));
  --itm-line-strong: var(--rn-clr-border-opaque, rgba(223, 227, 236, 0.38));
  --itm-hover: var(--rn-clr-background--hovered, rgba(223, 227, 236, 0.12));
  --itm-field: var(--rn-clr-background-secondary, rgba(223, 227, 236, 0.08));
  --itm-card: var(--rn-clr-background-secondary, rgba(223, 227, 236, 0.055));
  --itm-accent: var(--rn-clr-background-accent, #6b8fdb);
  --itm-accent-fg: var(--rn-clr-content-on-color, #10131a);
  --itm-danger: var(--rn-clr-content-negative, #e97b78);
}

/* ---------- the toolbar button ---------- */

/* Built to sit in a row with RemNote's own header buttons and be
   indistinguishable from them.
 
   Their markup, for reference: a 28x28 button, rounded-md, hover background,
   containing a 20px single colour icon drawn with currentColor. Matching those
   numbers is what stops this reading as a plugin bolted on next to them.
 
   The slot is TRANSPARENT. Painting it was tried three ways and all three were
   wrong, for one reason worth writing down: a third party theme's CSS is
   injected into RemNote's own page and does NOT reach a widget's iframe. Inside
   the frame both the tokens and the rn-clr classes therefore give RemNote's
   DEFAULT palette, never the user's theme. So a widget can never colour-match a
   themed header from in here. Only being see-through follows the theme. */
.itm-btn-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.itm-toolbar-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 28px;
  min-width: 28px;
  padding: 0 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  line-height: 1;
}
.itm-toolbar-btn:hover { background: var(--rn-clr-background--hovered, rgba(127, 127, 127, 0.14)); }
.itm-toolbar-btn svg { width: 20px; height: 20px; display: block; }

/* Armed: there is a live selection, so this click comments on THAT rather than
   on the document. Shown as a small dot rather than by recolouring the icon,
   because the icon's colour is how it matches its neighbours. */
.itm-toolbar-btn--armed::after {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rn-clr-content-accent, #6b8fdb);
}

/* Plain tabular digits in the toolbar's own colour. It was a blue pill, which
   nothing else in that row has and which made the button look like an
   advertisement rather than a control. */
.itm-count {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

/* ---------- the sidebar panel ---------- */

/* Height depends on whether we are framed, and the two answers are opposites.
 
   Sandboxed: the widget is declared height 'auto', so a percentage height
   resolves against nothing and collapses the column, taking the scrolling list
   with it. 100vh is right, because in an iframe vh IS the iframe.
 
   Native: there is no iframe, so 100vh is the WHOLE browser viewport and the
   panel would run off the bottom of the sidebar it lives in. 100% of the slot
   RemNote gave us is right. The itm-framed class is set by rootClass. */
.itm-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px 12px 0;
  gap: 12px;

  /* The background comes from RemNote's own rn-clr-background-primary CLASS,
     applied in the JSX, not from a token here.
   
     That distinction is the whole thing. A theme overrides the CLASS: Sakura
     paints .rn-clr-background-primary as rgba(58,36,50,.94) while leaving the
     --rn-clr-background-primary TOKEN at RemNote's default rgb(35,35,41). Bind
     to the token and you get near-black on a mauve header; use the class and you
     get whatever the user's theme paints, which is the point. This is what
     remnote-laps does and why it looks right under Sakura.
   
     Tokens are still right for CONTENT colours, where there is no class. */
}
.itm-framed .itm-panel, .itm-framed.itm-panel { height: 100vh; }

/* The header is a block of its own, separated from the composer by a rule.
   Without it the label, the document name, the anchor quote and the hint all run
   together as one wall of text and none of them reads as a heading. */
.itm-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 0 0 auto;
  padding-bottom: 10px;
  margin-bottom: 2px;
  border-bottom: 1px solid var(--itm-line);
}

/* "Comments" is the smaller of the two on purpose. It never changes, so it is a
   label; the document name does change, and is what tells you these comments
   belong to the text on screen. */
.itm-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--itm-fg-faint);
}
.itm-sub {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.itm-doc {
  font-size: 15px;
  font-weight: 700;
  color: var(--itm-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.itm-count-label {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--itm-fg-faint);
  white-space: nowrap;
}

.itm-actions { display: flex; gap: 6px; flex: 0 0 auto; }

/* Says what the comment being written will attach to, and updates as the
   selection changes. The composer is otherwise a black box: you cannot tell
   whether it caught your selection until after you have saved. */
.itm-target {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 2px 0 8px;
  font-size: 11px;
  line-height: 1.45;
}
.itm-target-live { color: var(--itm-fg-faint); }
.itm-target .itm-link { margin-left: auto; white-space: nowrap; }

.itm-action {
  padding: 6px 12px;
  font: inherit;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--itm-line-strong);
  background: transparent;
  color: var(--itm-fg);
  cursor: pointer;
}
.itm-action:hover:not([disabled]) { background: var(--itm-hover); }
.itm-action--wide { flex: 1; }
.itm-action--primary {
  background: var(--itm-accent);
  border-color: transparent;
  color: var(--itm-accent-fg);
  font-weight: 600;
}
.itm-action--primary:hover:not([disabled]) { filter: brightness(1.08); }
.itm-action[disabled] { opacity: 0.45; cursor: default; }

.itm-list {
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 -4px;
  padding: 0 4px;
}

/* ---------- one comment ---------- */

.itm-card {
  border: 1px solid var(--itm-line);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--itm-card);
  cursor: pointer;
}
.itm-card:hover { border-color: var(--itm-accent); }
.itm-card--editing { cursor: default; }
.itm-card--lost { opacity: 0.72; }

/* The quote is the anchor made visible. A left rule rather than a background,
   so it reads as a citation and not as a second comment body. */
.itm-quote {
  font-size: 13px;
  font-weight: 700;
  margin-top: 2px;
  line-height: 1.4;
  color: var(--itm-fg);
  border-left: 3px solid var(--itm-accent);
  padding: 1px 0 1px 8px;
  margin-bottom: 6px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.itm-quote--doc {
  border-left-style: dashed;
  font-style: italic;
  font-weight: 600;
  color: var(--itm-fg-dim);
}
.itm-quote--lost { border-left-color: var(--itm-fg-faint); text-decoration: line-through; }

.itm-body {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--itm-fg);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.itm-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--itm-fg-faint);
}
.itm-meta-spacer { flex: 1; }

.itm-link {
  border: 0;
  background: transparent;
  padding: 2px 5px;
  border-radius: 4px;
  font: inherit;
  font-size: 11px;
  color: var(--itm-fg-dim);
  cursor: pointer;
}
.itm-link:hover { background: var(--itm-hover); color: var(--itm-fg); }
.itm-link--danger:hover { color: var(--itm-danger); }

/* ---------- composer ---------- */

.itm-composer { display: flex; flex-direction: column; gap: 6px; }

.itm-input {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  padding: 7px 9px;
  font: inherit;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--itm-fg);
  border-radius: 6px;
  border: 1px solid var(--itm-line-strong);
  background: var(--itm-field);
}
.itm-input::placeholder { color: var(--itm-fg-faint); }
.itm-input:focus { outline: none; border-color: var(--itm-accent); }

.itm-composer-row { display: flex; gap: 6px; align-items: center; }
.itm-hint { flex: 1; font-size: 11px; line-height: 1.35; color: var(--itm-fg-faint); }

/* ---------- states ---------- */

.itm-empty, .itm-error {
  padding: 18px 4px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--itm-fg-dim);
}
.itm-error { color: var(--itm-danger); }
.itm-empty code {
  font-size: 12px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--itm-field);
}

/* ---------- diagnostics ---------- */

.itm-diag {
  margin-top: 14px;
  padding: 8px 10px;
  border: 1px dashed var(--itm-line-strong);
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--itm-fg-dim);
}
.itm-diag-title {
  font-weight: 700;
  color: var(--itm-fg);
  margin: 4px 0 2px;
}
.itm-diag-title:first-child { margin-top: 0; }
.itm-diag-row { display: flex; gap: 8px; justify-content: space-between; }
.itm-diag-val { color: var(--itm-fg); text-align: right; overflow-wrap: anywhere; }
.itm-diag-bad { color: var(--itm-danger); }

/* The scroll body must not end flush against the bottom of the panel. */
.itm-tail { flex: 0 0 auto; height: 20px; }

/* ---------- selected text menu ---------- */

.itm-selmenu { padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.itm-selmenu .itm-quote { margin-bottom: 0; }
`;
