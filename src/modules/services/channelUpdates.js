// "Is everything up to date?" for one game folder: compares the bundle installed for
// each manifest category with the latest one the manifest offers.
import { fetchChannelUpdates } from './manifest';
import { installBundle, readInstalledVersion } from './bundleInstaller';

// Returns one entry per category: { category, installed, latest, outdated, changes }.
// `latest` is null when the manifest has nothing for it; `outdated` is true when the
// latest version isn't the one installed (including when nothing is installed yet);
// `changes` holds the changelogs of the versions the update brings, newest first.
export async function checkChannels(categories, gameDir) {
    const installed = Object.fromEntries(
        categories.map(category => [category.id, readInstalledVersion(category, gameDir)]),
    );
    const updates = await fetchChannelUpdates(installed);
    return categories.map(category => {
        const { latest, changes } = updates[category.id];
        return {
            category,
            installed: installed[category.id],
            latest,
            outdated: Boolean(latest) && latest.id !== installed[category.id],
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
