# Implementation

## What a key is

Ten readings, and only these. Every usage is a percentage of use. Each key shows one: the group and what it measures on top, the number big in the middle, a bar below it, and a faint graph of the last two minutes behind. At a warning or critical level (usage and temperatures, video memory, ping, loss) the ring and the number turn yellow or red and a mark appears, so color is never the only sign. A reading that is missing says N/D and why on the key ("LHM closed", "No NVIDIA", "Measuring"), and is never drawn as zero. The panel lets a key choose its color and hide the graph, and says what the key is waiting for.

`docs/keys.png` shows every state. It is made by `npm run build:assets` from the same code the keys use, with made-up readings.

## Where the readings come from

| Reading | Source | What it needs |
|---|---|---|
| CPU usage, memory usage | Node itself | Nothing |
| GPU usage, GPU temperature, video memory usage | `nvidia-smi`, which stays up and prints a line a second | An NVIDIA card and its driver, which ships `nvidia-smi`. With two cards, the one with the most memory is shown |
| Ping, packet loss | `ping.exe`, every 2 s, to 1.1.1.1 | Nothing |
| Disk usage | The Windows counter `PhysicalDisk % Idle Time`, read by one PowerShell that stays up | Windows. It is the heaviest reader, about 118 MB while a disk usage key is on the deck, and it is closed when the last one leaves |
| CPU temperature, disk temperature | LibreHardwareMonitor's web server, `http://127.0.0.1:8085/data.json`, loopback only | **Optional.** LibreHardwareMonitor running as administrator, with Options > Remote Web Server > Run |

### Why the two temperatures are optional

Windows has no way to read them without a driver in the kernel: WMI answers late or not at all, and the disk call (`Get-StorageReliabilityCounter`) refused to run without administrator on the author's PC. LibreHardwareMonitor loads such a driver, and some game anti-cheats block it; FACEIT is confirmed to. So nothing in the plugin needs it, and its two keys say "LHM closed" until it runs. By default it does not run.

### Settings by environment variable

`LHM_JSON_URL` (empty turns LibreHardwareMonitor off) and `PING_TARGET`. For tests, `NVIDIA_SMI` and `NVIDIA_SMI_ARGS` (a JSON list) stand in for nvidia-smi.

Each source runs only while a key on the deck reads it, and stops when the last one leaves. A source that fails is asked less and less often, up to every 15 s for LibreHardwareMonitor, and comes back by itself. nvidia-smi is started again after 2 s, then 4, up to 30 s, unless it is not installed.

## What the sensors are matched on

LibreHardwareMonitor's sensors are found by hardware (`/intelcpu`, `/amdcpu`, `/nvme`, `/hdd`), type and name, read from its source. With several disks, the hottest is shown. The matching is tested against trees written by hand in `tests/providers.test.mjs`, and has not been run against a real LibreHardwareMonitor.

## Cost

`npm run measure` runs the real plugin against a fake host, a fake LibreHardwareMonitor whose numbers move on every request, and a program that prints what nvidia-smi prints. It is a worst case for redrawing. Its numbers go in each release's notes. The disk reader is a separate PowerShell process and is measured apart.

## Not done

Graphics card readings for AMD and Intel, frames per second, clock, power, network speed and everything else that is not in the list above were taken out on purpose. Nothing has run on a real deck or in the real Ulanzi Studio. See `docs/VERIFY.md`.
