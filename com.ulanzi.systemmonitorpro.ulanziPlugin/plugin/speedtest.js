// A speed test: several connections pull and push data for a few seconds, and what got through is the speed.
// It is not meant to match another test to the megabit, since servers and routes differ, but it does not
// count the first seconds, when a connection is still speeding up, and it never keeps what it moves in memory.
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

export const SPEED_DEFAULTS = Object.freeze({
  baseUrl: 'https://speed.cloudflare.com',
  streams: 4,
  warmupMs: 1500,
  measureMs: 4000,
  // The most one direction may move, so that a fast line does not spend a lot of data on one test.
  maxBytes: 120_000_000,
  graceMs: 3000,
});

const DOWNLOAD_REQUEST_BYTES = 25_000_000;
const UPLOAD_FIRST_BYTES = 256 * 1024;
const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const CHUNK = 64 * 1024;
// Random, so that nothing on the way can squeeze it and make the line look faster than it is.
let payload = null;

const megabits = (bytes, ms) => (ms > 0 ? (bytes * 8) / 1000 / ms : 0);

function connect(base, streams) {
  const url = new URL(base);
  const lib = url.protocol === 'http:' ? http : https;
  return { url, lib, agent: new lib.Agent({ keepAlive: true, maxSockets: streams }) };
}

/** Pulls data over several connections and returns megabits per second, from after the warm-up to the end. */
export function measureDownload(options = {}) {
  const { baseUrl, streams, warmupMs, measureMs, maxBytes } = { ...SPEED_DEFAULTS, ...options };
  const { url, lib, agent } = connect(baseUrl, streams);
  return new Promise((resolve, reject) => {
    const requests = new Set();
    let total = 0;
    let mark = null;
    let finished = false;
    const started = Date.now();
    let warmTimer = null;
    let endTimer = null;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(warmTimer);
      clearTimeout(endTimer);
      for (const req of requests) req.destroy();
      agent.destroy();
      if (error) return reject(error);
      // A cap reached during the warm-up leaves nothing apart, so the whole run counts.
      const from = mark ?? { at: started, bytes: 0 };
      const ms = Date.now() - from.at;
      if (total - from.bytes <= 0 || ms <= 0) return reject(new Error('no data'));
      resolve(megabits(total - from.bytes, ms));
    };

    const pull = () => {
      if (finished) return;
      const req = lib.get({
        protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, agent,
        path: `${url.pathname.replace(/\/$/, '')}/__down?bytes=${DOWNLOAD_REQUEST_BYTES}`,
        headers: { 'user-agent': 'system-monitor-pro' },
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          finish(new Error(`status ${res.statusCode}`));
          return;
        }
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total >= maxBytes) finish();
        });
        res.on('end', () => {
          requests.delete(req);
          pull();
        });
        res.on('error', () => {});
      });
      requests.add(req);
      req.on('error', (error) => {
        // A connection that was closed by us at the end is not a failure.
        if (!finished) finish(error);
      });
    };

    warmTimer = setTimeout(() => { mark = { at: Date.now(), bytes: total }; }, warmupMs);
    endTimer = setTimeout(() => finish(), warmupMs + measureMs);
    for (let i = 0; i < streams; i += 1) pull();
  });
}

/**
 * Pushes data over several connections and returns megabits per second. A request counts only once the server
 * has answered it, because what a socket accepts is mostly the size of a buffer, not what went through.
 */
export function measureUpload(options = {}) {
  const { baseUrl, streams, warmupMs, measureMs, maxBytes, graceMs } = { ...SPEED_DEFAULTS, ...options };
  payload ??= randomBytes(UPLOAD_MAX_BYTES);
  const { url, lib, agent } = connect(baseUrl, streams);
  return new Promise((resolve, reject) => {
    const requests = new Set();
    // Per connection: the bytes of the requests that finished after the warm-up, and how long they took.
    const lanes = Array.from({ length: streams }, () => ({ bytes: 0, ms: 0, warm: 0, warmMs: 0 }));
    let sent = 0;
    let finished = false;
    let stopping = false;
    const started = Date.now();
    let stopTimer = null;
    let graceTimer = null;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(stopTimer);
      clearTimeout(graceTimer);
      for (const req of requests) req.destroy();
      agent.destroy();
      const counted = lanes.some((lane) => lane.bytes > 0) ? lanes.map(({ bytes, ms }) => ({ bytes, ms })) : lanes.map(({ warm, warmMs }) => ({ bytes: warm, ms: warmMs }));
      const speed = counted.filter((lane) => lane.ms > 0).reduce((sum, lane) => sum + megabits(lane.bytes, lane.ms), 0);
      if (speed > 0) return resolve(speed);
      reject(error ?? new Error('no data'));
    };

    const push = (lane, size) => {
      if (finished) return;
      if (stopping || sent >= maxBytes) {
        stopping = true;
        if (requests.size === 0) finish();
        return;
      }
      const began = Date.now();
      const req = lib.request({
        method: 'POST', protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, agent,
        path: `${url.pathname.replace(/\/$/, '')}/__up`,
        headers: { 'content-type': 'application/octet-stream', 'content-length': size, 'user-agent': 'system-monitor-pro' },
      }, (res) => {
        res.resume();
        res.on('end', () => {
          requests.delete(req);
          const took = Date.now() - began;
          if (res.statusCode !== 200) return finish(new Error(`status ${res.statusCode}`));
          sent += size;
          // The first request of a connection pays for opening it, so it is kept apart.
          if (lane.warm === 0 && began - started < warmupMs) {
            lane.warm += size;
            lane.warmMs += took;
          } else {
            lane.bytes += size;
            lane.ms += took;
          }
          // A request that was quick is too small to measure a fast line, so the next is bigger.
          push(lane, took < 400 ? Math.min(UPLOAD_MAX_BYTES, size * 2) : size);
        });
      });
      requests.add(req);
      req.on('error', (error) => {
        if (!finished) finish(error);
      });
      let written = 0;
      const write = () => {
        while (written < size) {
          const part = Math.min(CHUNK, size - written);
          written += part;
          if (!req.write(payload.subarray(0, part))) {
            req.once('drain', write);
            return;
          }
        }
        req.end();
      };
      write();
    };

    stopTimer = setTimeout(() => {
      stopping = true;
      // A request still on its way is given a moment, and then what finished is what counts.
      graceTimer = setTimeout(() => finish(), graceMs);
    }, warmupMs + measureMs);
    for (const lane of lanes) push(lane, UPLOAD_FIRST_BYTES);
  });
}

/** The download and then the upload, one after the other so that they do not fight for the line. */
export async function runSpeedTest(options = {}) {
  const download = await measureDownload(options);
  let upload = null;
  try {
    upload = await measureUpload(options);
  } catch {
    // A line can download and refuse the upload. The download is still a result.
  }
  return { download, upload };
}
