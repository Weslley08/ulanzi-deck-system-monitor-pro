import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { sample } from './core.js';

const LHM_MAX_BYTES = 4 * 1024 * 1024;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// ---------------------------------------------------------------- LibreHardwareMonitor (optional)

export function flattenSensors(node, hardware = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  const here = typeof node.HardwareId === 'string' ? node.HardwareId : hardware;
  if (typeof node.Text === 'string' && Object.hasOwn(node, 'Value')) {
    out.push({ name: node.Text, value: node.Value, raw: node.RawValue, type: node.Type, hardware: here, id: node.SensorId });
  }
  for (const child of node.Children ?? []) flattenSensors(child, here, out);
  return out;
}

/** Reads "45,0 °C" and "1.2 GB" alike: LibreHardwareMonitor writes numbers the way the system's language does. */
export function numeric(value) {
  const found = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return found ? Number(found[0]) : null;
}

const reading = (s) => numeric(s.raw) ?? numeric(s.value);
const isCpu = (s) => /^\/(intelcpu|amdcpu)\//i.test(s.hardware);
const isDisk = (s) => /^\/(nvme|hdd|ssd|storage)\//i.test(s.hardware);
const CPU_TEMPERATURES = ['CPU Package', 'Core (Tctl/Tdie)', 'Core (Tdie)', 'Core (Tctl)', 'Core Max', 'Core Average'];

/** The two readings only LibreHardwareMonitor can give: the temperature of the processor and of the disks. */
export function sensorsToSamples(tree) {
  const sensors = flattenSensors(tree);
  const out = [];
  const cpu = sensors.filter((s) => isCpu(s) && s.type === 'Temperature');
  for (const name of CPU_TEMPERATURES) {
    const found = cpu.find((s) => s.name === name);
    const value = found ? reading(found) : null;
    if (value !== null) {
      out.push(sample('cpu.temperature', value, 'LHM'));
      break;
    }
  }
  // The hottest disk, because that is the one worth knowing about.
  const disks = sensors.filter((s) => isDisk(s) && s.type === 'Temperature').map(reading).filter(Number.isFinite);
  if (disks.length) out.push(sample('disk.temperature', Math.max(...disks), 'LHM'));
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

// ---------------------------------------------------------------- Processor and memory, from Node itself

export function readRam() {
  return [sample('ram.usage', ((os.totalmem() - os.freemem()) / os.totalmem()) * 100, 'os')];
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
    return [sample('cpu.usage', (1 - (idle - previous.idle) / (total - previous.total)) * 100, 'os')];
  }
}

// ---------------------------------------------------------------- Graphics card: nvidia-smi, which ships with the driver

const NVIDIA_QUERY = ['-l', '1', '--query-gpu=index,utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'];
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
  if (parts.length !== 5 || !/^\d+$/.test(parts[0])) return null;
  return { index: Number(parts[0]), usage: number(parts[1]), temperature: number(parts[2]), used: number(parts[3]), total: number(parts[4]) };
}

/**
 * One nvidia-smi stays up and prints a line for each card every second. Starting one for each reading would
 * cost far more. With two cards, the one with the most memory is the one shown, as a game would use it.
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
    const [main] = [...this.cards.values()].sort((a, b) => (b.total || 0) - (a.total || 0));
    if (!main) return [];
    return [
      sample('gpu.usage', main.usage, 'nvidia-smi'),
      sample('gpu.temperature', main.temperature, 'nvidia-smi'),
      sample('gpu.vram.usage', main.total > 0 ? (main.used / main.total) * 100 : Number.NaN, 'nvidia-smi'),
    ];
  }

  stop() {
    this.#stopped = true;
    const child = this.#child;
    this.#child = null;
    child?.kill();
  }
}

// ---------------------------------------------------------------- Disk activity, from the Windows counters

// One PowerShell stays up and answers a line with how idle the disks were since the last one. It is the only
// way to the counters that works in every language of Windows: the names the counters have in English are
// accepted by .NET on a Portuguese system, which the author's PC showed, where the names the system itself uses
// are not. It is only started while a disk key is on the deck, because it holds about 70 MB.
const DISK_SCRIPT = [
  '$c=New-Object Diagnostics.PerformanceCounter "PhysicalDisk","% Idle Time","_Total";',
  '$null=$c.NextValue();',
  'while($null -ne [Console]::In.ReadLine()){[Console]::Out.WriteLine([math]::Round($c.NextValue(),1))}',
].join('');

export class DiskSampler {
  #child = null;
  #waiting = null;
  #buffer = '';
  #primed = false;

  /** @returns {Promise<number>} the share of time the disks were busy, 0 to 100 */
  async usage({ timeout } = {}) {
    if (process.platform !== 'win32') throw new Error('disk readings need Windows');
    // The first answer only says how idle the disks were since the counter was created.
    if (!this.#primed) {
      await this.#ask(timeout ?? 10_000);
      this.#primed = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const idle = await this.#ask(timeout ?? 3000);
    return Math.min(100, Math.max(0, 100 - idle));
  }

  #ask(timeout) {
    if (!this.#child) this.#start();
    if (this.#waiting) return Promise.reject(new Error('a reading is already waiting'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting = null;
        this.stop();
        reject(new Error('the disk reader did not answer'));
      }, timeout);
      this.#waiting = { resolve, reject, timer };
      this.#child.stdin.write('\n');
    });
  }

  #start() {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', DISK_SCRIPT], { windowsHide: true });
    this.#child = child;
    this.#buffer = '';
    child.stdout.on('data', (data) => {
      this.#buffer += data;
      let end;
      while ((end = this.#buffer.indexOf('\n')) >= 0) {
        const value = Number(this.#buffer.slice(0, end).trim().replace(',', '.'));
        this.#buffer = this.#buffer.slice(end + 1);
        const waiting = this.#waiting;
        if (!waiting || !Number.isFinite(value)) continue;
        this.#waiting = null;
        clearTimeout(waiting.timer);
        waiting.resolve(value);
      }
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => this.#lost(error));
    child.on('close', () => this.#lost(new Error('the disk reader stopped')));
  }

  #lost(error) {
    this.#child = null;
    this.#primed = false;
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
    this.#primed = false;
    if (!child) return;
    child.removeAllListeners('close');
    child.stdin.end();
    child.kill();
  }
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
  const args = windows ? ['-n', '1', '-w', String(timeout), host] : ['-n', '-c', '1', '-W', '2', host];
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
