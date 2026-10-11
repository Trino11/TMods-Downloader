# Publishing bundles with GitHub Releases

This action turns a folder of bundles into the zips and the `manifest.json` that TMods
downloads, and publishes them as a GitHub Release. You keep your bundles in a GitHub
repository, push a change, and players see the update. No server to run.

A bundle doesn't have to hold the jars themselves: it can be a `.mrpack` or a list of
Modrinth versions, and the action downloads the files when it publishes. The repository
stays small, and there's no 100 MB file limit or Git LFS to deal with.

## 1. Make a bundles repository

Copy [`template/`](template) into a new **public** repository (players download straight
from its releases, which a private repository won't allow). It holds the workflow, a
README, a mods version built from Modrinth and a configs version of plain files. A
repository can end up like this:

```
bundles/
  mods/
    1.1.0/
      my-pack.mrpack     a Modrinth modpack
      CHANGELOG.md       optional
    1.0.0/
      bundle.json        Modrinth versions, links and text
  configs/
    1.0.0/
      config/sodium-options.json
  bundles.json           optional
.github/workflows/publish.yml
```

- Each folder under `bundles/` is a category: `mods`, `schematics`, `resourcepacks`,
  `configs` or `shaderpacks`. Any other name stops the publish, to catch typos.
- Each folder inside a category is one version; its name is the version id players see.
- Versions are listed newest first, comparing numbers as numbers (`1.10.0` before
  `1.9.0`), and the first one is the latest. To pick another, add
  `bundles.json` with `{ "latest": { "mods": "1.9.0" } }`.

## 2. Fill in a version

The version's zip is unpacked over the player's game folder. What goes in it comes from
any mix of these:

**Files.** Anything in the version folder, placed exactly where it goes in the game
folder (`mods/…`, `config/…`, `resourcepacks/…`). Empty folders and `.gitkeep`,
`.DS_Store` and `Thumbs.db` are skipped.

**A `.mrpack`.** One Modrinth modpack file at the top of the version folder, as TMods
(Modrinth page, Export), the Modrinth app, Prism or packwiz write it. Its downloads go in
(files marked server-only are left out), then its `overrides/` and `client-overrides/`.
Its Minecraft version, loader and summary become the version's `target` and
`description`, unless `bundle.json` gives its own.

**`bundle.json`.** Every key is optional:

```json
{
  "description": "Sodium, for faster rendering",
  "target": "Fabric 1.21.1",
  "changelog": "- Added Sodium",
  "modrinth": {
    "sodium": "mc1.21.1-0.6.0-fabric"
  },
  "files": [{ "path": "mods/my-mod.jar", "url": "https://example.com/my-mod.jar", "sha256": "…" }]
}
```

- `description`, `target` (shown on the Mods page) and `changelog` are text. A
  `CHANGELOG.md` is another way to give the changelog.
- `modrinth` maps a project (the name in its URL, `modrinth.com/mod/sodium`) to the
  version to bundle: its version number from the Versions tab, or its id. Mods go in
  `mods/`, resource packs in `resourcepacks/` and Iris or OptiFine shaders in
  `shaderpacks/`. A version that doesn't exist stops the publish and lists the newest
  ones.
- `files` adds downloads from anywhere else. Each needs `path`, an `https` `url` and a
  `sha512`, `sha256` or `sha1` checksum.

Every download is checked against its checksum, and two inputs landing on the same path
stop the publish. Neither `bundle.json`, `CHANGELOG.md` nor the `.mrpack` itself goes
into the zip.

### Or publish from TMods

TMods can do this for you. In Settings, under "Your bundles repository", enter the
repository and a
[fine-grained token](https://github.com/settings/personal-access-tokens/new) that can
only reach that repository, with Contents set to read and write. TMods checks the token
and keeps it encrypted on that computer. Then on the Modrinth page's Modpacks tab,
"Publish to your bundles repository" exports the active profile as a `.mrpack` and
commits it, with an optional description and changelog in `bundle.json`, as a new version
folder. It suggests the version after the newest one already published, and refuses to
overwrite one that exists. The workflow below picks the commit up and publishes it.

## 3. The workflow

`.github/workflows/publish.yml` (in the template):

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
        uses: Trino11/TMods-Downloader/publish-bundles@bundles-v1
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

## 4. Point TMods at it

Paste the manifest URL into TMods' first-launch screen or Settings page:

```
https://github.com/<you>/<bundles repo>/releases/latest/download/manifest.json
```

It always serves the newest release's manifest, so it never changes.

## How releases work

Each publish creates one release holding `manifest.json` and the zips that are new or
changed. Each manifest entry records what its zip was built from (`source`: the files'
checksums and the pinned versions), so a version that didn't change keeps pointing at
the release it was first uploaded to, and nothing is downloaded or zipped for it again.
When nothing changed at all, no release is made.

That means **don't delete old releases**: the manifest may still point at zips in them.
Deleting a version's folder removes it from the next manifest.

Changing a version that already exists uploads it again under the same id, but players
who installed that id won't see it as an update, and the run log warns about it. Give
changed bundles a new id instead.

Each entry in the manifest has a `sha256`, and TMods refuses a download that doesn't
match it. Zips are limited to 4 GB and 65,535 files.

## Versions of this action

Bundles repositories use `@bundles-v1`, not `@main`. After every change to `main` passes
the dry run and the tests, the `bundles-v<MAJOR>` tag moves to it, `MAJOR` being the
number in [`MAJOR`](MAJOR). So fixes reach every bundles repository on their own.

A change that would break an existing bundles repository (a renamed input, a layout it
no longer reads) bumps `MAJOR`. The old tag then stays where it is, and each repository
moves to the new one by editing `@bundles-v1` in its workflow when it's ready.
