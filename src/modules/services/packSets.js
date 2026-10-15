// Packs that are sets of exact versions of the other categories (the manifest's
// packSets): installing one installs each of those category versions the way its own
// page would, so the categories then show as up to date and keep their own backups.
import categories from '../categories';
import { fetchCurrentManifest, versionsNewestFirst } from './manifest';
import { installBundle, readInstalledVersion } from './bundleInstaller';
import { activeManifestUrl } from './manifests';
import { readInstalledPackVersions, writeInstalledPack } from './mrpack';
import { PACKS, setPinned } from './pins';
import { t } from '../i18n';

function order(id) {
    const index = categories.findIndex(category => category.id === id);
    return index === -1 ? categories.length : index;
}

// What a pack set installs, in the sidebar's category order: [{ categoryId, category,
// versionId, version }]. `category` is null for a category this app doesn't know, and
// `version` (the manifest entry) null when the manifest doesn't list that version.
export function packSetParts(manifest, pack) {
    return Object.entries(pack.versions)
        .map(([categoryId, versionId]) => {
            const category = categories.find(item => item.id === categoryId) || null;
            const version = category
                ? versionsNewestFirst(manifest, categoryId).find(item => item.id === versionId) || null
                : null;
            return { categoryId, category, versionId, version };
        })
        .sort((a, b) => order(a.categoryId) - order(b.categoryId));
}

// packSetParts, with the current profile's manifest downloaded.
export async function fetchPackSetParts(pack) {
    return packSetParts(await fetchCurrentManifest(), pack);
}

// The parts a game folder already has at the pack's version.
export function installedParts(parts, gameDir) {
    return parts.filter(part => part.category && readInstalledVersion(part.category, gameDir) === part.versionId);
}

// The game folders installing the parts writes into, for the replace-or-add question.
export function partFolders(parts) {
    return [...new Set(parts.map(part => part.category?.backupFolder).filter(Boolean))];
}

// "Keep this version" for a pack: the profile keeps the pack and every category version it
// installed, so neither the pack nor those categories are offered newer versions.
export function setPackKept(gameDir, keep, versions = readInstalledPackVersions(gameDir)) {
    setPinned(gameDir, PACKS, keep);
    for (const categoryId of Object.keys(versions || {})) {
        setPinned(gameDir, categoryId, keep);
    }
}

// Installs every part of `pack` into `gameDir`, one category after the other, each backed
// up first and replacing (`replace`, the default) or adding to its folder like its own
// page's Download. The pack is recorded as installed only when every part went in;
// otherwise this throws, naming the ones that failed (the others stay installed).
// `keepVersion` says whether the profile keeps the pack (setPackKept).
export async function installPackSet(pack, parts, gameDir, { replace = true, keepVersion = false } = {}) {
    const missing = parts.filter(part => !part.version);
    if (missing.length > 0) {
        throw new Error(
            t('services.packSets.missing', {
                id: pack.id,
                parts: missing.map(part => `${part.category?.label || part.categoryId} ${part.versionId}`).join(', '),
            }),
        );
    }
    const failures = [];
    for (const part of parts) {
        try {
            await installBundle(part.category, part.version, gameDir, { replace });
        } catch (error) {
            failures.push(`${part.category.label} ${part.versionId}: ${error.message}`);
        }
    }
    if (failures.length > 0) {
        throw new Error(t('services.packSets.failed', { id: pack.id, failures: failures.join('; ') }));
    }
    writeInstalledPack(gameDir, pack.id, activeManifestUrl(), pack.versions);
    setPackKept(gameDir, keepVersion, pack.versions);
}
