# Manual release verification

Do not check off tests you did not run.

- [ ] Confirm manifest schema against official Ulanzi SDK.
- [ ] Load packaged plugin in Ulanzi Studio on Windows.
- [ ] Validate all metrics with LHM running and absent.
- [ ] Validate PresentMon FPS with a game (without bypassing anti-cheat).
- [ ] Validate ping, loss, jitter, network rates and offline fallback.
- [ ] Validate no duplicate loops after SDK reconnect.
- [ ] Verify dynamic icons, formatting, thresholds, hysteresis and settings.
- [ ] Measure CPU/RAM overhead after 30 minutes and idle state.
- [ ] Inspect package contents and licenses.
- [ ] Test on actual D200 device.

Current state: not verified; not release-ready.
