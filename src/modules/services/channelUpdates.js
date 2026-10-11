// "Is everything up to date?" for one game folder: compares the bundle installed for
// each manifest category with the latest one the manifest offers.
import { fetchLatestVersions } from './manifest';
import { installBundle, readInstalledVersion } from './bundleInstaller';

// Returns one entry per category: { category, installed, latest, outdated }. `latest`
// is null when the manifest has nothing for it; `outdated` is true when the latest
// version isn't the one installed (including when nothing is installed yet).
export async function checkChannels(categories, gameDir) {
    const latest = await fetchLatestVersions(categories.map(category => category.id));
    return categories.map(category => {
        const installed = readInstalledVersion(category, gameDir);
        const version = latest[category.id];
        return { category, installed, latest: version, outdated: Boolean(version) && version.id !== installed };
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
