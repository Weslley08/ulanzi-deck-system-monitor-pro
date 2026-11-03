# Manual release verification

Do not check off tests you did not run.

- [ ] Confirm manifest schema against official Ulanzi SDK.
- [ ] Load packaged plugin in Ulanzi Studio on Windows.
- [ ] The 9 actions are listed with their names, in English and in Portuguese, and each one's default key image shows.
- [ ] CPU usage and memory usage agree with Task Manager.
- [ ] Drive usage agrees with the free space Explorer shows for C:, and the panel lists every drive. A drive that is not there says N/D.
- [ ] CPU temperature: compare the key with a tool you trust (HWiNFO, or LibreHardwareMonitor's own window) idle and under load. Note how far apart they are, and whether the thermal zone is the package, the core or something else on this PC.
- [ ] On a desktop, check that the thermal zone exists at all. If it does not, the key says so and falls back on LibreHardwareMonitor.
- [ ] On a PC with an NVIDIA card: GPU usage, GPU temperature and video memory usage agree with `nvidia-smi` and Task Manager. Note where `nvidia-smi.exe` lives: the plugin looks in `System32`, in `NVIDIA Corporation\NVSMI` and in the PATH.
- [ ] On a PC with two cards (an integrated one and an NVIDIA or AMD one): the panel lists both, "Automatic" picks the discrete one, and each key can be set to either.
- [ ] On a PC with an AMD card: with LibreHardwareMonitor closed the GPU keys say "Needs LHM". With it open as administrator, with Options > Remote Web Server > Run, they show numbers within about 15 seconds. Note any key that says "No sensor", and send the names in `/data.json`.
- [ ] Ping and loss: unplug the network, and loss climbs to 100% and ping says N/D.
- [ ] Take every processor temperature key off the deck: its PowerShell process leaves within a few seconds. Do the same with the NVIDIA keys and nvidia-smi.
- [ ] Start a game with an anti-cheat that blocks drivers, with LibreHardwareMonitor closed, and confirm the plugin alone causes no complaint. Check the game's own rules before ever running it together with LibreHardwareMonitor.
- [ ] Validate no duplicate loops after SDK reconnect.
- [ ] Verify thresholds, hysteresis, colors and the graph on a real deck.
- [ ] Measure CPU/RAM overhead after 30 minutes and idle state, in Task Manager, including the PowerShell and nvidia-smi processes.
- [ ] Inspect package contents and licenses.
- [ ] Test on actual D200 device: the text reads at arm's length, and the graph and the bar are not noise.

Current state: not verified; not release-ready.
