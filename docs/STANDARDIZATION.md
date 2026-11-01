# Clima Pro parity checklist

Reference: Weslley08/ulanzi-deck-clima-pro (gate.yml, delivery.yml, scripts/flow.mjs, scripts/setup-github.mjs, CLAUDE.md).

Implemented: gate workflow naming; branch-flow rules for PRs; 3-OS tests; weekly scans; actionlint; CodeQL; dependency review; Dependabot; Node 20.12.2; PR template; preliminary delivery workflow.

**NOT YET PARITY / BLOCKERS**: Clima Pro's automatic PR progression, release branch creation, signed/versioned package, real SDK lock and hash validation, package smoke, secret scan, coverage floor, memory/CPU measurements, validation environment, AUTOMATION_TOKEN secret, protected main/develop/release branches, live hardware tests. Gate currently tests development code, not a verified installable artifact.

Keep auto-publication OFF. Do not declare release-ready or merge to main merely because checks pass. Implement equivalents of every missing Clima Pro gate before switching on delivery.
