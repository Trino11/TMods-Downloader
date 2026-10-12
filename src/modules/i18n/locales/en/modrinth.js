// The Modrinth page: search, installed content and modpacks.
const modrinth = {
    title: 'Modrinth',
    tabs: {
        mod: 'Mods',
        resourcepack: 'Resource packs',
        shader: 'Shaders',
        installed: 'Installed',
        installedCount: 'Installed ({count})',
        modpacks: 'Modpacks',
    },
    // Per kind of content (see KINDS in services/modrinth.js).
    kinds: {
        mod: {
            label: 'Mods',
            noun: 'mod',
            search: 'Search mods',
            empty: 'No mods from Modrinth in this profile yet. Find some under Mods.',
            adopted: {
                one: 'Recognised {count} mod(s) from Modrinth.',
                other: 'Recognised {count} mod(s) from Modrinth.',
            },
        },
        resourcepack: {
            label: 'Resource packs',
            noun: 'resource pack',
            search: 'Search resource packs',
            pickVersion: 'Pick the Minecraft version above to search for resource packs.',
            empty: 'No resource packs from Modrinth in this profile yet. Find some under Resource packs.',
            adopted: {
                one: 'Recognised {count} resource pack(s) from Modrinth.',
                other: 'Recognised {count} resource pack(s) from Modrinth.',
            },
        },
        shader: {
            label: 'Shaders',
            noun: 'shader',
            search: 'Search shaders',
            pickVersion: 'Pick the Minecraft version above to search for shaders.',
            empty: 'No shaders from Modrinth in this profile yet. Find some under Shaders.',
            adopted: {
                one: 'Recognised {count} shader(s) from Modrinth.',
                other: 'Recognised {count} shader(s) from Modrinth.',
            },
        },
    },
    target: {
        describe: '{loader} {loaderVersion} · Minecraft {gameVersion}',
        picked: 'Content is picked for {target}.',
        noLoader:
            'This profile plays Minecraft {gameVersion}, which has no mod loader, so only resource packs and shaders are offered. For mods, install Fabric, Forge, NeoForge or Quilt with its installer, then pick that version for the profile in Profiles.',
        unknownVersion:
            "TMods doesn't know which Minecraft version {versionId} is yet. Open Profiles once so it can load the version list, or pick a specific version for this profile.",
        noVersions:
            'No Minecraft version is installed yet. Play once with the Minecraft Launcher, or install Fabric, Forge, NeoForge or Quilt for mods, then come back here.',
        question: 'Which installed version do you play this folder with?',
        pick: 'Pick a version',
        use: 'Use',
    },
    shaders: {
        loader: 'Shader mod',
        helpWithLoader:
            'Shaders only work with a shader mod installed: Iris on Fabric, Quilt or NeoForge (find it under Mods), Oculus on Forge, or OptiFine.',
        helpNoLoader: 'Shaders only work with a shader mod: OptiFine, or Iris on a mod loader such as Fabric.',
    },
    install: {
        button: 'Install',
        installed: 'Installed',
        ariaLabel: 'Install {title} ({noun})',
        warningTitle: 'Install {title} anyway?',
        anyway: 'Install anyway',
        done: 'Installed {title}.',
        doneWith: 'Installed {title} with {dependencies}.',
        needsLoader: 'Set up a mod loader above to search for mods.',
    },
    updates: {
        available: {
            one: '{count} update(s) available.',
            other: '{count} update(s) available.',
        },
        upToDate: 'Everything is up to date.',
        updated: 'Updated {titles}.',
    },
    remove: {
        confirm: 'Remove {title}?',
        done: 'Removed {titles}.',
    },
    adoptNone: 'None of them were found on Modrinth.',
    installed: {
        checkUpdates: 'Check for updates',
        checkCompat: 'Check compatibility',
        checkingCompat: 'Checking compatibility…',
        updateAll: 'Update all ({count})',
        whatsNew: "What's new in {title}",
        update: 'Update',
        enable: 'Enable',
        disable: 'Disable',
        remove: 'Remove',
        asDependency: '(needed by another mod)',
        updateAvailable: 'Update available: {version}',
        byHand: 'Added by hand',
        recognise: 'Recognise',
        byHandHelp:
            'TMods leaves these alone. If they come from Modrinth, it can recognise them so you can update them here.',
    },
    compat: {
        error: 'Could not check compatibility: {error}',
        none: 'No compatibility problems found.',
        found: {
            one: '{count} compatibility problem found. They are listed under each mod below.',
            other: '{count} compatibility problems found. They are listed under each mod below.',
        },
    },
    search: {
        error: 'Could not search Modrinth: {error}',
        byline: 'by {author} · {downloads} downloads',
        nothing: 'Nothing found.',
        more: 'More',
    },
    modpacks: {
        search: 'Search modpacks',
        packsHint: 'To export, import or publish a .mrpack file, use the {link} page.',
        packsLink: 'Packs',
    },
};

export default modrinth;
