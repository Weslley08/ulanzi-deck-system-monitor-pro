# System Monitor Pro

Follow the Ulanzi plugin skill and treat `Weslley08/ulanzi-deck-clima-pro` as authoritative for engineering conventions, workflows and release safety.

**Mandatory:** maintain full branch flow work -> develop -> release/vX.Y.Z -> main; Node 20.12.2; pinned unmodified SDK; deterministic packaging; cross-platform tests; performance measurements; periodic security scanning; review before release.

**Project-specific:** exactly the eleven readings the maintainer chose, and every usage is a percentage: CPU, GPU and video memory, memory, disk usage, the CPU and GPU temperatures, ping, jitter, packet loss, and the speed test (download and upload in one key, in Mbps; the maintainer lifted the earlier "no network speed" rule on 2026-11-03). No frame rate, clock or power. The ping and the speed test run at a pace each key sets, and the speed test costs up to about 240 MB each time it runs, so it never starts by itself faster than its key says and its last result stands until the next. It uses Cloudflare's public speed servers: nobody has read their terms for this use, so do not claim they allow it, and reread them before a submission. The plugin is Windows only for now, by the maintainer's choice, and reads NVIDIA and AMD cards. The maintainer plays with kernel anti-cheats, so nothing may load a driver by default: LibreHardwareMonitor, which does, is only the reserve for an AMD card and for a PC with no thermal zone, and the panel and the store text say to close it before such a game. Never claim anti-cheat compatibility without evidence. Missing data must render N/D with the reason.

**Current state:** working prototype, never run in Studio or on a deck. See docs/STANDARDIZATION.md, docs/IMPLEMENTATION.md and docs/VERIFY.md. NEVER claim package or CI readiness just because files exist. Publishing is always on (no variable turns it off since 2026-11-04), so merging a release into `main` publishes it and cannot be taken back. This plugin has never run in Studio or on a deck, so say so in the release notes and check the boxes of the pull request for real.

**Easy to break:**
- The plugin folder is the only source: there is no `src/`. Tests import from `com.ulanzi.systemmonitorpro.ulanziPlugin/plugin`.
- Names, tooltips and the language files come from `scripts/lib/actions.mjs` through `npm run build:assets`, in the order of `METRICS` in `plugin/core.js`. A test fails when they drift. Studio matches the language files by position.
- Key images must be full data URIs. Devices silently ignore bare base64, and Studio's preview hides the bug.
- A provider runs only while a key needs it. Never start one at load: the smoke test and a deck with no keys must cost nothing.
- A metric lists its sources in order of preference in `plugin/core.js`, and the monitor asks the next one only while the first cannot answer. LibreHardwareMonitor must never be the first source.
- Graphics cards and drives are told apart by the `scope` of a reading, which is the card's name or the drive's letter, and the same card from two sources must get the same name.
- Thresholds in `plugin/defaults.json` are keyed by metric id. A mismatched key never warns, and nothing reports it.
- `report()` in `plugin/app.js` is the only output that reaches Studio's log, so never pass it an address, a path or an answer from a provider.
- `ulanzi-api/` and `libs/` are verbatim SDK copies pinned in `sdk-lock.json`.
- The sensor names were read from LibreHardwareMonitor's source and tested against hand-written trees. A real run may need more names. The thermal zone follows the processor on the author's laptop but was not compared with a package sensor, nvidia-smi never ran for real where this was developed, and nothing AMD was ever read.
