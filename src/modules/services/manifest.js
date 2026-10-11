import axios from 'axios';
import { getManifestUrl } from './settings';

async function fetchManifest(url) {
    const { data } = await axios.get(url);
    return data;
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
        throw new Error(`Could not load the manifest: ${error.message}`, { cause: error });
    }
    if (!manifest || typeof manifest !== 'object' || !manifest.versions || typeof manifest.versions !== 'object') {
        throw new Error('The URL loaded, but it is not a TMods manifest (no "versions" field).');
    }
}

export async function fetchVersions(categoryId) {
    const manifest = await fetchManifest(getManifestUrl());
    return manifest.versions[categoryId] || [];
}

// The version of a category to install when the player asks for "the latest". The
// manifest can name it under `latest` (by id, as the first TMods manifests did);
// otherwise it is the first one listed.
export function latestVersion(manifest, categoryId) {
    const versions = manifest?.versions?.[categoryId] || [];
    const named = manifest?.latest?.[categoryId];
    const id = typeof named === 'object' && named ? named.id : named;
    return versions.find(version => version.id === id) || versions[0] || null;
}

// The latest version of each category, keyed by category id (null when it has none),
// from a single fetch of the manifest.
export async function fetchLatestVersions(categoryIds) {
    const manifest = await fetchManifest(getManifestUrl());
    return Object.fromEntries(categoryIds.map(id => [id, latestVersion(manifest, id)]));
}

// The text a manifest version carries in its optional `changelog` field, or ''.
export function changelogOf(version) {
    return typeof version?.changelog === 'string' ? version.changelog.trim() : '';
}

// The versions updating from `installedId` to `latest` brings, newest first. Manifests
// list versions newest first, so these are the ones from `latest` down to (but not
// including) the installed one. When the installed one isn't listed (or nothing is
// installed), only `latest` is returned.
export function versionsSince(manifest, categoryId, installedId, latest = latestVersion(manifest, categoryId)) {
    if (!latest) {
        return [];
    }
    const versions = manifest?.versions?.[categoryId] || [];
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
