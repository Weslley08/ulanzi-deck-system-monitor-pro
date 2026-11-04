# Contributing — System Monitor Pro

## Workflow
Follow the same branch model as Clima Pro: `feature/*`, `fix/*` or another allowed work prefix -> `develop` -> `release/vX.Y.Z` -> `main`. Do not commit code directly to main.

## Development
Use Node 20.12.2. Install dependencies using lockfiles. Run `npm test`, `npm run check`, security scan, packaging and verification once implemented. Declare what was actually tested in every PR.

## Quality and security
Keep the SDK as pinned verbatim upstream code; verify hashes. Never expose keys or run third-party binaries silently. Do not collect user browsing data or transmit telemetry externally. Do not treat zero values as valid missing readings.

## Release
Before release, execute `docs/VERIFY.md` in Ulanzi Studio and physical D200, confirm CPU/RAM overhead and dependencies/licenses, and validate the distributable ZIP. No release is approved from a green CI alone. Publishing is always on, so merging a release into `main` publishes it. That checklist is the last check, and a green CI never replaces it.

Read `docs/STANDARDIZATION.md` for the open migration blockers.
