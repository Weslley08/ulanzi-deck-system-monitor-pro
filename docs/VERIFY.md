# Manual release verification

Do not check off tests you did not run.

- [ ] Confirm manifest schema against official Ulanzi SDK.
- [ ] Load packaged plugin in Ulanzi Studio on Windows.
- [ ] The 20 actions are listed with their names, in English and in Portuguese, and each one's default key image shows.
- [ ] Validate all metrics with LHM running and absent. With it closed, the CPU and GPU keys say "LHM closed" and the memory keys keep working.
- [ ] With LHM running and its web server on, compare each CPU and GPU reading against LHM's own window. Note any key that says "No sensor".
- [ ] On a PC with two graphics cards, the keys follow the discrete one.
- [ ] Download something large: the download key agrees with Task Manager, and does not double with a VPN on.
- [ ] Validate PresentMon FPS with a game (without bypassing anti-cheat).
- [ ] Validate ping, loss, jitter and offline fallback (unplug the network: loss climbs to 100% and ping says N/D).
- [ ] Validate no duplicate loops after SDK reconnect.
- [ ] Verify dynamic icons, formatting, thresholds, hysteresis and settings.
- [ ] Take every network key off the deck: its PowerShell process leaves within a few seconds.
- [ ] Measure CPU/RAM overhead after 30 minutes and idle state, in Task Manager, including the PowerShell process.
- [ ] Inspect package contents and licenses.
- [ ] Test on actual D200 device: the text reads at arm's length, and the graph and the bar are not noise.

Current state: not verified; not release-ready.
