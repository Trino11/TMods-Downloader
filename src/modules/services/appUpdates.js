import { updates } from './node';

const RELEASES_URL = 'https://github.com/Trino11/TMods-Downloader/releases';

// The update the app already downloaded ({ version }), or null when there is none.
export async function readyUpdate() {
    return (await updates.pending()) || null;
}

// Calls `listener({ version })` when an update finishes downloading. Returns a function
// that stops listening.
export function onUpdateReady(listener) {
    return updates.onReady(listener);
}

// Closes the app, installs the update and opens the new version.
export function installUpdate() {
    return updates.install();
}

// The release page listing what changed in `version`.
export function releaseUrl(version) {
    return `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`;
}
