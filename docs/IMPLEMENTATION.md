# Implementation

## What a key is

Nine readings, and only these. Every usage is a percentage of use. Each key shows one: the group and what it measures on top, the number big in the middle, a bar below it, and a faint graph of the last two minutes behind. At a warning or critical level (usage and temperatures, video memory, ping, loss) the ring and the number turn yellow or red and a mark appears, so color is never the only sign. A reading that is missing says N/D and why on the key ("LHM closed", "No sensor", "Measuring"), and is never drawn as zero. The panel lets a key choose its color and hide the graph, and says what the key is waiting for.

`docs/keys.png` shows every state. It is made by `npm run build:assets` from the same code the keys use, with made-up readings.

## Where the readings come from

Every reading except ping and packet loss comes from **LibreHardwareMonitor**, which the user runs by hand, as administrator, with Options > Remote Web Server > Run. The plugin reads its web server, `http://127.0.0.1:8085/data.json`, loopback only, with one request a second that serves every key. Ping and packet loss come from `ping.exe` every 2 s, to 1.1.1.1, and need nothing.

| Reading | LibreHardwareMonitor sensor |
|---|---|
| CPU usage | `/intelcpu` or `/amdcpu`, Load "CPU Total" |
| CPU temperature | Temperature "CPU Package", else "Core (Tctl/Tdie)", "Core (Tdie)", "Core (Tctl)", "Core Max", "Core Average" |
| GPU usage, GPU temperature | `/gpu-*`, "GPU Core", Load and Temperature. With two cards, NVIDIA over AMD over Intel |
| Video memory usage | Load "GPU Memory", else "GPU Memory Used" over "GPU Memory Total" |
| Memory usage | `/ram`, Load "Memory" |
| Disk usage | Storage, Load "Total Activity", the busiest disk. "Used Space" is how full the disk is, and is not used |

The names were read from LibreHardwareMonitor's source and are tested against trees written by hand in `tests/providers.test.mjs`. The sensor for memory could not be confirmed in the source, and nothing has run against a real LibreHardwareMonitor. A sensor that is not there gives "No sensor".

### A cost to know about

LibreHardwareMonitor loads a driver to read the hardware, and some game anti-cheats block it (FACEIT is confirmed to). The maintainer plays with such anti-cheats, so the plugin says so in its panel and its store text, and every key but ping and loss reads N/D while it is closed. An earlier version of this branch read the graphics card from nvidia-smi and the disk from a Windows counter, which load no driver; the maintainer chose to move everything to LibreHardwareMonitor instead.

### Settings by environment variable

`LHM_JSON_URL` (empty turns LibreHardwareMonitor off) and `PING_TARGET`.

A provider runs only while a key on the deck reads it, and stops when the last one leaves. LibreHardwareMonitor is asked less and less often while it does not answer, up to every 15 s, and the plugin comes back by itself when it does.

## Cost

`npm run measure` runs the real plugin against a fake host and a fake LibreHardwareMonitor whose numbers move on every request, the worst case for redrawing. Its numbers go in each release's notes. There is no process besides the plugin's own, and the ping.

## Not done

AMD and Intel specific readings, frames per second, clock, power, network speed and everything else that is not in the list above were taken out on purpose. Nothing has run on a real deck or in the real Ulanzi Studio. See `docs/VERIFY.md`.
