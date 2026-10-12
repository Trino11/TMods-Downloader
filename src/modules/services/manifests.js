// The manifests the player follows. Several can be saved, each with a name, and every
// profile picks the one it follows (the first one when it hasn't picked, or when its
// pick was removed). Pages always work with the current profile's manifest.
import { getActiveProfile } from './profiles';
import { t } from '../i18n';

const MANIFESTS_KEY = 'tmods.manifests';
// Before several manifests could be saved, the app kept a single URL here. It is moved
// into the list the first time the list is read, and left in place so an older app
// version still finds it.
const LEGACY_URL_KEY = 'tmods.manifestUrl';

const MANIFEST_ON_GITHUB = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\//i;

// A name for a manifest the player didn't name: the repository for one published on
// GitHub, otherwise the site it comes from.
export function suggestedName(url) {
    const repo = String(url).match(MANIFEST_ON_GITHUB)?.[1];
    if (repo) {
        return repo;
    }
    try {
        return new URL(url).hostname || url;
    } catch {
        return url;
    }
}

function readStored() {
    try {
        const stored = JSON.parse(localStorage.getItem(MANIFESTS_KEY));
        return Array.isArray(stored) ? stored.filter(item => item && item.id && item.url) : [];
    } catch {
        return [];
    }
}

function writeStored(manifests) {
    localStorage.setItem(MANIFESTS_KEY, JSON.stringify(manifests));
}

function newId(taken) {
    let n = taken.length + 1;
    while (taken.some(item => item.id === `manifest-${n}`)) {
        n++;
    }
    return `manifest-${n}`;
}

function cleanEntry({ name, url }) {
    const trimmedUrl = (url || '').trim();
    if (!trimmedUrl) {
        throw new Error(t('services.manifests.urlRequired'));
    }
    return { name: (name || '').trim() || suggestedName(trimmedUrl), url: trimmedUrl };
}

// Every saved manifest, as { id, name, url }, in the order they were added.
export function listManifests() {
    const stored = readStored();
    if (stored.length > 0) {
        return stored;
    }
    const legacy = localStorage.getItem(LEGACY_URL_KEY);
    if (!legacy) {
        return [];
    }
    const migrated = [{ id: 'manifest-1', name: suggestedName(legacy), url: legacy }];
    writeStored(migrated);
    return migrated;
}

export function addManifest(entry) {
    const manifests = listManifests();
    const manifest = { id: newId(manifests), ...cleanEntry(entry) };
    writeStored([...manifests, manifest]);
    return manifest;
}

export function updateManifest(id, entry) {
    const manifests = listManifests();
    const manifest = manifests.find(item => item.id === id);
    if (!manifest) {
        throw new Error(t('services.manifests.gone'));
    }
    Object.assign(manifest, cleanEntry(entry));
    writeStored(manifests);
    return manifest;
}

// Profiles that followed the removed manifest go back to the first one. The last
// manifest can't be removed, since the app needs one to work.
export function removeManifest(id) {
    const manifests = listManifests();
    if (manifests.length <= 1) {
        throw new Error(t('services.manifests.lastOne'));
    }
    writeStored(manifests.filter(item => item.id !== id));
}

// The manifest a profile follows, or null when none is saved.
export function profileManifest(profile) {
    const manifests = listManifests();
    return manifests.find(item => item.id === profile?.manifestId) || manifests[0] || null;
}

// The manifest the current profile follows. Everything that reads a manifest (channel
// pages, Home, packs, servers) goes through this.
export function activeManifest() {
    return profileManifest(getActiveProfile());
}

export function activeManifestUrl() {
    return activeManifest()?.url || '';
}
