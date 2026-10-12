// The Mods, Schematics, Resource packs, Configs and Shaderpacks pages.
const bundle = {
    refresh: 'Refresh',
    download: 'Download',
    downloaded: 'Downloaded',
    whatsNewIn: "What's new in {version}",
    backups: {
        title: 'Backups',
        empty: 'No backups yet. One is made every time you install a version.',
        restore: 'Restore',
        noVersion: 'No version installed',
    },
    restore: {
        confirmVersion:
            'Replace your current {content} with version {version} from {date}? Your current files are backed up first.',
        confirmBackup:
            'Replace your current {content} with the backup from {date}? Your current files are backed up first.',
    },
    errors: {
        loadVersions: 'Could not load the list of versions: {message}',
        install: 'Could not install {version}: {message}',
        restore: 'Could not restore the backup: {message}',
    },
};

export default bundle;
