# Manual release verification

Do not check off tests you did not run.

- [ ] Confirm manifest schema against official Ulanzi SDK.
- [ ] Load packaged plugin in Ulanzi Studio on Windows.
- [ ] The 10 actions are listed with their names, in English and in Portuguese, and each one's default key image shows.
- [ ] Open LibreHardwareMonitor as administrator, turn on Options > Remote Web Server > Run, and open `http://127.0.0.1:8085/data.json` in a browser: it lists sensors.
- [ ] With LHM running, each key agrees with LHM's own window: CPU usage and temperature, GPU usage and temperature, video memory, memory, disk usage and temperature. Note any key that says "No sensor", and send the names in `/data.json`. Memory is the sensor most likely to need a name.
- [ ] Disk usage agrees with Task Manager's "Active time" for the busiest disk, and is not how full the disk is.
- [ ] With LHM closed, every key but ping and loss says "LHM closed", and ping and loss keep working.
- [ ] Open LHM again: the keys come back by themselves within about 15 seconds.
- [ ] Ping and loss: unplug the network, and loss climbs to 100% and ping says N/D.
- [ ] On a PC with two graphics cards, the keys follow the discrete one.
- [ ] Start a game with an anti-cheat that blocks drivers, with LHM closed, and confirm the plugin alone causes no complaint. Then check that the game's own rules allow LHM, before ever running them together.
- [ ] Validate no duplicate loops after SDK reconnect.
- [ ] Verify thresholds, hysteresis, colors and the graph on a real deck.
- [ ] Measure CPU/RAM overhead after 30 minutes and idle state, in Task Manager, including LibreHardwareMonitor itself.
- [ ] Inspect package contents and licenses.
- [ ] Test on actual D200 device: the text reads at arm's length, and the graph and the bar are not noise.

Current state: not verified; not release-ready.
