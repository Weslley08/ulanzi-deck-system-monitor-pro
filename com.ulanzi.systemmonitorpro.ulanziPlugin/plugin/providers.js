import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { sample } from './core.js';

const LHM_MAX_BYTES = 4 * 1024 * 1024;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Two cards with the same name are told apart by their number, and only then. */
function nameCards(cards) {
  const counts = new Map();
  for (const { name } of cards) counts.set(name, (counts.get(name) ?? 0) + 1);
  return new Map(cards.map(({ key, name, number }) => [key, counts.get(name) > 1 ? `${name} #${number}` : name]));
}

// ---------------------------------------------------------------- Processor, memory and drives: Node itself

export function readRam() {
  return [sample('ram.usage', ((os.totalmem() - os.freemem()) / os.totalmem()) * 100, 'node')];
}

/** The share of time the processor was busy since the last reading, across every core. */
export class CpuMeter {
  constructor(read = () => os.cpus()) {
    this.read = read;
    this.last = null;
  }

  update() {
    let idle = 0;
    let total = 0;
    for (const { times } of this.read()) {
      idle += times.idle;
      total += times.user + times.nice + times.sys + times.idle + times.irq;
    }
    const previous = this.last;
    this.last = { idle, total };
    if (!previous || total <= previous.total) return [];
    return [sample('cpu.usage', (1 - (idle - previous.idle) / (total - previous.total)) * 100, 'node')];
  }
}

