# Implementation v0.1
Initial providers: LibreHardwareMonitor HTTP JSON on localhost, PresentMon existing CSV, RAM, Windows network counters, ICMP ping/jitter/loss, and metric title rendering. 20 Ulanzi action definitions.

**Not installable yet**: the official Ulanzi Node SDK must be copied into plugin/ulanzi-api; the runtime source and configuration must be bundled inside the .ulanziPlugin directory. This remains a development prototype and does not include RTSS integration, Property Inspector, color rendering, anti-flicker hysteresis, sensor fixtures, or Studio/D200 device tests.

Environment: LHM_JSON_URL, PRESENTMON_CSV, PING_TARGET. FPS CSV parser is provisional and re-reads whole file (not appropriate for prolonged capture); no FPS guarantees for protected games. Ping targets are outside game server unless configured otherwise. Sensors are best-effort and need real-device mapping. Do not distribute third-party binaries until licenses reviewed.
