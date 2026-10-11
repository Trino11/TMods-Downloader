# Releasing

Builds run on GitHub Actions (`.github/workflows/build.yml`) on a Windows runner.
Every pull request to `main` runs the tests (`npm test`), then builds the installer and
keeps it as a workflow artifact. The build only starts once the tests pass, so a failing
test never publishes a release.

To publish a new version:

1. Bump `version` in `package.json` (the UI reads it from there).
2. Commit, then push a matching tag, e.g. `git tag v0.3.2 && git push origin v0.3.2`.

The workflow fails if the tag does not match `package.json`. Otherwise it creates the
GitHub Release with `Tmods-Downloader.exe`, its `.blockmap` and `latest.yml`. Installed
apps check that release through electron-updater and update themselves.

# Development

The window is a React app built with [Vite](https://vite.dev); `public/electron.js` is the
Electron main process (its logic lives in `public/mainProcess.js`, tested from `test/`) and is copied into `build/` with the rest of `public/`.

- `npm run build-react` builds the app into `build/`.
- `npm run start-electron` opens Electron on that build.
- `npm start` builds once (for `build/electron.js`), then runs the Vite dev server on
  port 3000 alongside Electron, which loads the dev server, so changes reload live.
  Edits to `public/electron.js` need a restart.
- `npm test` runs the Jest tests (files in `__tests__` folders).
- `npm run lint` runs ESLint (with the React hooks rules) and checks Prettier formatting;
  CI runs it before the tests. `npm run format` fixes formatting.
- `npm run dist` packages the Windows installer into `dist/` with electron-builder.

# Modrinth

The Modrinth page searches and installs single mods for the active profile's loader and
game version, straight from the public Modrinth API (no key needed). Installed mods are
tracked per game folder in `.tmods_loader/modrinth.json`; bundle installs keep them. The
same page imports `.mrpack` modpacks as new profiles and exports a profile as one.

# Manifest

The bundle pages (Mods, Schematics, Resource packs, Configs, Shaderpacks) read the
manifest URL set on first launch. It lists zips per category:

```json
{
  "versions": {
    "mods": [
      {
        "id": "1.2.0",
        "url": "https://example.com/mods-1.2.0.zip",
        "sha256": "…",
        "target": "Fabric 1.21.1",
        "description": "Adds Sodium"
      }
    ]
  }
}
```

`sha256`, `target` (shown on the Mods page) and `description` are optional. With `sha256`, a download that doesn't match it is refused before
anything is installed.

The Home page checks every category for updates and installs the latest with one click.
An optional top-level `"latest": { "mods": "1.2.0" }` names the latest version of a
category; without it, the first version listed is taken as the latest.
