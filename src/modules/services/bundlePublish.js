// Publishing a pack as a new version in the player's bundles repository: a .mrpack (a
// profile's picked files exported by the Packs page, or a file the player already has)
// committed as bundles/<category>/<version>/pack.mrpack. The repository's publish
// workflow then builds the release players read: whole packs in the packs category, or
// a zip for the other categories.
import categories from '../categories';
import { github } from './node';
import { getBundlesRepo, getManifestUrl } from './settings';

const MANIFEST_ON_GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/releases\//;

// Where a published pack can go: whole packs first (the default), then the categories
// the bundle pages install as zips.
export const PACKS_CATEGORY = 'packs';
export const PUBLISH_CATEGORIES = [
    { id: PACKS_CATEGORY, label: 'Packs (whole pack)' },
    ...categories.map(category => ({ id: category.id, label: category.label })),
];

// GitHub refuses files over 100 MB, and every published version stays in the repository
// for good, so packs over 25 MB get a warning.
export const MAX_PACK_BYTES = 100 * 1024 * 1024;
export const LARGE_PACK_BYTES = 25 * 1024 * 1024;

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

// Commits a pack (its bytes) as `category`/`version`, with the optional text in
// bundle.json. Resolves to { commitUrl, actionsUrl }.
export async function publishPack({
    repo,
    category = PACKS_CATEGORY,
    version,
    data,
    description = '',
    changelog = '',
}) {
    if (data.length > MAX_PACK_BYTES) {
        throw new Error(
            `The pack is ${Math.ceil(data.length / (1024 * 1024))} MB, and GitHub takes files up to 100 MB. ` +
                'Leave out large files that are copied rather than linked from Modrinth.',
        );
    }
    const metadata = {};
    if (description.trim()) {
        metadata.description = description.trim();
    }
    if (changelog.trim()) {
        metadata.changelog = changelog.trim();
    }
    const files = [{ name: 'pack.mrpack', data }];
    if (Object.keys(metadata).length > 0) {
        files.push({ name: 'bundle.json', data: JSON.stringify(metadata, null, 2) + '\n' });
    }
    return github.publish({
        repo,
        category,
        version,
        files,
        message: `Add ${category} ${version} from TMods`,
    });
}
