// One layout for every metric: the group and what is measured on top, the number big in the middle with a
// faint graph of the last two minutes behind it, and a bar at the bottom. A warning or a critical level
// colors the ring and the number and also adds a mark, so the level never depends on color alone.
import { fit, normalizeText, text } from './text.js';

export const SIZE = 144;
export const FONT = { title: 'outfit-700', small: 'outfit-500' };
export const FONT_IDS = Object.values(FONT);

export const ACCENTS = { cyan: '#4FD8FF', green: '#35E08C', violet: '#B79CFF', orange: '#FF9F43', pink: '#FF7AB6', blue: '#6AA6FF', white: '#FFFFFF' };
export const GROUP_ACCENT = { cpu: 'cyan', gpu: 'green', ram: 'violet', fps: 'orange', network: 'blue' };
export const STATE_COLORS = { warning: '#FFC83D', critical: '#FF4D4D', unavailable: '#6E7279' };

const BACKGROUND = '#0B0D10';
const RING = '#22262D';
const TRACK = '#1B1F25';
const SUBTLE = '#8E97A3';
const GRAPH_STEPS = 20;
export const BAR_STEPS = 50;

/**
 * @typedef {{
 *   group: string,
 *   sub: string,
 *   accent: keyof typeof ACCENTS,
 *   state: 'normal' | 'warning' | 'critical' | 'unavailable',
 *   value: string,
 *   unit?: string,
 *   note?: string,
 *   bar?: number | null,
 *   graph?: number[] | null,
 * }} FaceView
 * `bar` counts in fiftieths and each graph point in twentieths, so a reading that moves a hair does not redraw the key.
 */

const num = (n) => Math.round(n * 10) / 10;

function graphPaths(points) {
  const left = 10;
  const right = SIZE - 10;
  const top = 60;
  const bottom = 116;
  const step = (right - left) / (points.length - 1);
  const coords = points.map((p, i) => [left + i * step, bottom - (Math.min(GRAPH_STEPS, Math.max(0, p)) / GRAPH_STEPS) * (bottom - top)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${num(x)} ${num(y)}`).join('');
  return { line, area: `${line}L${num(right)} ${bottom}L${left} ${bottom}Z` };
}

/** @param {FaceView} view */
export function faceSvg(view) {
  const state = Object.hasOwn(STATE_COLORS, view.state) ? view.state : 'normal';
  const stateColor = STATE_COLORS[state];
  const accent = Object.hasOwn(ACCENTS, view.accent) ? ACCENTS[view.accent] : ACCENTS.cyan;
  const ring = state === 'warning' || state === 'critical' ? stateColor : RING;
  const valueColor = stateColor ?? '#FFFFFF';

  let out = `<rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>`;
  out += `<rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" rx="22" fill="none" stroke="${ring}" stroke-width="${ring === RING ? 3 : 5}"/>`;

  if (state !== 'unavailable' && view.graph && view.graph.length > 1) {
    const { line, area } = graphPaths(view.graph);
    out += `<path d="${area}" fill="${accent}" opacity="0.1"/>`;
    out += `<path d="${line}" fill="none" stroke="${accent}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.4"/>`;
  }

  const group = fit(FONT.title, view.group, 74, 21, 14);
  out += text(FONT.title, group.text, 16, 33, group.size, { fill: accent });
  const sub = fit(FONT.small, view.sub, 86, 14, 10);
  out += text(FONT.small, sub.text, 16, 51, sub.size, { fill: SUBTLE });

  const value = fit(FONT.title, view.value || 'N/D', 116, state === 'unavailable' ? 38 : 48, 24);
  out += text(FONT.title, value.text, SIZE / 2, 96, value.size, { anchor: 'middle', fill: valueColor });

  const caption = state === 'unavailable' ? view.note : view.unit;
  if (caption) {
    const small = fit(FONT.small, caption, 112, 15, 10);
    out += text(FONT.small, small.text, SIZE / 2, 114, small.size, { anchor: 'middle', fill: SUBTLE });
  }

  if (state !== 'unavailable' && Number.isFinite(view.bar)) {
    const width = 112;
    out += `<rect x="16" y="122" width="${width}" height="8" rx="4" fill="${TRACK}"/>`;
    const filled = Math.round((Math.min(BAR_STEPS, Math.max(0, view.bar)) / BAR_STEPS) * width);
    if (filled > 0) out += `<rect x="16" y="122" width="${Math.max(8, filled)}" height="8" rx="4" fill="${stateColor ?? accent}"/>`;
  }

  if (state === 'warning' || state === 'critical') {
    out += `<circle cx="${SIZE - 26}" cy="28" r="13" fill="${stateColor}"/>`;
    out += text(FONT.title, '!', SIZE - 26, 35, 20, { anchor: 'middle', fill: BACKGROUND });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${out}</svg>`;
}

export { normalizeText };
