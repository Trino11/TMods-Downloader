# Releasing

Builds run on GitHub Actions (`.github/workflows/build.yml`) on a Windows runner.
Every pull request to `main` runs the tests (`npm test`), then builds the installer and
keeps it as a workflow artifact. The build only starts once the tests pass, so a failing
test never publishes a release.

To publish a new version:

1. Bump `version` in `package.json` (and `VERSION` in `src/modules/App.js`, which the UI shows).
2. Commit, then push a matching tag, e.g. `git tag v0.3.2 && git push origin v0.3.2`.

The workflow fails if the tag does not match `package.json`. Otherwise it creates the
GitHub Release with `Tmods-Downloader.exe`, its `.blockmap` and `latest.yml`. Installed
apps check that release through electron-updater and update themselves.

# Development

The window is a React app built with [Vite](https://vite.dev); `public/electron.js` is the
Electron main process and is copied into `build/` with the rest of `public/`.

- `npm run build-react` builds the app into `build/`.
- `npm run start-electron` opens Electron on that build.
- `npm start` runs the Vite dev server on port 3000 alongside Electron, which still
  loads `build/`, as before.
- `npm test` runs the Jest tests (files in `__tests__` folders).
- `npm run dist` packages the Windows installer into `dist/` with electron-builder.
