# TMods bundles

The mods, configs and other bundles TMods installs. Every push that changes `bundles/`
publishes them as a GitHub Release with the manifest the app reads.

In TMods, set the manifest URL (first launch or Settings) to:

```
https://github.com/<owner>/<this repository>/releases/latest/download/manifest.json
```

## Adding a version

Make a folder for it under its category (`mods`, `schematics`, `resourcepacks`, `configs`
or `shaderpacks`). The folder name is the version players see. Then fill it in one of
these ways, or mix them:

- **Publish a profile from TMods**: set this repository up in TMods' Settings, then use
  "Publish to your bundles repository" on the Modrinth page's Modpacks tab. It commits a
  new version folder for you.
- **Export a profile from TMods** (or the Modrinth app, Prism, packwiz) as a `.mrpack` and
  drop it in the folder. Its mods are downloaded when publishing, and its overrides
  (configs and so on) go in as they are.
- **List Modrinth versions** in a `bundle.json`, using the name in the project's URL and
  the version number from its Versions tab:

  ```json
  {
    "description": "Sodium, for faster rendering",
    "target": "Fabric 1.21.1",
    "changelog": "First version.",
    "modrinth": { "sodium": "mc1.21.1-0.6.0-fabric" }
  }
  ```

- **Add files** where they go in the game folder, e.g. `config/sodium-options.json`.

Every field in `bundle.json` is optional. `bundles/` has a Modrinth example and a plain
files one; replace them with your own.

## Rules

- Versions are listed newest first (`1.10.0` before `1.9.0`) and the first is the latest.
  To pick another, add `bundles/bundles.json` with `{ "latest": { "mods": "1.0.0" } }`.
- To update a bundle, add a new version folder. Changing a published version won't reach
  players who installed it.
- Don't delete old releases: newer manifests can still link to zips in them.

To check a change without publishing, run the workflow from the Actions tab with "dry-run"
ticked. Full guide:
[publish-bundles](https://github.com/Trino11/TMods-Downloader/blob/main/publish-bundles/README.md).
