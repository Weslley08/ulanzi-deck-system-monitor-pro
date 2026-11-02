// Made-up faces used for previews, store art and tests. Nothing here was measured on a real machine.
const wave = (base, spread, length = 24) => Array.from({ length }, (_, i) => Math.max(0, Math.min(20, Math.round(base + Math.sin(i * 0.7) * spread + Math.sin(i * 1.9) * spread * 0.4))));

export const SAMPLE_FACES = [
  { group: 'CPU', sub: 'Usage', accent: 'cyan', state: 'normal', value: '42%', bar: 21, graph: wave(8, 4) },
  { group: 'CPU', sub: 'Temp', accent: 'cyan', state: 'warning', value: '84', unit: '°C', bar: 42, graph: wave(15, 2) },
  { group: 'GPU', sub: 'Usage', accent: 'green', state: 'normal', value: '97%', bar: 49, graph: wave(18, 1) },
  { group: 'GPU', sub: 'Temp', accent: 'green', state: 'normal', value: '66', unit: '°C', bar: 33, graph: wave(12, 2) },
  { group: 'GPU', sub: 'VRAM', accent: 'green', state: 'warning', value: '91%', bar: 46, graph: wave(17, 1) },
  { group: 'RAM', sub: 'Usage', accent: 'violet', state: 'normal', value: '58%', bar: 29, graph: wave(11, 1) },
  { group: 'Net', sub: 'Ping', accent: 'blue', state: 'normal', value: '18', unit: 'ms', bar: 5, graph: wave(3, 1) },
  { group: 'Net', sub: 'Loss', accent: 'blue', state: 'critical', value: '9.5%', bar: 5, graph: wave(6, 4) },
  { group: 'Disk', sub: 'C:', accent: 'orange', state: 'normal', value: '12%', bar: 6, graph: wave(3, 3) },
  { group: 'CPU', sub: 'Temp', accent: 'cyan', state: 'unavailable', value: 'N/D', note: 'Needs LHM' },
  { group: 'GPU', sub: 'Usage', accent: 'green', state: 'unavailable', value: 'N/D', note: 'No sensor' },
];
