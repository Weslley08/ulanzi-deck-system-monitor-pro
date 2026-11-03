import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import v8 from 'node:v8';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { FONT_IDS, SIZE, faceSvg } from './face.js';
import { loadFont } from './text.js';

// A key whose reading did not change keeps its image, and a few repeated faces cost nothing to redraw.
const CACHE_LIMIT = 24;
const require = createRequire(import.meta.url);

let ready = null;
const cache = new Map();

// V8 compiles WASM twice: quickly (Liftoff), then again with its optimizer (TurboFan) once the code is hot.
// For this engine the second pass costs tens of MB that never come back, to save under 1 ms per key image,
// measured on Node 20.12.2 for the Soundpad plugin, which uses the same engine. Studio starts the process,
// so the flag cannot go on its command line. It is set here, before the engine is compiled, and only
// affects WASM.
export const WASM_FLAGS = '--liftoff-only';
v8.setFlagsFromString(WASM_FLAGS);

// The engine loads on first use, so a plugin with no key on the deck costs almost nothing.
function initEngine() {
  ready ??= Promise.all([
    readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')).then((wasm) => initWasm(wasm)),
    ...FONT_IDS.map(loadFont),
  ]);
  return ready;
}

/** Rasterizes an SVG. WASM memory is not garbage collected, so everything is freed explicitly. */
export async function svgToPng(svg, width = SIZE) {
  await initEngine();
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } });
  const image = resvg.render();
  try {
    return image.asPng();
  } finally {
    image.free();
    resvg.free();
  }
}

export async function renderSvg(view) {
  await initEngine();
  return faceSvg(view);
}

/** Returns the key image as a full data URI: the device ignores a bare base64 string. */
export async function renderFace(view) {
  const key = JSON.stringify(view);
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const png = await svgToPng(await renderSvg(view));
  const uri = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  cache.set(key, uri);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return uri;
}

export function clearFaceCache() {
  cache.clear();
}
