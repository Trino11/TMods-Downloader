import axios from 'axios';
import { getManifestUrl } from './settings';

// Waits between tries of the manifest download. Gateway errors (502, 503, 504) and
// dropped connections are usually brief hiccups on the host's side, GitHub release links
// included, so the download is tried again before giving up.
export const RETRY_DELAYS_MS = [1000, 3000];

function worthRetrying(error) {
    const status = error?.response?.status;
    return status === undefined || status === 429 || status >= 500;
}

async function fetchManifest(url) {
    for (let attempt = 0; ; attempt++) {
        try {
            const { data } = await axios.get(url);
            return data;
        } catch (error) {
            if (attempt >= RETRY_DELAYS_MS.length || !worthRetrying(error)) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
    }
}

// What went wrong loading a manifest, in words a player can act on.
function describeLoadError(error) {
    const status = error?.response?.status;
    if (status === 404) {
        return 'Nothing was found at that address (404). Check the link, and that the bundles repository has published a release.';
    }
    if (status >= 500) {
        return `The server did not answer properly (status ${status}). This is usually temporary, so try again in a minute.`;
    }
    return error.message;
}

// Throws an Error with a user-facing message if `url` doesn't serve a usable manifest.
export async function validateManifestUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('That is not a valid URL.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('The URL must start with http:// or https://.');
    }

    let manifest;
    try {
        manifest = await fetchManifest(url);
    } catch (error) {
        throw new Error(`Could not load the manifest: ${describeLoadError(error)}`, { cause: error });
    }
    if (!manifest || typeof manifest !== 'object' || !manifest.versions || typeof manifest.versions !== 'object') {
        throw new Error('The URL loaded, but it is not a TMods manifest (no "versions" field).');
    }
}

export async function fetchVersions(categoryId) {
    const manifest = await fetchManifest(getManifestUrl());
    return versionsNewestFirst(manifest, categoryId);
}

// The whole packs the channel publishes (its packs category), newest first. Players
// import them into a profile from the Packs page.
export async function fetchPacks() {
    const manifest = await fetchManifest(getManifestUrl());
    return versionsNewestFirst(manifest, 'packs');
}

// Newest first, comparing the numbers in ids as numbers (1.10.0 comes before 1.9.0), the
// same order the bundles publish action lists them in. Hand-made manifests may list
// versions in any order, so the app never trusts the order it gets.
function compareIdsDescending(a, b) {
    return String(b.id).localeCompare(String(a.id), 'en', { numeric: true, sensitivity: 'base' });
}

// The versions of a category, newest first.
export function versionsNewestFirst(manifest, categoryId) {
    const versions = manifest?.versions?.[categoryId];
    return Array.isArray(versions) ? [...versions].sort(compareIdsDescending) : [];
}

// The version of a category to install when the player asks for "the latest": the one
// with the highest version number.
export function latestVersion(manifest, categoryId) {
    return versionsNewestFirst(manifest, categoryId)[0] || null;
}

// The latest version of each category, keyed by category id (null when it has none),
// from a single fetch of the manifest.
export async function fetchLatestVersions(categoryIds) {
    const manifest = await fetchManifest(getManifestUrl());
    return Object.fromEntries(categoryIds.map(id => [id, latestVersion(manifest, id)]));
}

// The latest whole pack the channel publishes (its packs category), or null when there
// is none. Home offers it as a one-click download.
export async function fetchLatestPack() {
    const manifest = await fetchManifest(getManifestUrl());
    return latestVersion(manifest, 'packs');
}

// The text a manifest version carries in its optional `changelog` field, or ''.
export function changelogOf(version) {
    return typeof version?.changelog === 'string' ? version.changelog.trim() : '';
}

// The versions updating from `installedId` to `latest` brings, newest first: the ones
// from `latest` down to (but not including) the installed one. When the installed one
// isn't listed (or nothing is installed), only `latest` is returned.
export function versionsSince(manifest, categoryId, installedId, latest = latestVersion(manifest, categoryId)) {
    if (!latest) {
        return [];
    }
    const versions = versionsNewestFirst(manifest, categoryId);
    const from = versions.indexOf(latest);
    const to = installedId ? versions.findIndex(version => version.id === installedId) : -1;
    return from !== -1 && to > from ? versions.slice(from, to) : [latest];
}

// Changelog entries (as the Changelog component shows them) for manifest versions,
// leaving out the ones without a changelog.
export function changelogEntries(versions) {
    return versions
        .filter(version => changelogOf(version))
        .map(version => ({ id: version.id, label: version.id, text: changelogOf(version) }));
}

// The latest version of each category plus the changelog entries of every version
// newer than the installed one, from a single fetch of the manifest.
// `installed` maps category ids to installed version ids.
export async function fetchChannelUpdates(installed) {
    const manifest = await fetchManifest(getManifestUrl());
    return Object.fromEntries(
        Object.entries(installed).map(([id, installedId]) => {
            const latest = latestVersion(manifest, id);
            const changes = latest && latest.id !== installedId ? versionsSince(manifest, id, installedId, latest) : [];
            return [id, { latest, changes: changelogEntries(changes) }];
        }),
    );
}