const PROBE_MS = 1500;
/** The answer, or a timeout, and the timer is gone either way. */
function timed(promise) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), PROBE_MS); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** Every drive letter that answers, because a drive that is not there fails at once, and one that hangs is given up on. */
export async function listDrives(probe = statfs, platform = process.platform) {
  if (platform !== 'win32') return ['/'];
  const letters = Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:`);
  const found = await Promise.all(letters.map(async (drive) => {
    try {
      const { blocks } = await timed(probe(`${drive}\\`));
      return blocks > 0 ? drive : null;
    } catch {
      return null;
    }
  }));
  return found.filter(Boolean);
}

/** How full each drive is, as a share of its space. */
export async function readDisks(drives, probe = statfs) {
  const at = Date.now();
  const out = [];
  for (const drive of drives) {
    try {
      const { blocks, bfree } = await timed(probe(drive === '/' ? '/' : `${drive}\\`));
      out.push(sample('disk.usage', blocks > 0 ? ((blocks - bfree) / blocks) * 100 : Number.NaN, 'node', at, drive));
    } catch {
      out.push(sample('disk.usage', Number.NaN, 'node', at, drive));
    }
  }
  return out;
}

// ---------------------------------------------------------------- Graphics card, NVIDIA: nvidia-smi, which ships with the driver

const NVIDIA_QUERY = ['-l', '1', '--query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'];
const NVIDIA_CANDIDATES = [
  `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\nvidia-smi.exe`,
  `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe`,
];
const MAX_LINE = 4096;

/** "[N/A]", "N/A" and anything that is not a number are a missing reading, never zero. */
const number = (text) => (/^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN);

/** One line of nvidia-smi for one card, or null when it is not a reading (an error message, for one). */
export function parseNvidiaLine(line) {
  const parts = line.split(',').map((part) => part.trim());
  if (parts.length < 6 || !/^\d+$/.test(parts[0])) return null;
  const [index, ...rest] = parts;
  const [usage, temperature, used, total] = rest.slice(-4).map(number);
  return { index: Number(index), name: rest.slice(0, -4).join(',').trim() || `GPU ${index}`, usage, temperature, used, total };
}

/**
 * One nvidia-smi stays up and prints a line for each card every second. Starting one for each reading would
 * cost far more. Every NVIDIA card is reported, each under its own name.
 */
export class NvidiaReader {
  #child = null;
  #stopped = true;

  constructor({ command, args = [] } = {}) {
    this.command = command ?? NVIDIA_CANDIDATES.find((path) => existsSync(path)) ?? 'nvidia-smi';
    this.args = args;
    this.cards = new Map();
  }

  /** @param {{ onSamples: (samples: object[]) => void, onError: (error: Error) => void }} handlers */
  start({ onSamples, onError }) {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.cards.clear();
    let buffer = '';
    const child = spawn(this.command, [...this.args, ...NVIDIA_QUERY], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    this.#child = child;
    child.stdout.on('data', (data) => {
      buffer += data;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const card = parseNvidiaLine(buffer.slice(0, end).trim());
        buffer = buffer.slice(end + 1);
        if (card) {
          this.cards.set(card.index, card);
          onSamples(this.samples());
        }
      }
      if (buffer.length > MAX_LINE) {
        buffer = '';
        child.kill();
      }
    });
    const lost = (error) => {
      if (this.#stopped || this.#child !== child) return;
      this.#child = null;
      this.#stopped = true;
      onError(error);
    };
    child.on('error', lost);
    child.on('close', (code) => lost(new Error(`nvidia-smi stopped (${code})`)));
  }

  samples() {
    const cards = [...this.cards.values()];
    const names = nameCards(cards.map((card) => ({ key: card.index, name: card.name, number: card.index })));
    return cards.flatMap((card) => {
      const scope = names.get(card.index);
      const at = Date.now();
      return [
        sample('gpu.usage', card.usage, 'nvidia', at, scope),
        sample('gpu.temperature', card.temperature, 'nvidia', at, scope),
        sample('gpu.vram.usage', card.total > 0 ? (card.used / card.total) * 100 : Number.NaN, 'nvidia', at, scope),
      ];
    });
  }

  stop() {
    this.#stopped = true;
    const child = this.#child;
    this.#child = null;
    child?.kill();
  }
}

// ---------------------------------------------------------------- Processor temperature, from the Windows thermal zones

// Windows exposes the ACPI thermal zones as a performance counter that needs neither a driver nor administrator.
// The counter names in English are accepted by .NET in every language of Windows, which a Portuguese system showed.
// One PowerShell stays up and answers a line with the hottest zone in degrees, or "none" when the PC has no zone.
// It is only started while a processor temperature key is on the deck, because it holds about 70 to 120 MB.
const THERMAL_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue';",
  "$cat=New-Object Diagnostics.PerformanceCounterCategory 'Thermal Zone Information';$zones=@{};",
  'while($null -ne [Console]::In.ReadLine()){$best=$null;',
  'foreach($n in $cat.GetInstanceNames()){',
  "if(-not $zones.ContainsKey($n)){$zones[$n]=New-Object Diagnostics.PerformanceCounter 'Thermal Zone Information','Temperature',$n};",
  '$k=$zones[$n].NextValue();if($null -eq $best -or $k -gt $best){$best=$k}};',
  "if($null -eq $best){[Console]::Out.WriteLine('none')}else{[Console]::Out.WriteLine(($best-273.15).ToString([Globalization.CultureInfo]::InvariantCulture))}}",
].join('');

/** A PowerShell that stays up and answers one line for each line it is sent. */
export class PowerShellReader {
  #child = null;
  #waiting = null;
  #buffer = '';

  constructor(script) {
    this.script = script;
  }

  /** @returns {Promise<string>} */
  ask({ timeout = 3000 } = {}) {
    if (process.platform !== 'win32') return Promise.reject(new Error('this reading needs Windows'));
    if (this.#waiting) return Promise.reject(new Error('a reading is already waiting'));
    const first = !this.#child;
    if (first) this.#start();
    return new Promise((resolve, reject) => {
      // The first answer waits for PowerShell to start.
      const timer = setTimeout(() => {
        this.#waiting = null;
        this.stop();
        reject(new Error('the reader did not answer'));
      }, first ? Math.max(timeout, 10_000) : timeout);
      this.#waiting = { resolve, reject, timer };
      this.#child.stdin.write('\n');
    });
  }

  #start() {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', this.script], { windowsHide: true });
    this.#child = child;
    this.#buffer = '';
    child.stdout.on('data', (data) => {
      this.#buffer += data;
      let end;
      while ((end = this.#buffer.indexOf('\n')) >= 0) {
        const line = this.#buffer.slice(0, end).trim();
        this.#buffer = this.#buffer.slice(end + 1);
        const waiting = this.#waiting;
        if (!waiting) continue;
        this.#waiting = null;
        clearTimeout(waiting.timer);
        waiting.resolve(line);
      }
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => this.#lost(error));
    child.on('close', () => this.#lost(new Error('the reader stopped')));
  }

  #lost(error) {
    this.#child = null;
    const waiting = this.#waiting;
    this.#waiting = null;
    if (waiting) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
  }

  stop() {
    const child = this.#child;
    this.#child = null;
    if (!child) return;
    child.removeAllListeners('close');
    child.stdin.end();
    child.kill();
  }
}

export const thermalReader = () => new PowerShellReader(THERMAL_SCRIPT);

/** @returns {object[]} the reading, or an error with the code MISSING when this PC has no thermal zone */
export function thermalSamples(line) {
  if (line === 'none') throw Object.assign(new Error('this PC has no thermal zone'), { code: 'MISSING' });
  const value = Number(line);
  if (!Number.isFinite(value)) throw new Error('the thermal reader said something else');
  return [sample('cpu.temperature', value, 'windows')];
}

// ---------------------------------------------------------------- LibreHardwareMonitor: the optional reserve

function flattenSensors(node, hardware = '', names = new Map(), out = []) {
  if (!node || typeof node !== 'object') return { sensors: out, names };
  let here = hardware;
  if (typeof node.HardwareId === 'string') {
    here = node.HardwareId;
    names.set(here, String(node.Text ?? here));
  }
  if (typeof node.Text === 'string' && Object.hasOwn(node, 'Value')) {
    out.push({ name: node.Text, value: node.Value, raw: node.RawValue, type: node.Type, hardware: here });
  }
  for (const child of node.Children ?? []) flattenSensors(child, here, names, out);
  return { sensors: out, names };
}

/** Reads "45,0 °C" and "1.2 GB" alike: LibreHardwareMonitor writes numbers the way the system's language does. */
export function numeric(value) {
  const found = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return found ? Number(found[0]) : null;
}

const reading = (s) => numeric(s.raw) ?? numeric(s.value);
const isCpu = (s) => /^\/(intelcpu|amdcpu)\//i.test(s.hardware);
const CPU_TEMPERATURES = ['CPU Package', 'Core (Tctl/Tdie)', 'Core (Tdie)', 'Core (Tctl)', 'Core Max', 'Core Average'];

function pick(list, type, names) {
  for (const name of names) {
    const found = list.find((s) => s.type === type && s.name === name);
    if (found && reading(found) !== null) return found;
  }
  return undefined;
}

function gigabytes(s) {
  const n = numeric(s.value) ?? numeric(s.raw);
  if (n === null) return null;
  return /\bMB\b/i.test(String(s.value)) || (s.type === 'SmallData' && !/GB/i.test(String(s.value))) ? n / 1024 : n;
}

/** The processor temperature and every graphics card, from one answer of LibreHardwareMonitor. */
export function sensorsToSamples(tree) {
  const { sensors, names } = flattenSensors(tree);
  const out = [];
  const at = Date.now();
  const add = (id, found, scope = '') => {
    const value = found ? reading(found) : null;
    if (value !== null) out.push(sample(id, value, 'lhm', at, scope));
  };

  add('cpu.temperature', pick(sensors.filter(isCpu), 'Temperature', CPU_TEMPERATURES));

  const cards = [...names].filter(([id]) => /^\/gpu-/i.test(id)).map(([id, name]) => ({ key: id, name, number: Number(/(\d+)$/.exec(id)?.[1] ?? 0) }));
  const scopes = nameCards(cards);
  for (const { key } of cards) {
    const own = sensors.filter((s) => s.hardware === key);
    const scope = scopes.get(key);
    add('gpu.usage', pick(own, 'Load', ['GPU Core']), scope);
    add('gpu.temperature', pick(own, 'Temperature', ['GPU Core']), scope);
    const share = pick(own, 'Load', ['GPU Memory']);
    if (share) add('gpu.vram.usage', share, scope);
    else {
      const used = own.find((s) => /^(Small)?Data$/.test(s.type ?? '') && s.name === 'GPU Memory Used');
      const total = own.find((s) => /^(Small)?Data$/.test(s.type ?? '') && s.name === 'GPU Memory Total');
      const [u, t] = [used && gigabytes(used), total && gigabytes(total)];
      if (Number.isFinite(u) && Number.isFinite(t) && t > 0) out.push(sample('gpu.vram.usage', (u / t) * 100, 'lhm', at, scope));
    }
  }
  return out;
}

/** Reads LibreHardwareMonitor's own web server. It is a loopback address only, so nothing leaves the PC. */
export function readLhm(address, { timeout = 1800 } = {}) {
  if (!address) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(address);
    } catch {
      reject(new Error('invalid address'));
      return;
    }
    if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname)) {
      reject(new Error('LHM must use a loopback address'));
      return;
    }
    // node:http and not fetch: fetch holds several MB more for the same request.
    const request = http.get(url, { timeout, agent: false }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`LHM HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > LHM_MAX_BYTES) request.destroy(new Error('LHM answer too large'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          resolve(sensorsToSamples(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
        } catch {
          reject(new Error('LHM answered with something that is not its data'));
        }
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('LHM did not answer in time')));
    request.on('error', reject);
  });
}

