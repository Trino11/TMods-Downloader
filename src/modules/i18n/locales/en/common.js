// Words used on many pages.
const common = {
    save: 'Save',
    saved: 'Saved.',
    cancel: 'Cancel',
    close: 'Close',
    keepVersion: {
        keep: 'Keep this version',
        allow: 'Allow updates',
        keepHelp: "Stay on the version you have. Newer ones aren't offered or installed until you allow updates again.",
        allowHelp: 'Offer and install newer versions again.',
        kept: 'Version kept',
        keeping: 'Keeping {version}',
        keepingNewer: 'Keeping {version} ({latest} is out)',
    },
    integrity: {
        unchanged: 'Unchanged',
        unchangedHelp: 'The files on disk are byte for byte the ones that were downloaded.',
        modified: 'Modified',
        modifiedBecause: 'Not the same as the download: {reasons}.',
        untracked: 'Not checked',
        untrackedHelp:
            'Installed before TMods kept track of the files it downloads. Download this version again to check it from now on.',
        andMore: 'and {count} more',
        reasons: {
            merged: {
                one: 'added to {count} file you already had',
                other: 'added to {count} files you already had',
            },
            changed: { one: '{count} file changed', other: '{count} files changed' },
            added: { one: '{count} file added', other: '{count} files added' },
            removed: { one: '{count} file removed', other: '{count} files removed' },
        },
    },
    replaceContent: {
        title: 'Replace what you have?',
        intro: 'This installs into {folders}.',
        replace: 'Replace existing content',
        replaceHelp:
            'What is in those folders now is removed first, so only the new files are left. A backup is made, so you can undo it.',
        keepHelp:
            'The new files are added next to what you have. Files with the same name are overwritten, and a backup is made first.',
        confirm: 'Install',
    },
    changelog: {
        whatsNew: "What's new",
        noneForUpdate: 'No changelog was published for this update.',
        noneForVersion: 'No changelog for this version.',
        loadFailed: 'Could not load the changelog: {message}',
    },
};

export default common;
