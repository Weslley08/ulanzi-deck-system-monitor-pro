# Contributing

You do not need a Ulanzi device to contribute. The tests run the real plugin and the real Ulanzi SDK against a fake host, and the settings panel runs in a real browser.

## Start

Fork the repository, then:

```bash
git clone https://github.com/<you>/ulanzi-deck-system-monitor-pro.git
cd ulanzi-deck-system-monitor-pro
nvm use          # Node 20.12.2, the version Ulanzi Studio runs plugins on
npm run setup
npm test
```

No WeatherAPI.com key is needed. The tests use canned replies, and pull requests from forks run the same checks without any secret.

Open a pull request against `develop`. CI runs the tests on Windows, macOS and Linux, measures coverage, builds the zip and checks it. Keep each pull request to one change.

## Commands

| Command | What it does |
|---|---|
| `npm test` | All tests. The panel tests skip if no Chromium is installed; set `CHROME_PATH` to use one. |
| `npm run test:coverage` | All tests, and fails if coverage of `plugin/` drops below the floors in `scripts/run-tests.mjs`. On Windows a plugin the tests kill writes no coverage, so `app.js` reads lower there. The panel runs in a browser, so it is not measured. |
| `npm run typecheck` | Checks the Defesa Civil modules against `alert-types.d.ts`. Nothing is built: the plugin is plain JavaScript. |
| `npm run test:live:alerts` | Checks our assumptions against the real Defesa Civil feed and lists the alerts in force. Needs no key, and downloads the feed a few times, several MB each. |
| `npm run build:assets` | Regenerates theme pictures, icons, store art and `docs/themes.png`. |
| `npm run build:glyphs` | Regenerates font outlines. Only needed for a new font or character. |
| `npm run package` | Builds `dist/com.ulanzi.systemmonitorpro.ulanziPlugin.zip`. |
| `npm run verify:package` | Checks the zip against the store checklist and starts the plugin from it. |
| `npm run measure` | CPU and memory use. Include the numbers if your change could affect them. |
| `npm run bump -- 1.2.3` | Raises the version in every file that has it. The flow does this by itself; use it for a bigger jump. |
| `npm run check:secrets`, `check:sdk`, `audit` | The security checks CI runs. |
| `WEATHERAPI_KEY=xxx npm run test:live` | Checks our assumptions against the real API, using your own key. |
| `WEATHERAPI_KEY=xxx npm run watch:updates -- London 60` | Shows how often `last_updated` moves. Spends one call a minute of your plan. |

## Adding a theme

This is the easiest way to contribute. A theme is one file that draws SVG.

1. Create `plugin/render/themes/mytheme.js`:

   ```js
   import { Theme } from '../theme.js';

   export default class MyTheme extends Theme {
     id = 'mytheme';
     fonts = { big: 'outfit-700', label: 'outfit-500' };

     palette() {
       return { bg: '#102030', ink: '#FFFFFF', sub: '#9FB3C8', accent: '#FFD24A' };
     }

     iconStyle() {
       return { mode: 'stroke', strokeWidth: 3, knockout: '#102030', colors: { /* see minimal.js */ } };
     }
   }
   ```

   That is enough for both screens. Override `now`, `details` or `background` for your own layout.
2. Register it in `plugin/render/themes/index.js`.
3. Add it to the gallery in `property-inspector/weather/inspector.html`, and its name to every language file.
4. Run `npm run build:assets`, then look at your row in `docs/themes.png`.
5. Run `npm test`. It draws every condition, screen and extreme value in your theme and fails on anything broken.

Keep text as drawn outlines through `this.label` and `this.bigTemp`. That is what stops a place name from the API from injecting markup, and it means the plugin needs no fonts at runtime.

Fonts must have a license that allows bundling, recorded in `THIRD_PARTY_NOTICES.md`.

## Rules the code depends on

- **The API key stays out of logs, errors, URLs we print and per-key settings.** Only `weather-api.js` puts it in a URL. It is saved in global settings because a key's own settings could travel in a shared profile.
- **Spend the user's machine and quota carefully.** Nothing polls while no key is on screen, keys showing one place share one request, and an unchanged image is not sent again. The API's `last_updated` sets when to ask next, so there is no refresh setting.
- **Weather data lives in memory for at most 60 minutes.** WeatherAPI.com's terms set that limit on current conditions.
- **Every failed press calls `showAlert`.** The store guidelines require it.
- **An alert never replaces the forecast by itself, and a failed check never reads as "no alerts".** Only Defesa Civil entries from the IDAP feed count. See [docs/DEFESA-CIVIL.md](docs/DEFESA-CIVIL.md).
- **Do not edit `libs/` or `plugin/ulanzi-api/`.** They are verbatim copies of the Ulanzi SDK pinned in `sdk-lock.json`, and CI fails if they change. To update them, review the upstream diff, copy the files, run `node scripts/check-sdk.mjs --write`, and update the commits in the lock file.
- **Runtime dependencies need a good reason.** Each one ships to every user. No install scripts and no native binaries.

