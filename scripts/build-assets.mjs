// Regenerates everything derived from the key faces and the metric table, so previews never drift from what
// the keys draw: icons, default key images, the store banner, the sheet in the README, and the action names
// in the manifest and the language files. Run it after changing a face, a metric or a name.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACTIONS, LOCALIZATION, PLUGIN_TEXT } from './lib/actions.mjs';
import { PLUGIN_FOLDER, pluginDir, root } from './lib/project.mjs';
import { SAMPLE_FACES } from './lib/samples.mjs';

const load = (path) => import(pathToFileURL(join(pluginDir, 'plugin', path)).href);
const { renderSvg, svgToPng } = await load('render/renderer.js');
const { text } = await load('render/text.js');
const { METRICS } = await load('core.js');

function save(path, bytes) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
}
const plugin = (rel) => join(PLUGIN_FOLDER, rel);
const facePng = async (view, width) => svgToPng(await renderSvg(view), width);
const dataUri = (png) => `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

// Faces become embedded images in composites, clipped to the rounded shape of a real key.
function placed(png, x, y, size) {
  const clip = `c${Math.round(x)}_${Math.round(y)}`;
  return `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.14}"/></clipPath>`
    + `<image href="${dataUri(png)}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#${clip})"/>`;
}

async function sheet(views, columns, face = 216, gap = 20, background = '#101215') {
  const rows = Math.ceil(views.length / columns);
  const width = columns * (face + gap) + gap;
  const height = rows * (face + gap) + gap;
  let body = '';
  for (const [i, view] of views.entries()) {
    body += placed(await facePng(view, face), gap + (i % columns) * (face + gap), gap + Math.floor(i / columns) * (face + gap), face);
  }
  return svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${background}"/>${body}</svg>`, width);
}

// The brand mark: a gauge on a dark tile. Our own drawing.
function brandSvg(size) {
  const center = size / 2;
  const radius = size * 0.27;
  const circumference = 2 * Math.PI * radius;
  const arc = (share, color, width) => `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${circumference * share} ${circumference}" transform="rotate(135 ${center} ${center})"/>`;
  // The dial starts at 135 degrees and sweeps 270, so the needle sits where the bright part ends.
  const needle = (135 + 270 * 0.62) * (Math.PI / 180);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" fill="#0B0D10"/>`
    + `<rect x="${size * 0.04}" y="${size * 0.04}" width="${size * 0.92}" height="${size * 0.92}" rx="${size * 0.18}" fill="none" stroke="#4FD8FF" stroke-width="${size * 0.035}"/>`
    + `${arc(0.75, '#22262D', size * 0.07)}${arc(0.75 * 0.62, '#4FD8FF', size * 0.07)}`
    + `<line x1="${center}" y1="${center}" x2="${center + Math.cos(needle) * radius * 0.78}" y2="${center + Math.sin(needle) * radius * 0.78}" stroke="#FFFFFF" stroke-width="${size * 0.045}" stroke-linecap="round"/>`
    + `<circle cx="${center}" cy="${center}" r="${size * 0.04}" fill="#FFFFFF"/></svg>`;
}

