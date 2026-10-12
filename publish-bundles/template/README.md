# TMods bundles

The mods, configs and other bundles TMods installs. Every push that changes `bundles/`
publishes them as a GitHub Release with the manifest the app reads.

In TMods, set the manifest URL (first launch or Settings) to:

```
https://github.com/<owner>/<this repository>/releases/latest/download/manifest.json
```

## Adding a version

Make a folder for it under its category (`mods`, `schematics`, `resourcepacks`, `configs`,
`shaderpacks` or `packs`). The folder name is the version players see.

**A whole pack** goes in `packs/<version>/` as one `.mrpack` file (plus an optional
`bundle.json` with `description` and `changelog`, or a `CHANGELOG.md`). Players import it
into a profile from TMods' Packs page, Import tab.

- **Publish from TMods**: set this repository up in TMods' Settings, then use the Packs
  page's Publish tab. Tick the files of the active profile to include (mods, resource
  packs, shaders, configs, schematics, settings), or pick a `.mrpack` you already have,
  and it commits a new version folder for you.

**The other categories** are zips unpacked over the game folder. Fill their version
folder in one of these ways, or mix them:

- **Export a profile from TMods** (Packs page, or the Modrinth app, Prism, packwiz) as a
  `.mrpack` and drop it in the folder. Its mods are downloaded when publishing, and its
  overrides (configs and so on) go in as they are.
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

## Multiplayer servers

List servers in `bundles/servers.json` and TMods adds them to the top of every profile's
Multiplayer list, keeping players' own servers:

```json
{
  "servers": [{ "name": "TMods Lobby", "address": "play.example.com", "resourcePack": "enabled" }]
}
```

`resourcePack` is `prompt` (the default), `enabled` or `disabled`. Rename or remove a
server here and players' lists follow.

## Rules

- Versions are listed newest first (`1.10.0` before `1.9.0`) and the highest is the latest.
- To update a bundle, add a new version folder. Changing a published version won't reach
  players who installed it.
- Don't delete old releases: newer manifests can still link to zips and packs in them.

To check a change without publishing, run the workflow from the Actions tab with "dry-run"
ticked. Full guide:
[publish-bundles](https://github.com/Trino11/TMods-Downloader/blob/main/publish-bundles/README.md).
