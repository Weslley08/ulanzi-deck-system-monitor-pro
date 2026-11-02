import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { sample } from './core.js';

const LHM_MAX_BYTES = 4 * 1024 * 1024;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

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

const isCpu = (s) => /^\/(intelcpu|amdcpu)\//i.test(s.hardware);
const isGpu = (s) => /^\/gpu-/i.test(s.hardware);
const named = (names, type) => (list) => {
  for (const name of names) {
    const found = list.find((s) => s.type === type && s.name === name);
    if (found) return found;
  }
  return undefined;
};

/** A discrete card over the integrated one, because that is the one a game uses. */
function mainGpu(sensors) {
  const gpus = sensors.filter(isGpu);
  const rank = (hardware) => (/nvidia/i.test(hardware) ? 0 : /amd/i.test(hardware) ? 1 : 2);
  const ids = [...new Set(gpus.map((s) => s.hardware))].sort((a, b) => rank(a) - rank(b));
  return gpus.filter((s) => s.hardware === ids[0]);
}

function toGigabytes(s) {
  const n = numeric(s.value) ?? numeric(s.raw);
  if (n === null) return null;
  if (/\bMB\b/i.test(String(s.value)) || (s.type === 'SmallData' && !/GB/i.test(String(s.value)))) return n / 1024;
  return n;
}

