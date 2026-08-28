# In The Margins

Comments for RemNote that work the way they do in Google Docs and Word. Select
some text, write a comment, and the text keeps a highlight so you can see at a
glance that somebody said something about it. Every comment on the document
sits in a panel on the right, and clicking one takes you back to the exact words
it was written about.

![In The Margins](public/logo.svg)

## What it does

Highlight a run of text and a speech bubble shows up in the formatting toolbar
RemNote pops over your selection. Write the comment there, without leaving the
paragraph you were reading.

Click the same speech bubble in the document header, next to the star, with
nothing selected, and you get a composer for a comment about the page instead of
about any one sentence.

Comments for the open document live in the right sidebar, listed in reading
order from the top of the page down, with document level comments first. Click
one and the document scrolls to it, selects the words it was written about, and
flashes the highlight so your eye lands in the right place. Edit and delete are
on every comment in the list. Deleting one takes its highlight back off the
text, unless another comment still covers those words.

Editing the line a comment is anchored to does not break the comment. See
"How anchoring works" below for what happens instead.

## Compared to the other comments plugin

[Sukarth/RemNote-Comments-Plugin](https://github.com/Sukarth/RemNote-Comments-Plugin)
got here first and covers some of the same ground. It is aiming at something
different, so read the table as two designs rather than a scorecard.

That plugin gives you a comment on a bullet. This one gives you a comment on a
phrase.

It is worth being precise about that, because it looks closer than it is. That
plugin does read your selection, at `src/widgets/index.tsx`, but only to work
out which Rem you are in: it takes `sel.remId` and drops the character range. So
selecting three words and selecting the whole line produce the same comment,
attached to the same bullet, with nothing in the text to show which words you
meant. Everything below follows from that one decision.

| | Sukarth's plugin | In The Margins |
|---|---|---|
| What a comment attaches to | The whole Rem you are focused on | The exact characters you selected |
| Where the comment is stored | A new child Rem in your document, tagged with a powerup | Plugin storage, synced, outside your notes |
| Marking the commented text | Nothing in the text changes | The text carries a highlight, as in Word |
| Starting a comment | Ctrl+Shift+G, or the command palette | The toolbar over your selection, a button in the document header, or Ctrl+Shift+M |
| Clicking a comment | Opens and zooms to the parent Rem | Scrolls to the words, selects them, flashes the highlight |
| The flash | A 300ms flash of the sidebar panel | The text itself in the document |
| Surviving an edit to the text | Not applicable, since the anchor is the whole Rem | The quote is re-found when offsets go stale |
| Editing a comment | In the Rem itself, in your outline | In the panel |
| Icon in the selection toolbar | No | Yes |
| Icon in the document header | No | Yes, next to the star |
| Staying current | Polls every 500ms, plus a 60s safety refresh | Re-reads on a storage event |

Neither storage choice is free. Comments stored as Rems turn up in your outline
and in search and in an export, which is genuinely useful if you want them
there. Comments stored outside your notes keep the document clean, but they also
leave with the plugin if you uninstall it. That is the trade In The Margins
makes, and it is why there is a "copy debug info" command in the meantime. A
real export is on the list.

### Why the word processor model

In Google Docs and Word, a comment is about a phrase. You highlight the words
you mean, the highlight stays there so the next reader can see a conversation
exists, and the margin holds the discussion. Drop the highlight and nobody
knows to look in the margin. Drop the selection and the margin no longer says
which words you meant.

A comment on a whole bullet asks "what do you think of this line". Most of the
time what people want to ask is "what about THIS bit", and that needs the
selection.

## How anchoring works

Character offsets alone cannot survive editing. Type one character at the start
of a line and every comment after it points a character short, so the panel
jumps to slightly the wrong place while looking perfectly healthy. That kind of
silent wrongness is worse than a visible failure.

So a comment stores the text it was made on, and treats the offsets as a hint
about where to start looking:

- If the offsets still land on that text, nothing has moved and it is used as is.
- If they do not, the text is searched for the quote. When it turns up somewhere
  else, the comment follows it and the panel says "moved".
- When the same quote appears more than once, the occurrence nearest the old
  position wins. An edit higher up the line shifts everything below it by the
  same small amount, so nearest is nearly always right, whereas taking the first
  match would drag every comment on a line back to its first word.
- If the quote is gone entirely, the comment survives and says "text gone". It
  is not deleted on your behalf, because what somebody wrote is worth more than
  the anchor it was pinned to.

## Installing

From the RemNote plugin store, once it is listed there. Until then, download
`InTheMarginsPlugin.zip` from the releases page and install it through
Settings, Plugins, Build, Upload Plugin.

## Native mode, and why this plugin asks for it

RemNote runs a plugin in a sandboxed iframe by default. That is the safer
arrangement and it is the right default for a plugin you did not write. This one
sets `requestNative` in its manifest, which asks to run in RemNote's own page
instead, and that is worth being explicit about because it is a real trade.

What it buys, none of which is possible from inside the sandbox:

- The panel can read RemNote's actual theme instead of guessing at it. A
  sandboxed widget is told the theme only when it CHANGES, so a panel opened in
  a session where you have not touched the theme has nothing to go on.
- The toolbar button stops sitting on an opaque rectangle of its own, because
  there is no separate document to paint one.
- Hovering commented text can show the comment, which needs reaching the
  document's own elements.

What it costs: the plugin is no longer isolated from the rest of the app. Nothing
here talks to the network or reads anything outside the document you have open,
and the source is all in this repo, but you should not have to take that on
faith. If you would rather it stayed sandboxed, set `"requestNative": false` in
`public/manifest.json` and rebuild. Everything except the hover tooltip still
works; the theme falls back to the `Panel theme` setting below.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Highlight colour for commented text | Yellow | The colour painted over commented text |
| Highlight commented text | On | Turn off to keep comments entirely out of the document, at the cost of nothing in the text showing that a comment exists |
| Flash the highlight when jumping | On | A real edit to the Rem, so it adds an undo entry each time. The text stays selected either way |
| Show the comment count on the toolbar button | On | The number next to the speech bubble |
| Panel theme | Auto | Auto follows RemNote. Set it by hand if the panel opens with the wrong one |
| Verbose logging | Off | A console line for every anchor resolution, storage write and jump. Turn it on before reporting a problem |

## Commands

Commands live in the omnibar, which you open with Ctrl+K. They do not appear in
the plugin settings panel, which is where people tend to look for them.

| Command | Shortcut | |
|---|---|---|
| Comment on the selection | Ctrl+Shift+M | Comments on the selection, or on the document when nothing is selected |
| Open the comments panel | | Opens the right sidebar |
| Comments: copy debug info | | Everything In The Margins has stored for this document, for a bug report |

## Development

```bash
npm install
npm run dev                    # http://localhost:8081
npm run dev -- --port 8090     # or anywhere else
```

Then in RemNote go to Settings, Plugins, Build, Develop from localhost, and
enter the address the dev server printed. `PORT=8081 npm run dev` works too, and
an explicit `--port` beats it.

This plugin defaults to **8081**, not the 8080 every RemNote template ships
with, because `remnote-laps` already has 8080. One plugin per port is the rule:
a plain `npm run dev` will stop another RemNote plugin's dev server to claim its
default port, so giving each plugin a different default is what lets them run
side by side. A port you pass explicitly is never taken from another project.

Two dev servers for the SAME plugin are stopped automatically. RemNote will
happily load a plugin twice if it has a localhost entry for each, and the
symptom is two of every button and two sidebar tabs, which looks like a bug in
the plugin rather than like two servers.

One thing to know if RemNote cannot reach the server: it binds IPv6 loopback
only, so `http://localhost:8081` works and `http://127.0.0.1:8081` refuses the
connection. Use the `localhost` spelling. If whatever is fetching resolves
`localhost` to IPv4, start it with `HOST=0.0.0.0 npm run dev` instead, which
also puts it on your network, so only do that when you need it.

`npm run free-port` stops a stale server without starting a new one. It only stops servers belonging to this repo or to a sibling
`remnote-*` project, and refuses to touch anything else. The dev build retags itself as `remnote-in-the-margins-dev`
so it loads alongside an installed release rather than fighting it for the same
manifest id.

```bash
npm run verify   # types plus tests, needs no RemNote
npm run build    # produces InTheMarginsPlugin.zip
```

The logic worth testing has no RemNote in it. Anchoring, the comment list
operations and the date formatting are all plain functions in `src/lib/`, which
`node --test` imports directly through Node's type stripping. Everything that
has to talk to the app is in `src/lib/doc.ts` and the widgets.

## Licence

MIT.
