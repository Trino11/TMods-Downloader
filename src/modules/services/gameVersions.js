// Every Minecraft version a profile can use. The list comes from Mojang's public
// version manifest, the same one the official launcher reads, so any version picked
// here is downloaded by the launcher on first Play. The last list fetched is kept so
// the picker still works offline, and versions installed in .minecraft/versions
// (Fabric, Forge, NeoForge...) are always offered too.
import axios from 'axios';
import { LATEST_RELEASE, LATEST_SNAPSHOT, listGameVersions } from './profiles';

export const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

const CACHE_KEY = 'tmods.versionManifest';

export function readCachedVersions() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
        return Array.isArray(cached) ? cached : [];
    } catch {
        return [];
    }
}

// Mojang lists versions newest first; only the id and type are kept.
export async function fetchMojangVersions() {
    const { data } = await axios.get(VERSION_MANIFEST_URL);
    if (!Array.isArray(data?.versions)) {
        throw new Error('The Minecraft version list has an unexpected format.');
    }
    const versions = data.versions
        .filter(version => version && typeof version.id === 'string')
        .map(version => ({ id: version.id, type: version.type }));
    localStorage.setItem(CACHE_KEY, JSON.stringify(versions));
    return versions;
}

// Builds the picker's options: the launcher's "latest" aliases, then versions that
// are installed but not Mojang's own (mod loaders), then every Mojang version.
// Each option is { id, type, installed }, type being 'alias', 'installed', 'release',
// 'snapshot', 'old_beta' or 'old_alpha'.
export function buildVersionOptions(mojangVersions, installed = listGameVersions()) {
    const installedIds = installed.filter(id => id !== LATEST_RELEASE && id !== LATEST_SNAPSHOT);
    const installedSet = new Set(installedIds);
    const known = new Set(mojangVersions.map(version => version.id));
    return [
        { id: LATEST_RELEASE, type: 'alias', installed: false },
        { id: LATEST_SNAPSHOT, type: 'alias', installed: false },
        ...installedIds.filter(id => !known.has(id)).map(id => ({ id, type: 'installed', installed: true })),
        ...mojangVersions.map(version => ({ ...version, installed: installedSet.has(version.id) })),
    ];
}

// Releases, aliases and installed versions show by default; snapshots and the old
// alpha/beta versions only with `showAll`. The search matches anywhere in the id.
// `keep` (the version currently picked) is never filtered out.
export function filterVersionOptions(options, { query = '', showAll = false, keep } = {}) {
    const needle = query.trim().toLowerCase();
    return options.filter(option => {
        if (option.id === keep) {
            return true;
        }
        if (!showAll && !option.installed && option.type !== 'alias' && option.type !== 'release') {
            return false;
        }
        return !needle || option.id.toLowerCase().includes(needle);
    });
}

const TYPE_LABELS = {
    snapshot: 'snapshot',
    old_beta: 'beta',
    old_alpha: 'alpha',
};

export function versionLabel(option) {
    if (option.id === LATEST_RELEASE) {
        return 'Latest release';
    }
    if (option.id === LATEST_SNAPSHOT) {
        return 'Latest snapshot';
    }
    const notes = [TYPE_LABELS[option.type], option.installed && 'installed'].filter(Boolean);
    return notes.length ? `${option.id} (${notes.join(', ')})` : option.id;
}
