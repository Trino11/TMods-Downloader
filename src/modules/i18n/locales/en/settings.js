const settings = {
    title: 'Settings',
    description:
        'The manifest lists the mods, configs and packs you can download. Changing it is checked before saving.',
    language: {
        title: 'Language',
        label: 'Language',
        system: 'System language ({name})',
    },
    firstRun: {
        title: 'Welcome to TMods Loader',
        description: 'Enter the URL of your manifest to get started. You can change it later in Settings.',
    },
    manifest: {
        label: 'Manifest URL',
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
