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
