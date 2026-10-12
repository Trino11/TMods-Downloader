// "Is everything up to date?" for one game folder: compares the bundle installed for
// each manifest category with the latest one the manifest offers.
import { fetchChannelUpdates } from './manifest';
import { installBundle, readInstalledVersion } from './bundleInstaller';
import { isPinned } from './pins';

// Returns one entry per category: { category, installed, latest, pinned, outdated, changes }.
// `latest` is null when the manifest has nothing for it; `pinned` is true when the
// profile keeps the version it has (services/pins.js); `outdated` is true when the
// latest version isn't the one installed (including when nothing is installed yet) and
// the profile doesn't keep its version; `changes` holds the changelogs of the versions
// the update brings, newest first.
export async function checkChannels(categories, gameDir) {
    const installed = Object.fromEntries(
        categories.map(category => [category.id, readInstalledVersion(category, gameDir)]),
    );
    const updates = await fetchChannelUpdates(installed);
    return categories.map(category => {
        const { latest, changes } = updates[category.id];
        const pinned = Boolean(installed[category.id]) && isPinned(gameDir, category.id);
        return {
            category,
            installed: installed[category.id],
            latest,
            pinned,
            outdated: Boolean(latest) && latest.id !== installed[category.id] && !pinned,
            changes,
        };
    });
}

// Installs the latest version of every outdated channel, one after the other, so a
// failure in one doesn't stop the rest. Returns [{ category, error }] for the failures.
export async function installChannelUpdates(statuses, gameDir) {
    const failures = [];
    for (const status of statuses.filter(s => s.outdated)) {
        try {
            await installBundle(status.category, status.latest, gameDir);
        } catch (error) {
            failures.push({ category: status.category, error });
        }
    }
    return failures;
}
