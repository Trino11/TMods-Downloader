# Publishing bundles with GitHub Releases

This action turns a folder of files into the zips and the `manifest.json` that TMods
downloads, and publishes them as a GitHub Release. You keep your bundles in a GitHub
repository, push a change, and players see the update. No server to run.

## 1. Make a bundles repository

Create a **public** repository (players download straight from its releases, which a
private repository won't allow) and lay it out like this:

```
bundles/
  mods/
    1.10.0/
      mods/sodium.jar
      mods/lithium.jar
      bundle.json        (optional)
      CHANGELOG.md       (optional)
    1.9.0/
      mods/sodium.jar
  configs/
    2024-06/
      config/sodium-options.json
  bundles.json           (optional)
.github/workflows/publish.yml
```

- Each folder under `bundles/` is a category: `mods`, `schematics`, `resourcepacks`,
  `configs` or `shaderpacks`. Any other name stops the publish, to catch typos.
- Each folder inside a category is one version; its name is the version id players see.
- Inside a version, put files exactly where they go in the game folder (`mods/…`,
  `config/…`, `resourcepacks/…`). The zip is unpacked over the player's game folder.
- `bundle.json` can hold `description`, `target` (shown on the Mods page, e.g.
  `"Fabric 1.21.1"`) and `changelog`, all text. `CHANGELOG.md` is another way to give the
  changelog. Neither file goes into the zip.
- Versions are listed newest first, comparing numbers as numbers (`1.10.0` before
  `1.9.0`), and the first one is the latest. To pick another, add
  `bundles.json` with `{ "latest": { "mods": "1.9.0" } }`.
- Empty folders and `.gitkeep`, `.DS_Store` and `Thumbs.db` files are skipped.

Mod jars can be large. GitHub refuses files over 100 MB, and
[Git LFS](https://git-lfs.com) keeps a repository full of jars fast; if you use it, add
`lfs: true` to the checkout step below.

## 2. Add the workflow

`.github/workflows/publish.yml`:

```yaml
name: Publish bundles

on:
  push:
    branches: [main]
    paths: ['bundles/**']
  workflow_dispatch:

permissions:
  contents: write # creates the release

concurrency: publish-bundles

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: publish
        uses: Trino11/TMods-Downloader/publish-bundles@main
        with:
          source: bundles
      - run: echo "Manifest URL ${{ steps.publish.outputs.manifest-url }}"
```

Inputs, all optional:

| Input     | Default                     | What it does                                              |
| --------- | --------------------------- | --------------------------------------------------------- |
| `source`  | `bundles`                   | The folder with the category folders.                     |
| `tag`     | `bundles-<UTC date + time>` | Tag of the new release.                                   |
| `dry-run` | `false`                     | Build and check everything, but create no release.        |
| `token`   | the workflow's token        | Token used to read and create releases (contents: write). |

Outputs: `manifest-url`, `tag`, `changed` (`false` when nothing changed, so nothing
was released) and `out-dir` (the built files).

Try it first with `dry-run: true`: the run log lists every version, which zips would be
uploaded and the manifest URL.

## 3. Point TMods at it

Paste the manifest URL into TMods' first-launch screen or Settings page:

```
https://github.com/<you>/<bundles repo>/releases/latest/download/manifest.json
```

It always serves the newest release's manifest, so it never changes.

## How releases work

Each publish creates one release holding `manifest.json` and the zips that are new or
changed. Zips are built the same way every time, so a version whose files didn't change
keeps pointing at the release it was first uploaded to and isn't uploaded again. When
nothing changed at all, no release is made.

That means **don't delete old releases**: the manifest may still point at zips in them.
Deleting a version's folder removes it from the next manifest.

Changing the files of a version that already exists uploads it again under the same id,
but players who installed that id won't see it as an update. Give changed bundles a
new id instead.

Each entry in the manifest has a `sha256`, and TMods refuses a download that doesn't
match it. Zips are limited to 4 GB and 65,535 files.