// ---------------------------------------------------------------- Ping

export function execSafe(bin, args, timeout = 2200) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = '';
    let err = '';
    let done = false;
    const end = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      end(new Error('timeout'));
    }, timeout);
    child.stdout.on('data', (data) => {
      out += data;
      if (out.length > 100_000) {
        child.kill();
        end(new Error('too much output'));
      }
    });
    child.stderr.on('data', (data) => { err += data; });
    child.on('error', end);
    child.on('close', (code) => end(code === 0 ? null : new Error(err.slice(0, 100) || `exit ${code}`), out));
  });
}

/** Windows says "tempo=4ms", "tiempo=4ms" or "Zeit=4ms" by language, and "<1ms" when it is faster than that. */
export function parsePing(output) {
  const found = String(output).match(/[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/i);
  return found ? Number(found[1].replace(',', '.')) : null;
}

export async function pingOnce(host, timeout = 1400) {
  if (!/^[a-zA-Z0-9.:-]{1,253}$/.test(host)) throw new Error('invalid host');
  const windows = process.platform === 'win32';
  // Windows waits in milliseconds with -w, and macOS with -W.
  const args = windows ? ['-n', '1', '-w', String(timeout), host] : ['-n', '-c', '1', '-W', String(timeout), host];
  try {
    return parsePing(await execSafe(windows ? 'ping.exe' : 'ping', args, timeout + 1000));
  } catch {
    return null;
  }
}

/** The ping and the share of pings with no answer, over the last few. */
export class PingWindow {
  constructor(size = 20) {
    this.size = size;
    this.samples = [];
  }

  update(ms) {
    this.samples.push(ms);
    if (this.samples.length > this.size) this.samples.shift();
    const ok = this.samples.filter(Number.isFinite);
    const average = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
    const loss = ((this.samples.length - ok.length) / this.samples.length) * 100;
    return [sample('network.ping', average, 'ping'), sample('network.loss', loss, 'ping')];
  }
}
