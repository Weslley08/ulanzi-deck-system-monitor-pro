# System Monitor Pro

Follow the Ulanzi plugin skill and treat `Weslley08/ulanzi-deck-clima-pro` as authoritative for engineering conventions, workflows and release safety.

**Mandatory:** maintain full branch flow work -> develop -> release/vX.Y.Z -> main; Node 20.12.2; pinned unmodified SDK; deterministic packaging; cross-platform tests; performance measurements; periodic security scanning; review before release.

**Project-specific:** exactly nine readings, chosen by the maintainer, and every usage is a percentage: CPU, GPU and video memory, memory, ping, packet loss, disk usage, and the CPU and GPU temperatures. No frame rate, clock, power or network speed. Every reading but ping and loss comes from LibreHardwareMonitor, by the maintainer's choice, although it loads a driver that some game anti-cheats block and the maintainer plays with such games: say so wherever the plugin is described, and never claim anti-cheat compatibility without evidence. Missing data must render N/D with the reason.

**Current state:** working prototype, never run in Studio or on a deck. See docs/STANDARDIZATION.md, docs/IMPLEMENTATION.md and docs/VERIFY.md. NEVER claim package or CI readiness just because files exist. Auto-release disabled.

**Easy to break:**
- The plugin folder is the only source: there is no `src/`. Tests import from `com.ulanzi.systemmonitorpro.ulanziPlugin/plugin`.
- Names, tooltips and the language files come from `scripts/lib/actions.mjs` through `npm run build:assets`, in the order of `METRICS` in `plugin/core.js`. A test fails when they drift. Studio matches the language files by position.
- Key images must be full data URIs. Devices silently ignore bare base64, and Studio's preview hides the bug.
- A provider runs only while a key needs it. Never start one at load: the smoke test and a deck with no keys must cost nothing.
- One request of LibreHardwareMonitor serves every key. Do not add a second source for a reading without the maintainer asking: they moved everything to it on purpose.
- Thresholds in `plugin/defaults.json` are keyed by metric id. A mismatched key never warns, and nothing reports it.
- `report()` in `plugin/app.js` is the only output that reaches Studio's log, so never pass it an address, a path or an answer from a provider.
- `ulanzi-api/` and `libs/` are verbatim SDK copies pinned in `sdk-lock.json`.
- The sensor names were read from LibreHardwareMonitor's source and tested against hand-written trees. A real run may need more names, and the memory sensor was not confirmed in its source.
