// Publishing a profile as a new version of a bundle in the player's bundles repository:
// the profile is exported as a .mrpack (only download links for Modrinth files, plus
// hand-added jars and configs) and committed as bundles/<category>/<version>/. The
// repository's publish workflow then builds the zip and the manifest players read.
import { exportMrpack } from './mrpack';
import { github } from './node';
import { getBundlesRepo, getManifestUrl } from './settings';

const MANIFEST_ON_GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/releases\//;

// The saved bundles repository, or the one the manifest URL is published from.
export function bundlesRepo() {
    return getBundlesRepo() || getManifestUrl().match(MANIFEST_ON_GITHUB)?.[1] || '';
}

// The version to suggest after `existing` (folder names): the newest one with its last
// number raised by one, comparing numbers as numbers like the publisher does.
export function nextVersion(existing) {
    const newest = [...existing].sort((a, b) => b.localeCompare(a, 'en', { numeric: true, sensitivity: 'base' }))[0];
    const match = newest?.match(/^(.*?)(\d+)(\D*)$/);
    if (!match) {
        return '1.0.0';
    }
    // Keeps zero padding, so 2024-06 becomes 2024-07.
    const number = String(Number(match[2]) + 1).padStart(match[2].length, '0');
    return `${match[1]}${number}${match[3]}`;
}

export function existingVersions(repo, category) {
    return github.versions(repo, category);
}

// Commits the profile at `gameDir` as `category`/`version`. Resolves to
// { commitUrl, actionsUrl, mods, extraFiles }.
export async function publishProfile({
    repo,
    category,
    version,
    gameDir,
    target,
    name,
    description = '',
    changelog = '',
    includeConfig = true,
}) {
    const pack = exportMrpack(gameDir, target, { name, version, includeConfig });
    const metadata = {};
    if (description.trim()) {
        metadata.description = description.trim();
    }
    if (changelog.trim()) {
        metadata.changelog = changelog.trim();
    }
    const files = [{ name: 'pack.mrpack', data: pack.data }];
    if (Object.keys(metadata).length > 0) {
        files.push({ name: 'bundle.json', data: JSON.stringify(metadata, null, 2) + '\n' });
    }
    const result = await github.publish({
        repo,
        category,
        version,
        files,
        message: `Add ${category} ${version} from TMods`,
    });
    return { ...result, mods: pack.mods, extraFiles: pack.extraFiles };
}
