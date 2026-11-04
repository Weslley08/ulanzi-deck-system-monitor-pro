# Store listing

Art and text for the stores. Generate the art with `npm run build:assets`.

Before each submission to the official marketplace, read its current guidelines and form again, because they change. Nobody has done that for this plugin yet.

## Community Store

The unofficial [Ulanzi Community Store](https://ulanzicommunitystore.narlei.com) reads [`store.json`](../store.json) at the root, and `en.json` in the plugin folder, from `main`. Every plugin here must have the `store.json` and the art it names. A test checks that, because a referenced image that does not exist rejects the listing.

- `cover` and `screenshots` are paths from the root of the repository.
- **The store only shows `longDescription` in languages the plugin has no file for.** In English and Portuguese it shows `Description` from `en.json` and `pt_BR.json`. So `longDescription` starts in Portuguese, with English after it, and is plain text: line breaks show, Markdown does not.
- Say that LibreHardwareMonitor loads a driver some anti-cheats block, and that the speed test costs up to about 240 MB each time. Both are in the long description, and a test checks them.
- It rebuilds its catalog at least once a day from the default branch and the `latest` release, so changes here go out with the next release.
- This plugin is not listed there yet.
