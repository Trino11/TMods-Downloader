// Messages from the services (src/modules/services): errors, warnings and labels the
// pages show as they are.
const services = {
    manifest: {
        notFound:
            'Nothing was found at that address (404). Check the link, and that the bundles repository has published a release.',
        serverError:
            'The server did not answer properly (status {status}). This is usually temporary, so try again in a minute.',
        invalidUrl: 'That is not a valid URL.',
        badProtocol: 'The URL must start with http:// or https://.',
        loadFailed: 'Could not load the manifest: {reason}',
        notManifest: 'The URL loaded, but it is not a TMods manifest (no "versions" field).',
    },
    modCompat: {
        versionRange: '{from} to {to}',
        or: ' or ',
        wrongLoaderAndGame: 'Made for {loaders} on Minecraft {versions}, but this profile plays {target}.',
        wrongLoader: 'Made for {loaders}, but this profile uses {loader}.',
        wrongGame: 'Made for Minecraft {versions}, but this profile plays {gameVersion}.',
        noVersionYet: 'It has no version for {target} yet.',
        needsDisabled: 'Needs {title}, which is disabled.',
        needsMissing: "Needs {title}, which isn't installed.",
        maybeHandAdded: 'If you added it by hand from another site, you can ignore this.',
        needsUnavailable: "Needs {title}, which isn't installed and has no version for {target}.",
        incompatible: "Doesn't work together with {title}.",
        clashesWithInstalled: "It says it doesn't work together with {title}, which is installed.",
        installedClashes: "{title}, which is installed, says it doesn't work together with this mod.",
        refuseRename: 'Refusing to rename "{fileName}".',
        unknownFix: 'Unknown fix "{type}".',
        fix: {
            disable: 'Disable',
            enable: 'Enable {title}',
            install: 'Install {title}',
            switchVersion: 'Switch to {version}',
        },
        done: {
            switched: 'Switched {title} to {version}.',
            installed: 'Installed {titles}.',
            enabled: 'Enabled {title}.',
            disabled: 'Disabled {title}.',
        },
    },
    modrinth: {
        kinds: {
            mod: { label: 'Mods', noun: 'mod' },
            resourcepack: { label: 'Resource packs', noun: 'resource pack' },
            shader: { label: 'Shaders', noun: 'shader' },
        },
    },
    modrinthMods: {
        refuseFileName: 'Refusing to save a file named "{name}".',
        checksumMismatch: "The file from {url} doesn't match its checksum.",
        noDownloadLink: 'The file has no download link.',
        aMod: 'a mod',
        dependencyUnavailable: 'It needs {name}, which has no version for {target}.',
        incompatible: "It doesn't work together with {name}.",
        thisKind: {
            mod: 'This mod',
            resourcepack: 'This resource pack',
            shader: 'This shader',
        },
        alreadyInstalled: '{name} is already installed.',
        noVersion: '{name} has no version for {target}.',
        notInstalledAnymore: "That isn't installed anymore.",
    },
    mrpack: {
        unsafePath: 'The pack contains an unsafe file path: {path}',
        stateFolderPath: "The pack contains a file in TMods' own folder: {path}",
        noIndex: 'This is not a Modrinth modpack (no modrinth.index.json inside).',
        badIndexJson: "The modpack's modrinth.index.json is not valid JSON.",
        unknownFormat: "This modpack is in a format TMods doesn't know.",
        noGameVersion: "The modpack doesn't say which Minecraft version it is for.",
        notZip: "This file is not a modpack (it isn't a zip).",
        noChecksum: 'The pack lists {path} without a checksum.',
        untrustedHost: "The pack downloads {path} from a site TMods doesn't trust.",
        warnings: {
            gameVersion: 'The pack is for Minecraft {packVersion}, but {profile} plays {gameVersion}.',
            otherLoader: 'The pack needs {loader}, but {profile} uses {profileLoader}.',
            noLoader: 'The pack needs {loader}, but {profile} has no mod loader.',
        },
        backupGone: 'That backup is gone.',
        loaderWanted: '{loader} {loaderVersion} for Minecraft {gameVersion}',
        loaderNote: {
            usedInstalled: 'The pack asks for {wanted}; TMods used the {loader} version you already have installed.',
            install: 'Install {wanted}, then pick it for this profile in Profiles.',
        },
        profileGone: "That profile doesn't exist anymore.",
        noVersionToDownload: '{title} has no version to download.',
        corruptDownload: "The download of {id} is corrupt (its checksum doesn't match).",
        unknownGameVersion:
            "TMods doesn't know which Minecraft version this profile plays. Pick it on the Modrinth page.",
        pickLoaderVersion: 'Pick the loader version this profile plays with before exporting mods.',
    },
    bundleInstaller: {
        corruptDownload: "The download of {id} is corrupt (its checksum doesn't match).",
        notZip: 'The download of {id} is not a valid zip.',
        backupNotFound: 'Backup {id} not found for {category}',
    },
    bundlePublish: {
        packsCategory: 'Packs (whole pack)',
        nothingFor: 'The pack has nothing that goes in {category}.',
        tooLarge:
            'The pack is {size} MB, and GitHub takes files up to 100 MB. Leave out large files that are copied rather than linked from Modrinth.',
    },
    servers: {
        unreadable: 'Could not read the server list (servers.dat): {reason}',
        addressRequired: 'Every server needs an address.',
        badAddress: 'The address "{address}" has spaces in it.',
        defaultName: 'Minecraft Server',
    },
    profiles: {
        defaultName: 'Default (.minecraft)',
        nameRequired: 'Give the profile a name.',
        defaultNotEditable: 'The default profile cannot be changed.',
        defaultNotDeletable: 'The default profile cannot be deleted.',
        profileGone: 'That profile no longer exists.',
        unreadableLauncherFile: 'Could not read {file}: {reason}',
    },
    gameVersions: {
        badFormat: 'The Minecraft version list has an unexpected format.',
        latestRelease: 'Latest release',
        latestSnapshot: 'Latest snapshot',
        installed: 'installed',
        types: {
            snapshot: 'snapshot',
            old_beta: 'beta',
            old_alpha: 'alpha',
        },
    },
    fabric: {
        noStableLoader: 'Fabric has no stable loader for Minecraft {gameVersion}.',
        invalidGameVersion: 'Invalid Minecraft version: {version}',
        invalidLoaderVersion: 'Invalid Fabric loader version: {version}',
        unexpectedProfile: 'Fabric sent an unexpected launcher profile for Minecraft {gameVersion}.',
    },
};

export default services;
