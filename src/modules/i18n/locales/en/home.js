// The Home page and its quick actions.
const home = {
    title: 'Home',
    description: 'Quick actions for the active profile, {name}.',
    created: 'Created {name} and switched to it.',
    browseModrinth: 'Browse Modrinth',
    manageProfiles: 'Manage profiles',
    settings: 'Settings',
    version: 'Version {version}',
    fabric: {
        title: 'Install Fabric on {name}',
        descriptionDefault: 'Adds Fabric to the Minecraft Launcher and uses it for Modrinth mods in this folder.',
        descriptionProfile: 'Adds Fabric to the Minecraft Launcher and switches this profile to it.',
        installedDefault: 'Installed {version}. Pick it in the Minecraft Launcher to play with Fabric.',
        installedProfile:
            'Installed {version} and switched {name} to it. Restart the Minecraft Launcher if it is open.',
    },
    newProfile: {
        title: 'Create a profile',
        description:
            'A new profile gets its own folder and shows up in the Minecraft Launcher. TMods switches to it right away.',
    },
    updates: {
        title: 'Updates for {name}',
        check: 'Check for updates',
        installAll: 'Install all',
        installAllCount: 'Install all ({count})',
        install: 'Install',
        update: 'Update',
        nothingPublished: 'Nothing published',
        upToDate: 'Up to date',
        updateAvailable: 'Update available',
        notInstalled: 'Not installed',
        installed: 'Installed {version}',
        latestIs: 'Latest is {version}',
        whatsNewIn: "What's new in {name}",
        whatsNewMods: "What's new in your Modrinth mods",
        fromModrinth: 'From Modrinth',
        checkChannelsFailed: 'Could not check the channels: {error}',
        checkModrinthFailed: 'Could not check Modrinth for updates: {error}',
        installedOne: 'Installed {name} {version}.',
        someFailed: 'Some updates failed. {problems}',
        allUpToDate: 'Everything is up to date.',
        updatedMods: {
            one: 'Updated {count} item from Modrinth.',
            other: 'Updated {count} items from Modrinth.',
        },
    },
    latestPack: {
        title: 'Latest pack',
        loading: "Loading your channel's latest pack...",
        loadFailed: "Could not load your channel's packs: {error}",
        none: 'Your channel has no packs yet. Publish one from the Packs page.',
        whatsNew: "What's new in pack {id}",
        download: 'Download',
        pack: 'Pack {id}',
        pickProfile: 'You pick the profile it goes into before anything changes.',
    },
};

export default home;
