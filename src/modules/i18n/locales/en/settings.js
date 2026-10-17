const settings = {
    title: 'Settings',
    description:
        'A manifest lists the mods, configs and packs you can download. You can follow several, and each profile picks one.',
    language: {
        title: 'Language',
        label: 'Language',
        system: 'System language ({name})',
    },
    firstRun: {
        title: 'Welcome to TMods Loader',
        description: 'Enter the URL of your manifest to get started. You can add more later in Settings.',
    },
    manifest: {
        title: 'Manifests',
        description:
            'Each profile follows one of these, picked on the Profiles page. Profiles that never picked follow the first one. A URL is checked before it is saved.',
        label: 'Manifest URL',
        name: 'Name',
        namePlaceholder: 'Optional, for example "Survival server"',
        add: 'Add',
        addTitle: 'Add a manifest',
        edit: 'Edit',
        remove: 'Remove',
        confirmRemove: 'Remove the manifest "{name}"? Profiles that follow it will follow the first manifest instead.',
        added: 'Added {name}.',
        saved: 'Saved {name}.',
        removed: 'Removed {name}.',
    },
    bundlesRepo: {
        title: 'Your bundles repository',
        descriptionBefore:
            "Publish profiles from the Modrinth page's Modpacks tab straight to your bundles repository on GitHub. Create a",
        tokenLink: 'fine-grained token',
        descriptionAfter:
            'for that repository only, with Contents set to read and write. TMods keeps it encrypted on this computer.',
        repository: 'Repository',
        token: 'GitHub token',
        tokenSaved: 'GitHub token (saved; paste a new one to replace it)',
        save: 'Save and check',
        forget: 'Forget token',
        needToken: 'Add a GitHub token to publish.',
        ready: 'Ready to publish to {repo}.',
        noKeyring:
            "TMods can't save a token on this computer because no keyring is running to encrypt it. On Linux, install and unlock one (GNOME Keyring, KDE Wallet or KeePassXC), then restart TMods.",
    },
    logs: {
        title: 'Logs',
        description: 'Attach the log file when you report a bug.',
        location: 'Log file location',
        finding: 'Finding the log file…',
        open: 'Open log',
        openFolder: 'Open log folder',
    },
};

export default settings;
