import axios from 'axios';
import { t } from '../i18n';
import { activeManifestUrl, profileManifest } from './manifests';

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
        return t('services.manifest.notFound');
    }
    if (status >= 500) {
        return t('services.manifest.serverError', { status });
    }
    return error.message;
}

// Throws an Error with a user-facing message if `url` doesn't serve a usable manifest.
export async function validateManifestUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(t('services.manifest.invalidUrl'));
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(t('services.manifest.badProtocol'));
    }

    let manifest;
    try {
        manifest = await fetchManifest(url);
    } catch (error) {
        throw new Error(t('services.manifest.loadFailed', { reason: describeLoadError(error) }), { cause: error });
    }
    if (!manifest || typeof manifest !== 'object' || !manifest.versions || typeof manifest.versions !== 'object') {
        throw new Error(t('services.manifest.notManifest'));
    }
}

// The manifest the current profile follows, downloaded (with retries). Other features
// that read the manifest, such as the servers list, start from this.
export function fetchCurrentManifest() {
    return fetchManifest(activeManifestUrl());
}

// The manifest `profile` follows, downloaded (with retries).
export function fetchProfileManifest(profile) {
    return fetchManifest(profileManifest(profile)?.url || '');
}

export async function fetchVersions(categoryId) {
    const manifest = await fetchCurrentManifest();
    return versionsNewestFirst(manifest, categoryId);
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
    const manifest = await fetchCurrentManifest();
    return Object.fromEntries(categoryIds.map(id => [id, latestVersion(manifest, id)]));
}

// Whether a pack is a set of exact versions of the other categories ({ id, versions:
// { mods: '2.1.1', ... } }, from the manifest's packSets), as opposed to a pack published
// before sets as one .mrpack (versions.packs, with a url).
export function isPackSet(pack) {
    return Boolean(pack?.versions) && typeof pack.versions === 'object' && !Array.isArray(pack.versions);
}

// Every pack the channel publishes, newest first: the sets (packSets) and the .mrpack
// packs published before sets (versions.packs).
export function packVersions(manifest) {
    const sets = Array.isArray(manifest?.packSets) ? manifest.packSets.filter(isPackSet) : [];
    return [...sets, ...versionsNewestFirst(manifest, 'packs')].sort(compareIdsDescending);
}

// The packs the channel publishes and where a profile stands with them, from a single
// fetch of the manifest. `installedId` is the pack version the profile has (null when
// none) and `pinned` whether the profile keeps it (services/pins.js).
// Returns { packs, latest, installed, pinned, newer, outdated, changes }: `packs` newest
// first, `latest` the one with the highest version number (null when there are none),
// `newer` whether the profile has an older (or other) one than `latest`, `outdated`
// whether that should be offered as an update (not when the profile keeps its version),
// and `changes` the changelog entries to show: what updating brings, or just the latest
// version's when the profile is up to date or has no pack yet.
export async function fetchPackUpdates(installedId = null, pinned = false) {
    const manifest = await fetchCurrentManifest();
    const packs = packVersions(manifest);
    const latest = packs[0] || null;
    const newer = Boolean(installedId && latest && latest.id !== installedId);
    const kept = Boolean(installedId && pinned);
    const changes = newer ? since(packs, installedId, latest) : latest ? [latest] : [];
    return {
        packs,
        latest,
        installed: installedId,
        pinned: kept,
        newer,
        outdated: newer && !kept,
        changes: changelogEntries(changes),
    };
}

// The text a manifest version carries in its optional `changelog` field, or ''.
export function changelogOf(version) {
    return typeof version?.changelog === 'string' ? version.changelog.trim() : '';
}

// The versions updating from `installedId` to `latest` brings, newest first: the ones
// from `latest` down to (but not including) the installed one. When the installed one
// isn't listed (or nothing is installed), only `latest` is returned.
export function versionsSince(manifest, categoryId, installedId, latest = latestVersion(manifest, categoryId)) {
    return since(versionsNewestFirst(manifest, categoryId), installedId, latest);
}

// versionsSince over a list of versions already newest first.
function since(versions, installedId, latest) {
    if (!latest) {
        return [];
    }
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
    const manifest = await fetchCurrentManifest();
    return Object.fromEntries(
        Object.entries(installed).map(([id, installedId]) => {
            const latest = latestVersion(manifest, id);
            const changes = latest && latest.id !== installedId ? versionsSince(manifest, id, installedId, latest) : [];
            return [id, { latest, changes: changelogEntries(changes) }];
        }),
    );
}
