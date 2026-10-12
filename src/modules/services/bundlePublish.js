// Publishing a pack as a new version in the player's bundles repository: a .mrpack (a
// profile's picked files exported by the Packs page, or a file the player already has)
// committed as bundles/<category>/<version>/pack.mrpack, into one or more categories. The repository's publish
// workflow then builds the release players read: whole packs in the packs category, or
// a zip for the other categories.
import categories from '../categories';
import { filterMrpack } from './mrpack';
import { github } from './node';
import { getBundlesRepo, getManifestUrl } from './settings';
import { t } from '../i18n';

const MANIFEST_ON_GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/releases\//;

// Where a published pack can go: whole packs first (the default), then the categories
// the bundle pages install as zips. `kinds` are the pack kinds (packKinds.js) a category
// takes; packs take every kind.
export const PACKS_CATEGORY = 'packs';
const CATEGORY_KINDS = {
    mods: ['mod'],
    schematics: ['schematic'],
    resourcepacks: ['resourcepack'],
    configs: ['config'],
    shaderpacks: ['shader'],
};
export const PUBLISH_CATEGORIES = [
    {
        id: PACKS_CATEGORY,
        // A getter, so the label follows the language picked after this module loaded.
        get label() {
            return t('services.bundlePublish.packsCategory');
        },
        kinds: null,
    },
    ...categories.map(category => ({
        id: category.id,
        get label() {
            return category.label;
        },
        kinds: CATEGORY_KINDS[category.id],
    })),
];

function publishCategory(id) {
    return PUBLISH_CATEGORIES.find(category => category.id === id);
}

// Whether a pack whose items are of `kinds` has anything to publish in category `id`.
export function categoryHasFiles(id, kinds) {
    const category = publishCategory(id);
    return Boolean(category) && kinds.some(kind => !category.kinds || category.kinds.includes(kind));
}

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

// Publishes a pack (its bytes) as a new version of each of `versions` ([{ category,
// version }]), all in one commit: packs get the whole pack, every other category a pack
// with only the files of its kind. The optional text goes in each version's bundle.json.
// Resolves to { commitUrl, actionsUrl }.
export async function publishPack({ repo, versions, data, description = '', changelog = '' }) {
    const metadata = {};
    if (description.trim()) {
        metadata.description = description.trim();
    }
    if (changelog.trim()) {
        metadata.changelog = changelog.trim();
    }
    const published = versions.map(({ category, version }) => {
        const { kinds, label } = publishCategory(category);
        const part = kinds ? filterMrpack(data, kinds) : data;
        if (!part) {
            throw new Error(t('services.bundlePublish.nothingFor', { category: label }));
        }
        if (part.length > MAX_PACK_BYTES) {
            throw new Error(t('services.bundlePublish.tooLarge', { size: Math.ceil(part.length / (1024 * 1024)) }));
        }
        const files = [{ name: 'pack.mrpack', data: part }];
        if (Object.keys(metadata).length > 0) {
            files.push({ name: 'bundle.json', data: JSON.stringify(metadata, null, 2) + '\n' });
        }
        return { category, version, files };
    });
    return github.publish({
        repo,
        versions: published,
        message: `Add ${versions.map(({ category, version }) => `${category} ${version}`).join(', ')} from TMods`,
    });
}