export function sensorsToSamples(tree) {
  const sensors = flattenSensors(tree);
  const cpu = sensors.filter(isCpu);
  const gpu = mainGpu(sensors);
  const out = [];
  const add = (id, found, read = (s) => numeric(s.raw) ?? numeric(s.value)) => {
    const value = found ? read(found) : null;
    if (value !== null) out.push(sample(id, value, 'LHM'));
  };

  add('cpu.usage', named(['CPU Total'], 'Load')(cpu));
  add('cpu.temperature', named(['CPU Package', 'Core (Tctl/Tdie)', 'Core (Tdie)', 'Core (Tctl)', 'Core Max', 'Core Average'], 'Temperature')(cpu));
  const average = named(['Cores (Average)', 'Cores (Average Effective)'], 'Clock')(cpu);
  if (average) add('cpu.clock', average);
  else {
    const cores = cpu.filter((s) => s.type === 'Clock' && /^CPU Core #\d+$/.test(s.name)).map((s) => numeric(s.raw) ?? numeric(s.value)).filter(Number.isFinite);
    if (cores.length) out.push(sample('cpu.clock', cores.reduce((a, b) => a + b, 0) / cores.length, 'LHM'));
  }
  add('cpu.power', named(['CPU Package', 'Package'], 'Power')(cpu));

  add('gpu.usage', named(['GPU Core'], 'Load')(gpu));
  add('gpu.temperature', named(['GPU Core'], 'Temperature')(gpu));
  add('gpu.clock', named(['GPU Core'], 'Clock')(gpu));
  add('gpu.power', named(['GPU Package', 'GPU Power'], 'Power')(gpu));
  const memory = (name) => gpu.find((s) => /^(Small)?Data$/.test(s.type ?? '') && s.name === name);
  add('gpu.vram.used', memory('GPU Memory Used'), toGigabytes);
  add('gpu.vram.total', memory('GPU Memory Total'), toGigabytes);
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

export function readRam() {
  const total = os.totalmem() / 2 ** 30;
  const used = (os.totalmem() - os.freemem()) / 2 ** 30;
  return [sample('ram.total', total, 'os'), sample('ram.used', used, 'os'), sample('ram.usage', (used / total) * 100, 'os')];
}

/** Turns growing byte counters into megabits a second. A change in the set of adapters starts over. */
export class NetworkCounter {
  constructor() {
    this.last = null;
  }

  update({ rx, tx, at = Date.now(), adapters = 0 }) {
    const previous = this.last;
    this.last = { rx, tx, at, adapters };
    if (!previous || at <= previous.at || adapters !== previous.adapters || rx < previous.rx || tx < previous.tx) return [];
    const seconds = (at - previous.at) / 1000;
    return [
      sample('network.download', ((rx - previous.rx) * 8) / 1e6 / seconds, 'network', at),
      sample('network.upload', ((tx - previous.tx) * 8) / 1e6 / seconds, 'network', at),
    ];
  }

  reset() {
    this.last = null;
  }
}

// One PowerShell stays up and answers a line with "received sent adapters". Starting one for each reading
// took 3.6 s and 5.5 s of CPU on the author's PC, which is what made the old reader time out; a reading from a
// running one takes under a millisecond. Only physical adapters count: a VPN would count the same traffic twice.
const SAMPLER_SCRIPT = [
  '$skip="Virtual|VMware|Hyper-V|VirtualBox|vEthernet|TAP-|WireGuard|Tailscale|Loopback|Pseudo";',
  'while($null -ne [Console]::In.ReadLine()){',
  '$r=0L;$s=0L;$n=0;',
  'foreach($i in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()){',
  'if($i.OperationalStatus -ne "Up" -or $i.NetworkInterfaceType -in "Loopback","Tunnel" -or $i.Description -match $skip){continue};',
  '$x=$i.GetIPStatistics();$r+=$x.BytesReceived;$s+=$x.BytesSent;$n++};',
  '[Console]::Out.WriteLine("$r $s $n")}',
].join('');

export class NetworkSampler {
  #child = null;
  #waiting = null;
  #buffer = '';

  /** @returns {Promise<{ rx: number, tx: number, adapters: number, at: number }>} */
  sample({ timeout } = {}) {
    if (process.platform !== 'win32') return Promise.reject(new Error('network readings need Windows'));
    const first = !this.#child;
    if (first) this.#start();
    if (this.#waiting) return Promise.reject(new Error('a reading is already waiting'));
    return new Promise((resolve, reject) => {
      // The first answer waits for PowerShell to start.
      const timer = setTimeout(() => {
        this.#waiting = null;
        this.stop();
        reject(new Error('the network reader did not answer'));
      }, timeout ?? (first ? 8000 : 2500));
      this.#waiting = { resolve, reject, timer };
      this.#child.stdin.write('\n');
    });
  }

  #start() {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', SAMPLER_SCRIPT], { windowsHide: true });
    this.#child = child;
    this.#buffer = '';
    child.stdout.on('data', (data) => {
      this.#buffer += data;
      let end;
      while ((end = this.#buffer.indexOf('\n')) >= 0) {
        const line = this.#buffer.slice(0, end).trim();
        this.#buffer = this.#buffer.slice(end + 1);
        this.#answer(line);
      }
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => this.#lost(error));
    child.on('close', () => this.#lost(new Error('the network reader stopped')));
  }

  #answer(line) {
    const waiting = this.#waiting;
    const [rx, tx, adapters] = line.split(' ').map(Number);
    if (!waiting || !Number.isFinite(rx) || !Number.isFinite(tx)) return;
    this.#waiting = null;
    clearTimeout(waiting.timer);
    waiting.resolve({ rx, tx, adapters: adapters || 0, at: Date.now() });
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
    const jitter = ok.length > 1 ? ok.slice(1).reduce((a, b, i) => a + Math.abs(b - ok[i]), 0) / (ok.length - 1) : null;
    const loss = ((this.samples.length - ok.length) / this.samples.length) * 100;
    return [sample('network.ping', average, 'ping'), sample('network.jitter', jitter, 'ping'), sample('network.loss', loss, 'ping')];
  }
}

export async function readPresentMonCsv(file) {
  if (!file) return [];
  const lines = (await fs.readFile(file, 'utf8')).trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const columns = lines[0].split(',');
  const values = lines.at(-1).split(',');
  const index = columns.findIndex((name) => /msbetweenpresents|frame.?time/i.test(name));
  const ms = Number(values[index]);
  if (index < 0 || !(ms > 0 && ms < 1000)) return [];
  return [sample('fps.frametime', ms, 'PresentMon CSV'), sample('fps.current', 1000 / ms, 'PresentMon CSV')];
}
