// Stands in for nvidia-smi: it ignores its arguments and prints one line for each card every 100 ms.
// FAKE_NVIDIA_MODE: "text" prints an error message as the real one does, "exit" leaves at once, "na" has no sensors.
const mode = process.env.FAKE_NVIDIA_MODE ?? 'normal';
const lines = {
  normal: ['0, 3, 40, 500, 2048', '1, 91, 72, 6144, 12288'],
  na: ['0, [N/A], [N/A], [N/A], [N/A]'],
  text: ['NVIDIA-SMI has failed because it could not communicate with the NVIDIA driver.'],
}[mode] ?? [];
if (mode === 'exit') process.exit(3);
setInterval(() => process.stdout.write(`${lines.join('\n')}\n`), 100);
