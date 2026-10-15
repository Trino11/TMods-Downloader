// Publishing to the player's bundles repository: a .mrpack (a profile's picked files
// exported by the Packs page, or a file the player already has) committed as
// bundles/<category>/<version>/pack.mrpack into one or more categories, each getting only
// the files of its kind, and optionally a pack: bundles/packs/<version>/bundle.json
// listing the category versions players install together. The repository's publish
// workflow then builds the release players read.
import categories from '../categories';
import { filterMrpack } from './mrpack';
import { RESOURCE_PACK, readServers, readServersData } from './servers';
import { github } from './node';
import { getBundlesRepo } from './settings';
import { activeManifestUrl } from './manifests';
import { t } from '../i18n';

const MANIFEST_ON_GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/releases\//;

// Where a published .mrpack's files can go: the categories the bundle pages install as
// zips, and the server list. `kinds` are the pack kinds (packKinds.js) a category takes.
// Packs aren't one of them: a pack lists versions of these (publishPack's `pack`).
export const PACKS_CATEGORY = 'packs';
// Not a versioned category: the channel's Multiplayer server list (bundles/servers.json),
// which every player's profiles follow. Publishing it replaces the list.
export const SERVERS_CATEGORY = 'servers';
const CATEGORY_KINDS = {
    mods: ['mod'],
    schematics: ['schematic'],
    resourcepacks: ['resourcepack'],
    configs: ['config'],
    shaderpacks: ['shader'],
};
export const PUBLISH_CATEGORIES = [
    ...categories.map(category => ({
        id: category.id,
        get label() {
            return category.label;
        },
        kinds: CATEGORY_KINDS[category.id],
    })),
    {
        id: SERVERS_CATEGORY,
        get label() {
            return t('services.bundlePublish.serversCategory');
        },
        kinds: ['servers'],
        unversioned: true,
    },
];

// Whether category `id` gets a new version folder (every category but the server list).
export function isVersioned(id) {
    return !publishCategory(id)?.unversioned;
}

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

// The repository the current profile's manifest is published from, or '' when it isn't
// a GitHub release link.
export function manifestRepo() {
    return activeManifestUrl().match(MANIFEST_ON_GITHUB)?.[1] || '';
}

// The saved bundles repository, or the one the current profile's manifest is published from.
export function bundlesRepo() {
    return getBundlesRepo() || manifestRepo();
}

// The newest of `existing` (folder names), comparing numbers as numbers like the
// publisher does, or undefined when there are none.
export function newestVersion(existing) {
    return [...existing].sort((a, b) => b.localeCompare(a, 'en', { numeric: true, sensitivity: 'base' }))[0];
}

// The version to suggest after `existing` (folder names): the newest one with its last
// number raised by one.
export function nextVersion(existing) {
    const newest = newestVersion(existing);
    const match = newest?.match(/^(.*?)(\d+)(\D*)$/);
    if (!match) {
        return '1.0.0';
    }
    // Keeps zero padding, so 2024-06 becomes 2024-07.
    const number = String(Number(match[2]) + 1).padStart(match[2].length, '0');
    return `${match[1]}${number}${match[3]}`;
}

// The servers a pack's items carry (the servers.dat item of readPack), or [] when none.
export function serversOfPack(pack) {
    const data = pack?.items?.find(item => item.kind === 'servers')?.files.find(file => file.data)?.data;
    return data ? readServersData(data) : [];
}

// The servers in a game folder's list.
export function serversOfProfile(gameDir) {
    return readServers(gameDir);
}

// Servers as servers.json lists them: what the game asks about a server's resource pack
// is the default, so it is left out.
function channelServers(servers) {
    return servers.map(({ name, address, resourcePack }) => ({
        name,
        address,
        ...(resourcePack && resourcePack !== RESOURCE_PACK.PROMPT ? { resourcePack } : {}),
    }));
}

export function existingVersions(repo, category) {
    return github.versions(repo, category);
}

// Publishes a .mrpack (its bytes) as a new version of each of `versions` ([{ category,
// version }]), all in one commit: each category gets a pack with only the files of its
// kind. The optional text goes in each version's bundle.json. `pack` ({ version, versions:
// { mods: '2.1.1', ... } }), when given, adds that pack version, listing the category
// versions it installs (the ones published here among them). `servers` (the server
// list's entries, as servers.js reads them), when given, replace the channel's server
// list in the same commit. `versions` may be empty when a pack or the servers go out.
// Resolves to { commitUrl, actionsUrl }.
export async function publishPack({ repo, versions = [], data, description = '', changelog = '', servers, pack }) {
    const metadata = {};
    if (description.trim()) {
        metadata.description = description.trim();
    }
    if (changelog.trim()) {
        metadata.changelog = changelog.trim();
    }
    const published = versions.map(({ category, version }) => {
        const { kinds, label } = publishCategory(category);
        const part = filterMrpack(data, kinds);
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
    const summary = versions.map(({ category, version }) => `${category} ${version}`);
    if (pack) {
        if (Object.keys(pack.versions).length === 0) {
            throw new Error(t('services.bundlePublish.emptyPack'));
        }
        const list = { ...metadata, versions: pack.versions };
        published.push({
            category: PACKS_CATEGORY,
            version: pack.version,
            files: [{ name: 'bundle.json', data: JSON.stringify(list, null, 2) + '\n' }],
        });
        summary.push(`pack ${pack.version}`);
    }
    if (servers) {
        summary.push('the server list');
    }
    return github.publish({
        repo,
        versions: published,
        ...(servers ? { servers: channelServers(servers) } : {}),
        message: `${published.length ? 'Add' : 'Update'} ${summary.join(', ')} from TMods`,
    });
}
