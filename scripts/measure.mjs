// Baseline CPU/RAM cost of the System Monitor collectors, without external tools or Ulanzi Studio.
// Deliberately avoids asserting this represents real hardware performance.
import { performance } from 'node:perf_hooks';
import { Store, sample } from '../src/core.js';
import { readRam, NetworkCounter, PingWindow } from '../src/providers.js';
const iterations=10000;
const store=new Store();
const net=new NetworkCounter();
const ping=new PingWindow(20);
const memBefore=process.memoryUsage().rss;
const cpuBefore=process.cpuUsage();
const start=performance.now();
for(let i=0;i<iterations;i++){
  store.put(readRam());
  store.put([sample('cpu.usage',i%100,'synthetic')]);
  store.get('cpu.usage');
  net.update({rx:i*1024,tx:i*2048,at:1000+i*1000});
  ping.update(20+i%20);
}
const elapsed=performance.now()-start,usage=process.cpuUsage(cpuBefore);
const memAfter=process.memoryUsage().rss;
console.log('System Monitor Pro synthetic collector benchmark (NOT Studio/D200 telemetry)');
console.log('Operations: '+iterations);
console.log('Elapsed: '+elapsed.toFixed(1)+' ms');
console.log('CPU: '+((usage.user+usage.system)/1000).toFixed(1)+' ms');
console.log('RSS before: '+(memBefore/1048576).toFixed(1)+' MiB');
console.log('RSS after: '+(memAfter/1048576).toFixed(1)+' MiB');
console.log('External hardware/FPS providers and actual device performance: NOT VERIFIED');
