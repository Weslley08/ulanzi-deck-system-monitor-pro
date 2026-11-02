# Implementation

## What a key is

Each key shows one reading: the group and what it measures on top, the number big in the middle, a bar below it, and a faint graph of the last two minutes behind. At a warning or critical level (CPU and GPU temperature, CPU and RAM usage, ping, loss) the ring and the number turn yellow or red and a mark appears, so color is never the only sign. A reading that is missing says N/D and why on the key ("LHM closed", "Not set up", "No game", "Measuring"), and is never drawn as zero. The panel lets a key choose its color and hide the graph, and says what the key is waiting for.

`docs/keys.png` shows every state. It is made by `npm run build:assets` from the same code the keys use, with made-up readings.

## Where the readings come from

| Source | Metrics | What it needs |
|---|---|---|
| Memory | `ram.*` | Nothing |
| LibreHardwareMonitor | `cpu.*`, `gpu.*` | It running, with Options > Remote Web Server > Run. The plugin reads `http://127.0.0.1:8085/data.json`, loopback only |
| Network counters | `network.download`, `network.upload` | Windows. One PowerShell stays up and answers a reading in under a millisecond; it counts physical adapters only, so a VPN does not count the same traffic twice |
| Ping | `network.ping`, `network.jitter`, `network.loss` | Nothing. One `ping.exe` every 2 s, to 1.1.1.1 |
| PresentMon | `fps.*` | A CSV file PresentMon writes, named in `PRESENTMON_CSV` |

`LHM_JSON_URL` (empty turns LibreHardwareMonitor off), `PRESENTMON_CSV` and `PING_TARGET` are environment variables of the plugin's process.

Each source runs only while a key on the deck reads it, and stops when the last one leaves. A source that fails is asked less and less often, up to every 15 s for LibreHardwareMonitor, and comes back by itself.

## What the sensors are matched on

Sensors are found by their hardware (`/intelcpu`, `/amdcpu`, `/gpu-nvidia`, `/gpu-amd`), their type and their name, read from LibreHardwareMonitor's source. When there are two graphics cards, the discrete one is used. The matching is tested against trees written by hand in `tests/providers.test.mjs`. It has not been run against a real LibreHardwareMonitor, so a sensor named differently on some hardware shows "No sensor" until its name is added.

## Cost

`npm run measure` runs the real plugin against a fake host and a fake LibreHardwareMonitor whose numbers move on every request, so it is a worst case for redrawing. Its numbers go in each release's notes. The network reader is a separate PowerShell process, and is measured apart.

## Not done

RTSS, anti-flicker beyond the hysteresis on levels, a choice of ping server in the panel, and anything on a real deck or in the real Ulanzi Studio. See `docs/VERIFY.md`.
