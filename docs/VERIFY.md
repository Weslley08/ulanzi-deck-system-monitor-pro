# Manual release verification

Do not check off tests you did not run.

- [ ] Confirm manifest schema against official Ulanzi SDK.
- [ ] Load packaged plugin in Ulanzi Studio on Windows.
- [ ] The 10 actions are listed with their names, in English and in Portuguese, and each one's default key image shows.
- [ ] CPU usage and memory usage agree with Task Manager.
- [ ] On a PC with an NVIDIA card: GPU usage, GPU temperature and video memory usage agree with `nvidia-smi` and Task Manager. Note where `nvidia-smi.exe` lives on that PC: the plugin looks in `System32`, in `NVIDIA Corporation\NVSMI` and in the PATH.
- [ ] On a PC without NVIDIA, the GPU keys say "No NVIDIA" and nothing else breaks.
- [ ] The disk usage key agrees with Task Manager's "Active time" for the disks. Its PowerShell process leaves within a few seconds of the key leaving the deck.
- [ ] Ping and loss: unplug the network, and loss climbs to 100% and ping says N/D.
- [ ] With LHM closed, the CPU and disk temperature keys say "LHM closed" and every other key keeps working.
- [ ] With LHM running as administrator and its web server on, compare both temperatures against LHM's own window. Note a key that says "No sensor", and send the names in `/data.json`.
- [ ] Start a game with an anti-cheat that blocks drivers, with LHM closed, and confirm the plugin alone causes no complaint.
- [ ] Validate no duplicate loops after SDK reconnect.
- [ ] Verify thresholds, hysteresis, colors and the graph on a real deck.
- [ ] Measure CPU/RAM overhead after 30 minutes and idle state, in Task Manager, including the PowerShell and nvidia-smi processes.
- [ ] Inspect package contents and licenses.
- [ ] Test on actual D200 device: the text reads at arm's length, and the graph and the bar are not noise.

Current state: not verified; not release-ready.
