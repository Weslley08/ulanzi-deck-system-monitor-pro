# System Monitor Pro

Follow the Ulanzi plugin skill and treat `Weslley08/ulanzi-deck-clima-pro` as authoritative for engineering conventions, workflows and release safety.

**Mandatory:** maintain full branch flow work -> develop -> release/vX.Y.Z -> main; Node 20.12.2; pinned unmodified SDK; deterministic packaging; cross-platform tests; performance measurements; periodic security scanning; review before release.

**Project-specific:** hardware via LibreHardwareMonitor, frame metrics via PresentMon/RTSS where supported, network counters and ICMP ping with configurable hosts. Prefer a single shared collector and stable UI. Missing data must render N/D. Do not promise FPS readings for protected games or claim anti-cheat compatibility without evidence.

**Current state:** working prototype, never run in Studio or on a deck. See docs/STANDARDIZATION.md, docs/IMPLEMENTATION.md and docs/VERIFY.md. NEVER claim package or CI readiness just because files exist. Auto-release disabled.

**Easy to break:**
- The plugin folder is the only source: there is no `src/`. Tests import from `com.ulanzi.systemmonitorpro.ulanziPlugin/plugin`.
- Names, tooltips and the language files come from `scripts/lib/actions.mjs` through `npm run build:assets`, in the order of `METRICS` in `plugin/core.js`. A test fails when they drift. Studio matches the language files by position.
- Key images must be full data URIs. Devices silently ignore bare base64, and Studio's preview hides the bug.
- A provider runs only while a key needs it. Never start one at load: the smoke test and a deck with no keys must cost nothing, and the network reader is a 70 MB PowerShell process.
- Thresholds in `plugin/defaults.json` are keyed by metric id. A mismatched key never warns, and nothing reports it.
- `report()` in `plugin/app.js` is the only output that reaches Studio's log, so never pass it an address, a path or an answer from a provider.
- `ulanzi-api/` and `libs/` are verbatim SDK copies pinned in `sdk-lock.json`.
- The sensor names were read from LibreHardwareMonitor's source and tested against hand-written trees. A real run may need more names.
