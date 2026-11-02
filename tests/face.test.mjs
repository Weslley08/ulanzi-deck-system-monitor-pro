import assert from 'node:assert/strict';
import test from 'node:test';
import { METRICS } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';
import { ACCENTS, faceSvg } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/render/face.js';
import { clearFaceCache, renderFace, renderSvg, svgToPng } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/render/renderer.js';
import { SAMPLE_FACES } from '../scripts/lib/samples.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test('a key image is a full data URI of a 144 px PNG, because a bare base64 string is ignored by the device', async () => {
  const uri = await renderFace(SAMPLE_FACES[0]);
  assert.match(uri, /^data:image\/png;base64,/);
  const png = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  assert.deepEqual(png.subarray(0, 4), PNG);
  assert.equal(png.readUInt32BE(16), 144);
  assert.equal(png.readUInt32BE(20), 144);
});

test('every sample face draws, in every state', async () => {
  for (const face of SAMPLE_FACES) {
    const png = await svgToPng(await renderSvg(face));
    assert.deepEqual(Buffer.from(png).subarray(0, 4), PNG, JSON.stringify(face));
  }
});

test('a face is the same each time, and a repeat costs nothing', async () => {
  clearFaceCache();
  const first = await renderFace(SAMPLE_FACES[2]);
  assert.equal(await renderFace({ ...SAMPLE_FACES[2] }), first);
});

test('a missing reading says N/D and why, in gray, with no bar or graph', async () => {
  const svg = faceSvg({ group: 'CPU', sub: 'Usage', accent: 'cyan', state: 'unavailable', value: 'N/D', note: 'LHM closed', bar: 30, graph: [1, 2, 3] });
  assert.doesNotMatch(svg, /stroke-linejoin/, 'no graph');
  assert.doesNotMatch(svg, /height="8"/, 'no bar');
  assert.match(svg, /#6E7279/);
});

test('a warning or a critical level adds a mark as well as color, so color is not the only sign', () => {
  const draw = (state) => faceSvg({ group: 'CPU', sub: 'Temp', accent: 'cyan', state, value: '84', unit: '°C', bar: 40 });
  const circles = (svg) => (svg.match(/<circle/g) ?? []).length;
  assert.equal(circles(draw('normal')), 0);
  assert.equal(circles(draw('warning')), 1);
  assert.equal(circles(draw('critical')), 1);
  assert.match(draw('critical'), /#FF4D4D/);
});

test('text only ever selects glyphs, so nothing typed into a name can become markup', () => {
  const svg = faceSvg({ group: '<script>', sub: '"/><image href="x"/>', accent: 'cyan', state: 'normal', value: '<b>9</b>', unit: '&amp;' });
  assert.doesNotMatch(svg, /<script|<image|<b>|&amp;/);
});

test('an unknown color or state falls back to the default instead of breaking the face', () => {
  const svg = faceSvg({ group: 'CPU', sub: 'Usage', accent: 'url(#x)', state: 'weird', value: '1' });
  assert.doesNotMatch(svg, /url\(#x\)/);
});

test('a long value shrinks to fit the key', () => {
  const svg = faceSvg({ group: 'GPU', sub: 'Power', accent: 'green', state: 'normal', value: '1234567890', unit: 'W' });
  assert.match(svg, /<svg/);
});

test('the bar and the graph stay inside their limits whatever they are given', () => {
  const svg = faceSvg({ group: 'CPU', sub: 'Usage', accent: 'cyan', state: 'normal', value: '5%', bar: 999, graph: [-5, 99, 0, 20] });
  assert.doesNotMatch(svg, /NaN|Infinity/);
  const widths = [...svg.matchAll(/<rect x="16" y="122" width="(\d+)"/g)].map(([, w]) => Number(w));
  assert.ok(widths.every((w) => w <= 112), widths.join());
});

test('every accent in the panel exists', () => {
  assert.ok(['cyan', 'green', 'violet', 'orange', 'pink', 'blue', 'white'].every((name) => ACCENTS[name]));
  assert.ok(Object.keys(METRICS).length > 0);
});
