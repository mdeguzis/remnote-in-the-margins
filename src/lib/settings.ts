import type { RNPlugin } from '@remnote/plugin-sdk';
import { log } from './log.ts';

/**
 * Setting ids.
 *
 * RemNote applies `defaultValue` only the FIRST time it sees an id and then
 * persists whatever the user has. Changing a default in source therefore never
 * reaches an existing install; changing the id does, at the cost of discarding
 * their choice. Version the id only when the meaning of the setting changes.
 */
export const SETTING_HIGHLIGHT_COLOR = 'margins-highlight-color';
export const SETTING_PAINT_HIGHLIGHT = 'margins-paint-highlight';
export const SETTING_PULSE_ON_JUMP = 'margins-pulse-on-jump';
export const SETTING_SHOW_COUNT = 'margins-show-count';
export const SETTING_DEBUG = 'margins-debug-console';

/** The highlight colours RemNote will accept as a rich text format name. */
export const HIGHLIGHT_COLORS = [
  'Yellow',
  'Green',
  'Blue',
  'Purple',
  'Red',
  'Orange',
] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** The colour a jump pulses to. Chosen to contrast with whatever the anchor already is. */
export const PULSE_COLOR: HighlightColor = 'Orange';
export const PULSE_FALLBACK: HighlightColor = 'Purple';
/** One half of a blink: the flash colour is held this long, then the resting one. */
export const PULSE_MS = 280;

/**
 * ONE cycle, which the eye reads as TWO blinks.
 *
 * A cycle is remove-resting, apply-flash, remove-flash, apply-resting, and the
 * two remove steps each leave the text momentarily UNhighlighted. So the visible
 * sequence is yellow, blank, orange, blank, yellow: two flashes, not one. Set
 * this to 2 and it blinks four times, which is what happened.
 */
export const PULSE_TIMES = 1;

export interface Settings {
  highlightColor: HighlightColor;
  paintHighlight: boolean;
  pulseOnJump: boolean;
  showCount: boolean;
  /** Extra console output for diagnosing a problem. Off in normal use. */
  debug: boolean;
}

export const DEFAULTS: Settings = {
  highlightColor: 'Yellow',
  paintHighlight: true,
  pulseOnJump: true,
  showCount: true,
  debug: false,
};

/**
 * Read every setting through here, never `getSetting` at the call site.
 *
 * Two readers that each coerce their own values eventually disagree about what
 * is in effect, and the disagreement shows up as a bug somewhere else entirely.
 */
export async function readSettings(plugin: RNPlugin): Promise<Settings> {
  const [color, paint, pulse, count, debug] = await Promise.all([
    plugin.settings.getSetting(SETTING_HIGHLIGHT_COLOR),
    plugin.settings.getSetting(SETTING_PAINT_HIGHLIGHT),
    plugin.settings.getSetting(SETTING_PULSE_ON_JUMP),
    plugin.settings.getSetting(SETTING_SHOW_COUNT),
    plugin.settings.getSetting(SETTING_DEBUG),
  ]);

  const highlightColor = HIGHLIGHT_COLORS.includes(color as HighlightColor)
    ? (color as HighlightColor)
    : DEFAULTS.highlightColor;

  if (color != null && highlightColor !== color) {
    log('WARN', 'unknown stored highlight colour, falling back', {
      stored: color,
      using: highlightColor,
      source: 'settings.getSetting',
      field: SETTING_HIGHLIGHT_COLOR,
    });
  }

  return {
    highlightColor,
    paintHighlight: asBool(paint, DEFAULTS.paintHighlight),
    pulseOnJump: asBool(pulse, DEFAULTS.pulseOnJump),
    showCount: asBool(count, DEFAULTS.showCount),
    debug: asBool(debug, DEFAULTS.debug),
  };
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
