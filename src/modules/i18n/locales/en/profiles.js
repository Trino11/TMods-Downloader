// The Profiles page, the profile form and the Fabric installer.
const profiles = {
    title: 'Profiles',
    description:
        "Each profile has its own mods, configs and packs, and shows up in the official Minecraft Launcher, where you press Play. Fabric can be installed below. For Forge or NeoForge, run the loader's installer first, then pick its version here.",
    editTitle: 'Edit profile',
    newTitle: 'New profile',
    name: 'Name',
    namePlaceholder: 'Profile name',
    create: 'Create',
    versionsOffline: 'Could not load the full Minecraft version list, showing the versions known offline.',
    saved: 'Profile saved. Restart the Minecraft Launcher if it is open to see the change.',
    created: 'Profile created. Restart the Minecraft Launcher if it is open to see it.',
    fabricSelected: "Installed {version}. It's now selected for this profile.",
    confirmDelete:
        'Delete the profile "{name}"? It is removed from TMods and the Minecraft Launcher. Its files stay in {folder}.',
    deleted: 'Profile deleted. Its files are still in {folder}.',
    active: 'Active',
    use: 'Use',
    edit: 'Edit',
    delete: 'Delete',
    launcherProfiles: 'Your usual launcher profiles',
    manifest: 'Manifest',
    manifestChanged: '{name} now follows {manifest}.',
    fabric: {
        title: 'Install Fabric',
        versionLabel: 'Fabric Minecraft version',
        install: 'Install Fabric',
        installing: 'Installing...',
        willInstall: 'Installs Fabric {loaderVersion} for Minecraft {gameVersion}.',
        listFailed: 'Could not reach Fabric to list Minecraft versions.',
        installFailed: 'Could not install Fabric: {error}',
    },
};

export default profiles;
