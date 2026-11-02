// Text is drawn from pre-generated outlines (see scripts/build-glyphs.mjs). Anything that reaches a
// key only ever selects glyphs, so it can never inject markup into the SVG.

const EM = 1000;
const fonts = new Map();

export async function loadFont(id) {
  if (!fonts.has(id)) {
    const { default: glyphs } = await import(`./glyphs/${id}.js`);
    fonts.set(id, glyphs);
  }
  return fonts.get(id);
}

function font(id) {
  const glyphs = fonts.get(id);
  if (!glyphs) throw new Error(`font not loaded: ${id}`);
  return glyphs;
}

/** Replaces characters the font lacks: first by their unaccented form, otherwise by dropping them. */
export function normalizeText(fontId, text) {
  const glyphs = font(fontId);
  let out = '';
  for (const char of String(text ?? '')) {
    if (glyphs[char]) {
      out += char;
      continue;
    }
    const base = char.normalize('NFD').replace(/\p{M}/gu, '');
    if (glyphs[base]) out += base;
    else if (/\s/.test(char) && glyphs[' ']) out += ' ';
  }
  return out.trim();
}

export function measure(fontId, text, size, tracking = 0) {
  const glyphs = font(fontId);
  let width = 0;
  for (const char of text) width += (glyphs[char]?.[0] ?? 0) * (size / EM) + tracking;
  return text.length ? width - tracking : 0;
}

/** Picks the largest size that fits, then truncates with an ellipsis if even the smallest does not. */
export function fit(fontId, rawText, maxWidth, maxSize, minSize = maxSize, tracking = 0) {
  const text = normalizeText(fontId, rawText);
  const width = measure(fontId, text, maxSize, tracking);
  if (width <= maxWidth) return { text, size: maxSize };
  const scaled = Math.floor((maxSize * maxWidth) / width);
  if (scaled >= minSize && measure(fontId, text, scaled, tracking) <= maxWidth) return { text, size: scaled };
  const chars = [...text];
  while (chars.length > 1 && measure(fontId, `${chars.join('').trimEnd()}…`, minSize, tracking) > maxWidth) chars.pop();
  return { text: `${chars.join('').trimEnd()}…`, size: minSize };
}

/** Greedy word wrap. A single word wider than the line is left for fit() to shorten. */
export function wrap(fontId, rawText, maxWidth, size) {
  const lines = [];
  let line = '';
  for (const word of normalizeText(fontId, rawText).split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(fontId, candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const num = (n) => Math.round(n * 100) / 100;

/**
 * Draws text as SVG paths.
 * @param {string} fontId
 * @param {string} str
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {{ anchor?: 'start' | 'middle' | 'end', fill?: string, opacity?: number, tracking?: number }} [options]
 */
export function text(fontId, str, x, y, size, { anchor = 'start', fill = '#fff', opacity, tracking = 0 } = {}) {
  const glyphs = font(fontId);
  const scale = size / EM;
  const total = measure(fontId, str, size, tracking);
  const start = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
  let pen = 0;
  let out = '';
  for (const char of str) {
    const glyph = glyphs[char];
    if (!glyph) continue;
    if (glyph[1]) out += `<path transform="translate(${num(pen)} 0)" d="${glyph[1]}"/>`;
    pen += glyph[0] + tracking / scale;
  }
  const alpha = opacity === undefined ? '' : ` opacity="${opacity}"`;
  return `<g fill="${fill}"${alpha} transform="translate(${num(start)} ${num(y)}) scale(${num(scale * 1000) / 1000})">${out}</g>`;
}
