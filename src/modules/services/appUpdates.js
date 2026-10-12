import { updates } from './node';

const RELEASES_URL = 'https://github.com/Trino11/TMods-Downloader/releases';

// The newer version found when the app opened ({ version }), or null when there is none.
export async function availableUpdate() {
    return (await updates.pending()) || null;
}

// Calls `listener({ version })` when a newer version is found. Returns a function that
// stops listening.
export function onUpdateAvailable(listener) {
    return updates.onAvailable(listener);
}

// Downloads the update, then closes the app, installs it and opens the new version.
export function installUpdateNow() {
    return updates.installNow();
}

// Downloads the update in the background; it installs when the app is closed.
export function installUpdateOnQuit() {
    return updates.installOnQuit();
}

// The release page listing what changed in `version`.
export function releaseUrl(version) {
    return `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`;
}
