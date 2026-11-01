# System Monitor Pro

Follow the Ulanzi plugin skill and treat `Weslley08/ulanzi-deck-clima-pro` as authoritative for engineering conventions, workflows and release safety.

**Mandatory:** maintain full branch flow work -> develop -> release/vX.Y.Z -> main; Node 20.12.2; pinned unmodified SDK; deterministic packaging; cross-platform tests; performance measurements; periodic security scanning; review before release.

**Project-specific:** hardware via LibreHardwareMonitor, frame metrics via PresentMon/RTSS where supported, network counters and ICMP ping with configurable hosts. Prefer a single shared collector and stable UI. Missing data must render N/D. Do not promise FPS readings for protected games or claim anti-cheat compatibility without evidence.

**Current state:** prototype. See docs/STANDARDIZATION.md. Copied scripts may still reference Clima Pro-specific fixtures and MUST be adapted, tested and validated before use. NEVER claim package or CI readiness just because files exist. Auto-release disabled.
