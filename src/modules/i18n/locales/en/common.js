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