// Simple outlines on a 24 grid, one for each group, in the single color the store's list asks for.
const LIST_ICONS = {
  cpu: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  gpu: 'M3 8h18v8H3zM6 16v3M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M18 11v2',
  ram: 'M3 8h18v8H3zM7 11v2M11 11v2M15 11v2M7 16v2M12 16v2M17 16v2',
  network: 'M5 18v-3M10 18v-6M15 18v-9M20 18V6',
  disk: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
};
const listIcon = (path, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>\n`;

const KEY_FACE = {
  cpu: SAMPLE_FACES[0], gpu: SAMPLE_FACES[2], ram: SAMPLE_FACES[5], network: SAMPLE_FACES[6], disk: SAMPLE_FACES[8],
};

async function icons() {
  save(plugin('resources/plugin-icon.png'), await svgToPng(brandSvg(196), 196));
  save(plugin('resources/plugin-icon@2x.png'), await svgToPng(brandSvg(196), 392));
  save(plugin('resources/category.svg'), listIcon(LIST_ICONS.cpu, '#FFFFFF'));
  for (const [group, path] of Object.entries(LIST_ICONS)) {
    save(plugin(`resources/action-${group}.svg`), listIcon(path, '#A6A6A6'));
    // The picture before the plugin draws anything: a sample reading, not a measured one.
    const { graph, ...face } = KEY_FACE[group];
    save(plugin(`resources/key-${group}.png`), await facePng(face, 144));
    save(plugin(`resources/key-${group}@2x.png`), await facePng(face, 288));
  }
}

async function storeArt(width, height, columns, faces) {
  const title = 'System Monitor Pro';
  const subtitle = 'Your PC, at a glance';
  const header = height * 0.27;
  const gap = height * 0.03;
  const rows = Math.ceil(faces.length / columns);
  const face = Math.min((height - header - gap * (rows + 1)) / rows, (width - gap * (columns + 1)) / columns);
  const left = (width - (columns * face + (columns - 1) * gap)) / 2;
  const top = Math.round((height - header - gap * (rows + 1) - rows * face) / 2);
  let body = text('outfit-700', title, width / 2, top + height * 0.135, height * 0.09, { anchor: 'middle', fill: '#FFFFFF' })
    + text('outfit-500', subtitle, width / 2, top + height * 0.205, height * 0.042, { anchor: 'middle', fill: '#8E97A3' });
  for (const [i, view] of faces.entries()) {
    body += placed(await facePng(view, Math.round(face)), left + (i % columns) * (face + gap), top + header + gap + Math.floor(i / columns) * (face + gap), face);
  }
  return svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#0E1013"/>${body}</svg>`, width);
}

/** The names Studio lists, in the manifest and in each language file, from the one table. */
function names() {
  const manifestPath = join(pluginDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));
  const ids = Object.keys(METRICS);
  if (ACTIONS.map((a) => a.id).join() !== ids.join()) throw new Error('scripts/lib/actions.mjs and plugin/core.js list different metrics');
  manifest.Description = PLUGIN_TEXT.en.Description;
  manifest.Detail = PLUGIN_TEXT.en.Detail;
  manifest.Category = 'System Monitor Pro';
  manifest.CategoryIcon = 'resources/category.svg';
  manifest.Actions = ACTIONS.map(({ id, en: [name, tip] }) => {
    const group = METRICS[id].group;
    return {
      Name: name,
      Icon: `resources/action-${group}.svg`,
      UUID: `${manifest.UUID}.${id.replaceAll('.', '')}`,
      States: [{ Name: name, Image: `resources/key-${group}.png` }],
      DisableAutomaticStates: true,
      Controllers: ['Keypad'],
      Devices: [],
      PropertyInspectorPath: 'property-inspector/metric/inspector.html',
      Tooltip: tip,
      SupportedInMultiActions: false,
    };
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const languages = { en: 'en.json', pt: 'pt_BR.json' };
  for (const [language, file] of Object.entries(languages)) {
    const body = {
      Name: manifest.Name,
      Description: PLUGIN_TEXT[language].Description,
      Actions: ACTIONS.map((action) => ({ Name: action[language][0], Tooltip: action[language][1] })),
      Localization: LOCALIZATION[language] ?? {},
    };
    writeFileSync(join(pluginDir, file), `${JSON.stringify(body, null, 2)}\n`);
  }
  // Studio lists Portuguese as pt_PT, and a user may have either.
  writeFileSync(join(pluginDir, 'pt_PT.json'), readFileSync(join(pluginDir, 'pt_BR.json')));
}

await icons();
save(plugin('assets/banners/banner-1.png'), await storeArt(1098, 732, 4, SAMPLE_FACES.slice(0, 8)));
save('docs/keys.png', await sheet(SAMPLE_FACES, 6));
names();
console.log('assets written');
