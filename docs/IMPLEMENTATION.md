# Implementation

## What a key is

Nine readings, and only these. Every usage is a percentage of use. Each key shows one: the group and what it measures on top, the number big in the middle, a bar below it, and a faint graph of the last two minutes behind. At a warning or critical level (usage and temperatures, video memory, ping, loss) the ring and the number turn yellow or red and a mark appears, so color is never the only sign. A reading that is missing says N/D and why on the key ("LHM closed", "No NVIDIA", "Measuring"), and is never drawn as zero. The panel lets a key choose its color, hide the graph, and, for the graphics card keys and the drive key, choose which card or drive it reads. It also says what the key is waiting for.

The plugin is **Windows only** for now, by the maintainer's choice, and reads **NVIDIA and AMD** cards.

`docs/keys.png` shows every state. It is made by `npm run build:assets` from the same code the keys use, with made-up readings.

## Where the readings come from

Each reading has sources in order of preference. The first that has a fresh reading wins, and the next is asked only while the first cannot answer.

| Reading | First source | Reserve | What the first one needs |
|---|---|---|---|
| CPU usage, memory usage | Node itself (`os`) | none | Nothing |
| Drive usage | Node itself (`fs.statfs`), how full the drive is, for every drive letter that answers | none | Nothing |
| Ping, packet loss | `ping.exe`, every 2 s, to 1.1.1.1 | none | Nothing |
| CPU temperature | The Windows thermal zone, a performance counter read by one PowerShell that stays up | LibreHardwareMonitor | No driver and no administrator, but a PC that has a thermal zone |
| GPU usage, GPU temperature, video memory usage | `nvidia-smi`, one process that stays up and prints a line a second for every NVIDIA card | LibreHardwareMonitor | An NVIDIA card and its driver, which ships `nvidia-smi`. It loads no driver |

**An AMD card has no first source.** Windows gives its usage and video memory through performance counters, but not its temperature, and the total video memory needed for a percentage is not in the counters. Reading it without a driver would take AMD's own library, which could not be tried here, so an AMD card is read from LibreHardwareMonitor.

### Several cards and drives

Every NVIDIA card is reported under its name, and LibreHardwareMonitor's cards under theirs, so the same card from both sources is one card. Two cards with the same name are told apart by their number. A graphics card key reads the card chosen in its panel, or, when left on "Automatic", the discrete one (NVIDIA over AMD over the rest). A drive key reads the drive chosen in its panel, or the one Windows runs from. A key whose chosen card or drive is not there says N/D.

### The thermal zone

The ACPI thermal zones are exposed as the counter "Thermal Zone Information", and the hottest zone is shown. On the author's laptop (Core Ultra 7 155H) it read 58 to 61 °C idle, rose to 100 °C with every core busy, and fell back as it cooled, so it follows the processor. It was **not** compared with a package sensor, its resolution is one degree, and what a zone stands for is up to the PC's firmware: a desktop may expose only a motherboard zone, or none, in which case the key falls back on LibreHardwareMonitor. The first answer takes about 5 s, while PowerShell starts, and the next ones 2 ms.

### LibreHardwareMonitor, only the reserve

It is asked only while no first source can answer: for an AMD card, or for the processor temperature on a PC with no thermal zone. It is the one source that loads a driver, and some game anti-cheats block that driver (FACEIT is confirmed to), so the panel and the store text say to close it before such a game. The maintainer plays with such games, which is why nothing depends on it first. It needs LibreHardwareMonitor running as administrator, with Options > Remote Web Server > Run, and the plugin reads `http://127.0.0.1:8085/data.json`, loopback only.

Its sensors are found by hardware (`/intelcpu`, `/amdcpu`, `/gpu-*`), type and name, read from its source and tested against trees written by hand in `tests/providers.test.mjs`. It has never been read from a real LibreHardwareMonitor.

### Settings by environment variable

`LHM_JSON_URL` (empty turns the reserve off) and `PING_TARGET`. For tests and `npm run measure`, `NVIDIA_SMI` and `NVIDIA_SMI_ARGS` (a JSON list) stand in for nvidia-smi.

A provider runs only while a key on the deck reads it, and stops when the last one leaves. A source that fails is asked less and less often, and the plugin comes back by itself. nvidia-smi is started again after 2 s, then 4, up to 30 s, unless it is not installed.

## Cost

`npm run measure` runs the real plugin against a fake host and a program that prints what nvidia-smi prints. The thermal reader is a separate PowerShell process, about 87 MB, and is measured apart. It only exists while a processor temperature key is on the deck.

## Not done

AMD readings without a driver, frames per second, clock, power, network speed, disk temperature and everything else that is not in the list above were taken out or never added on purpose. macOS and Linux are out of scope for now. Nothing has run on a real deck or in the real Ulanzi Studio. See `docs/VERIFY.md`.
