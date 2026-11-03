// Stands in for nvidia-smi: it ignores its arguments and prints one line for each card every 100 ms.
// FAKE_NVIDIA_MODE: "two" has two cards, "text" prints an error message as the real one does, "exit" leaves at once,
// "na" has no sensors.
const mode = process.env.FAKE_NVIDIA_MODE ?? 'normal';
const lines = {
  normal: ['0, NVIDIA GeForce RTX 3080, 91, 72, 6144, 12288'],
  two: ['0, NVIDIA GeForce RTX 3080, 91, 72, 6144, 12288', '1, NVIDIA GeForce GTX 1060, 3, 40, 500, 6144'],
  same: ['0, NVIDIA T4, 10, 50, 1000, 16000', '1, NVIDIA T4, 20, 60, 2000, 16000'],
  na: ['0, NVIDIA GeForce RTX 3080, [N/A], [N/A], [N/A], [N/A]'],
  text: ['NVIDIA-SMI has failed because it could not communicate with the NVIDIA driver.'],
}[mode] ?? [];
if (mode === 'exit') process.exit(3);
setInterval(() => process.stdout.write(`${lines.join('\n')}\n`), 100);
