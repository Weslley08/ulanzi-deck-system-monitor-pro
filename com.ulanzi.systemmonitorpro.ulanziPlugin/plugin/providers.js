import { spawn } from 'node:child_process';
import http from 'node:http';
import { sample } from './core.js';

const LHM_MAX_BYTES = 4 * 1024 * 1024;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// ---------------------------------------------------------------- LibreHardwareMonitor

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
const isGpu = (s) => /^\/gpu-/i.test(s.hardware);
const isDisk = (s) => /^\/(nvme|hdd|ssd|storage)\//i.test(s.hardware);
const isMemory = (s) => /^\/ram(\/|$)/i.test(s.hardware);
const CPU_TEMPERATURES = ['CPU Package', 'Core (Tctl/Tdie)', 'Core (Tdie)', 'Core (Tctl)', 'Core Max', 'Core Average'];

/** The first sensor of this type with one of these names, in order of preference. */
function pick(list, type, names) {
  for (const name of names) {
    const found = list.find((s) => s.type === type && s.name === name);
    if (found && reading(found) !== null) return found;
  }
  return undefined;
}

/** A discrete card over an integrated one, because that is the one a game uses. */
function mainGpu(sensors) {
  const rank = (id) => (/nvidia/i.test(id) ? 0 : /amd/i.test(id) ? 1 : 2);
  const gpus = sensors.filter(isGpu);
  const [first] = [...new Set(gpus.map((s) => s.hardware))].sort((a, b) => rank(a) - rank(b));
  return gpus.filter((s) => s.hardware === first);
}

function gigabytes(s) {
  const n = numeric(s.value) ?? numeric(s.raw);
  if (n === null) return null;
  return /\bMB\b/i.test(String(s.value)) || (s.type === 'SmallData' && !/GB/i.test(String(s.value))) ? n / 1024 : n;
}

/** Everything the keys show, from one answer of LibreHardwareMonitor. A sensor that is not there is left out. */
export function sensorsToSamples(tree) {
  const sensors = flattenSensors(tree);
  const out = [];
  const add = (id, found) => {
    const value = found ? reading(found) : null;
    if (value !== null) out.push(sample(id, value, 'LHM'));
  };

  const cpu = sensors.filter(isCpu);
  add('cpu.usage', pick(cpu, 'Load', ['CPU Total']));
  add('cpu.temperature', pick(cpu, 'Temperature', CPU_TEMPERATURES));

  const gpu = mainGpu(sensors);
  add('gpu.usage', pick(gpu, 'Load', ['GPU Core']));
  add('gpu.temperature', pick(gpu, 'Temperature', ['GPU Core']));
  const share = pick(gpu, 'Load', ['GPU Memory']);
  if (share) add('gpu.vram.usage', share);
  else {
    const used = gpu.find((s) => /^(Small)?Data$/.test(s.type ?? '') && s.name === 'GPU Memory Used');
    const total = gpu.find((s) => /^(Small)?Data$/.test(s.type ?? '') && s.name === 'GPU Memory Total');
    const [u, t] = [used && gigabytes(used), total && gigabytes(total)];
    if (Number.isFinite(u) && Number.isFinite(t) && t > 0) out.push(sample('gpu.vram.usage', (u / t) * 100, 'LHM'));
  }

  add('ram.usage', pick(sensors.filter(isMemory), 'Load', ['Memory']));

  // The busiest disk, because that is the one worth knowing about.
  const disks = new Map();
  for (const s of sensors.filter(isDisk)) disks.set(s.hardware, [...(disks.get(s.hardware) ?? []), s]);
  const activity = [...disks.values()].map((list) => pick(list, 'Load', ['Total Activity'])).filter(Boolean).map(reading);
  if (activity.length) out.push(sample('disk.usage', Math.min(100, Math.max(...activity)), 'LHM'));
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
