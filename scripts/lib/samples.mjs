// Made-up faces used for previews, store art and tests. Nothing here was measured on a real machine.
const wave = (base, spread, length = 24) => Array.from({ length }, (_, i) => Math.max(0, Math.min(20, Math.round(base + Math.sin(i * 0.7) * spread + Math.sin(i * 1.9) * spread * 0.4))));

export const SAMPLE_FACES = [
  { group: 'CPU', sub: 'Usage', accent: 'cyan', state: 'normal', value: '42%', bar: 21, graph: wave(8, 4) },
  { group: 'CPU', sub: 'Temp', accent: 'cyan', state: 'warning', value: '84', unit: '°C', bar: 42, graph: wave(15, 2) },
  { group: 'GPU', sub: 'Usage', accent: 'green', state: 'normal', value: '97%', bar: 49, graph: wave(18, 1) },
  { group: 'GPU', sub: 'VRAM used', accent: 'green', state: 'normal', value: '7.4', unit: 'GB', bar: 31, graph: wave(10, 1) },
  { group: 'RAM', sub: 'Used', accent: 'violet', state: 'normal', value: '11.2', unit: 'GB', bar: 35, graph: wave(9, 1) },
  { group: 'FPS', sub: 'Current', accent: 'orange', state: 'normal', value: '144', unit: 'FPS', bar: 30, graph: wave(14, 2) },
  { group: 'Net', sub: 'Ping', accent: 'blue', state: 'normal', value: '18', unit: 'ms', bar: 5, graph: wave(3, 1) },
  { group: 'Net', sub: 'Download', accent: 'blue', state: 'normal', value: '86', unit: 'Mbps', bar: null, graph: wave(10, 6) },
  { group: 'Net', sub: 'Loss', accent: 'blue', state: 'critical', value: '9.5%', bar: 5, graph: wave(6, 4) },
  { group: 'CPU', sub: 'Clock', accent: 'cyan', state: 'normal', value: '4.5', unit: 'GHz', bar: 38, graph: wave(12, 3) },
  { group: 'GPU', sub: 'Temp', accent: 'green', state: 'unavailable', value: 'N/D', note: 'LHM closed' },
  { group: 'FPS', sub: 'Current', accent: 'orange', state: 'unavailable', value: 'N/D', note: 'No game' },
];