## Trying it for real

**On a device**, follow [docs/VERIFY.md](docs/VERIFY.md).

**In the official simulator**, note that as of commit `550ab80` it crashes when a plugin uses global settings, because of two undefined variables in `UlanziDeckSimulator/server/clients.js`. Fix your local copy by adding one line at the start of each handler:

```js
if(data.cmd === 'setGlobalSettings'){
  const context = utils.encodeContext(data); const oldParam = data.settings;   // add this
  ...
if(data.cmd === 'getGlobalSettings'){
  const context = utils.encodeContext(data); const { uuid, actionid, key } = data;   // add this
```

Then copy the plugin folder into the simulator's `plugins/` folder and start the main service with the simulator's port:

```bash
node plugin/app.js 127.0.0.1 39069 en
```

## How a change ships

```
feature/*, fix/*, chore/*...  ->  develop  ->  release/vX.Y.Z  ->  main
```

A person merges at each arrow, and the rest happens by itself, in two workflows:

- **Gate** (`gate.yml`) decides whether a change may merge: the branch rules, workflow lint, tests, coverage, the zip, known vulnerabilities, CodeQL and dependency review. It also runs each week. Its **Branch flow** check refuses a pull request that skips a step, and the rest waits for that check.
- **Delivery** (`delivery.yml`) moves the change along: it opens the pull requests, builds and validates a release, creates the draft and publishes it.

1. **Push a branch** named `feature/`, `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`, `build/` or `perf/`. Its pull request to `develop` opens by itself, unless you closed an earlier one. From a fork, open it by hand. The Gate must pass.
2. **Merge into `develop`.** If the version there is already released, or too low for what merged, a `bump/` pull request raises it and merges itself: a new feature raises the second number, and anything else the third. Then a pull request from `develop` to `release/vX.Y.Z` opens, and later merges join it.
3. **Merge into `release/vX.Y.Z`.** This is the approval, because GitHub does not let a person approve a pull request in their own name. The zip is built once and must start on Windows and macOS, the WeatherAPI.com and Defesa Civil tests run against the real services, and `npm run measure` runs. If all of that passes, a draft release gets the zip, its checksum and the numbers, and a pull request to `main` opens.
4. **Test the draft's zip** with [docs/VERIFY.md](docs/VERIFY.md) and put the result under "Technical details" in the draft's notes. Replace the top of the notes with what changes for customers, because the Community Store shows them the whole text. Then tick both boxes in the pull request.
5. **Merge into `main`.** The draft is published as the final release, its tag is created on the commit that was validated, the release branch goes away, and the `latest` branch follows. The release is public from that moment, and it reaches Community Store users as an update.

A tag, its release and the plugin all carry the same number. `Version` in `manifest.json` is the source: the settings panel shows it at the bottom as `Clima Pro v1.2.3`, so a user can tell which release they run.

- **A problem in the draft:** fix it in a new branch and go through `develop` again. The new merge into the release branch validates again, replaces the zip and the technical details, keeps the text you wrote above them, and clears the boxes. No tag has to move, because a draft has none yet.
- **A problem after publishing:** the next version fixes it. A number is never reused, and an older version is never published after a newer one, because the Community Store orders by publish date and would show it as current.
- **A release that stayed a draft after the merge:** the Delivery run fails if the top of the notes was not written. Write it and run that job again.
- **Something that reached `main` directly:** a pull request from `main` to `develop` opens and merges itself, and asks for no new version.
- **Merge commits only:** the repository allows no other kind, because the flow reads the merged branches from them and the release branch must end up inside `main`.
- **Dependabot:** its security updates always open against `main`, whatever the configuration says, so change their base to `develop`.

### Setup for the maintainer

Each of these is needed once, and a step that lacks a secret fails and names it.

- **Settings:** `npm run setup:github` protects `develop`, `main` and `release/v*`, allows merge commits only, turns on auto-merge and creates the environment below. Add `-- --dry-run` to see the changes first. Run it again after renaming a required check.
- **`AUTOMATION_TOKEN`:** a [fine-grained token](https://github.com/settings/personal-access-tokens/new) for this repository only, with read and write on **Contents** and **Pull requests**. A pull request opened with the workflow's own token leaves the Gate waiting for a click on "Approve workflows to run". Set it with `gh secret set AUTOMATION_TOKEN`, and again when it expires.
- **`WEATHERAPI_KEY`:** a WeatherAPI.com key for the live tests, about 40 calls per validation. Set it with `gh secret set WEATHERAPI_KEY --env release-validation`. That environment only gives it to `release/v*` branches.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).
