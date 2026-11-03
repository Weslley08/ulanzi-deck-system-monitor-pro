// Preloaded by scripts/measure.mjs: answers with this process's own CPU and memory use,
// which works the same on every OS without a native dependency.
process.on('message', (message) => {
  if (message !== 'metrics') return;
  const cpu = process.cpuUsage();
  const memory = process.memoryUsage();
  process.send({ cpuMs: (cpu.user + cpu.system) / 1000, rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external });
});
