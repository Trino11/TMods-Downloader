import axios from 'axios';
import { managedFileNames } from './modrinthMods';
import { crypto, fs, path, zip } from './node';
import { defaultGameDir } from './paths';
import { activeManifestUrl } from './manifests';
import { t } from '../i18n';

// Every function below works on a game folder passed in as `gameDir`, so the same
// install, backup and restore logic applies to any profile folder. It defaults to
// the standard .minecraft folder.

// How many backups each category keeps; older ones are deleted after a new one is made.
export const MAX_BACKUPS = 5;

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function stateDir(category, gameDir) {
    return path.join(gameDir, '.tmods_loader', category.id);
}

function installedMarker(category, gameDir) {
    return path.join(stateDir(category, gameDir), 'downloaded.txt');
}

function backupsDir(category, gameDir) {
    return path.join(stateDir(category, gameDir), 'backups');
}

// The manifest URL the installed version came from, next to the version marker.
function sourceMarker(category, gameDir) {
    return path.join(stateDir(category, gameDir), 'manifest.txt');
}

function readInstalledSource(category, gameDir) {
    const marker = sourceMarker(category, gameDir);
    return fs.existsSync(marker) ? fs.readFileSync(marker, 'utf-8') : '';
}

// The version of the category installed from `manifestUrl` (the current profile's
// manifest by default), or '' when nothing is. A version installed from another
// manifest doesn't count, since its version number means nothing in this one.
// Installs made before the app recorded where they came from count as this manifest's.
export function readInstalledVersion(category, gameDir = defaultGameDir, manifestUrl = activeManifestUrl()) {
    const marker = installedMarker(category, gameDir);
    if (!fs.existsSync(marker)) {
        return '';
    }
    const source = readInstalledSource(category, gameDir);
    return source && manifestUrl && source !== manifestUrl ? '' : fs.readFileSync(marker, 'utf-8');
}

function writeInstalledVersion(category, versionId, gameDir, manifestUrl) {
    fs.mkdirSync(stateDir(category, gameDir), { recursive: true });
    if (versionId) {
        fs.writeFileSync(installedMarker(category, gameDir), versionId, 'utf-8');
    } else {
        fs.rmSync(installedMarker(category, gameDir), { force: true });
    }
    if (versionId && manifestUrl) {
        fs.writeFileSync(sourceMarker(category, gameDir), manifestUrl, 'utf-8');
    } else {
        fs.rmSync(sourceMarker(category, gameDir), { force: true });
    }
}

// Backup ids are timestamps, so sorting them by name also sorts them by age.
function newBackupId(category, gameDir) {
    const base = new Date().toISOString().replace(/[:.]/g, '-');
    let id = base;
    for (let n = 1; fs.existsSync(path.join(backupsDir(category, gameDir), id)); n++) {
        id = `${base}_${n}`;
    }
    return id;
}

// Lists a category's backups, newest first, as { id, createdAt, version, manifest }
// (`manifest` is the URL the backed-up version came from, '' when unknown).
export function listBackups(category, gameDir = defaultGameDir) {
    const dir = backupsDir(category, gameDir);
    if (!category.backupFolder || !fs.existsSync(dir)) {
        return [];
    }
    return fs
        .readdirSync(dir)
        .map(id => {
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(dir, id, 'backup.json'), 'utf-8'));
                return { id, createdAt: meta.createdAt, version: meta.version || '', manifest: meta.manifest || '' };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => (a.id < b.id ? 1 : -1));
}

function pruneBackups(category, gameDir) {
    for (const backup of listBackups(category, gameDir).slice(MAX_BACKUPS)) {
        fs.rmSync(path.join(backupsDir(category, gameDir), backup.id), { recursive: true, force: true });
    }
}

// Copies the category's folder into a new timestamped backup, tagged with the
// version installed at the time. Callers prune afterwards.
function backupFolder(category, gameDir) {
    const folder = path.join(gameDir, category.backupFolder);
    if (!fs.existsSync(folder)) {
        return;
    }
    const target = path.join(backupsDir(category, gameDir), newBackupId(category, gameDir));
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(folder, path.join(target, 'files'), { recursive: true });
    const marker = installedMarker(category, gameDir);
    const meta = {
        createdAt: new Date().toISOString(),
        version: fs.existsSync(marker) ? fs.readFileSync(marker, 'utf-8') : '',
        manifest: readInstalledSource(category, gameDir),
    };
    fs.writeFileSync(path.join(target, 'backup.json'), JSON.stringify(meta), 'utf-8');
}

// Empties the category's folder so the bundle replaces it, except for mods installed
// from Modrinth: the bundle doesn't know about them, so they stay.
function clearFolder(category, gameDir) {
    const folder = path.join(gameDir, category.backupFolder);
    const keep = category.backupFolder === 'mods' ? managedFileNames(gameDir) : new Set();
    if (keep.size === 0) {
        fs.rmSync(folder, { recursive: true, force: true });
        return;
    }
    for (const name of fs.readdirSync(folder)) {
        if (!keep.has(name)) {
            fs.rmSync(path.join(folder, name), { recursive: true, force: true });
        }
    }
}

// Downloads a version's zip and extracts it over the game folder, then records it as
// installed. The zip is checked and unpacked into a staging folder first, so a failed
// download or a broken zip never touches the player's files. When the manifest lists
// a `sha256` for the version, the download must match it.
export async function installBundle(category, version, gameDir = defaultGameDir) {
    const response = await axios.get(version.url, { responseType: 'arraybuffer' });
    const data = new Uint8Array(response.data);
    if (version.sha256 && sha256(data) !== version.sha256.toLowerCase()) {
        throw new Error(t('services.bundleInstaller.corruptDownload', { id: version.id }));
    }

    const staging = path.join(stateDir(category, gameDir), 'staging');
    fs.rmSync(staging, { recursive: true, force: true });
    try {
        try {
            zip.extract(data, staging);
        } catch (error) {
            if (/not a valid zip/i.test(error.message)) {
                throw new Error(t('services.bundleInstaller.notZip', { id: version.id }), { cause: error });
            }
            throw error;
        }

        if (category.backupFolder) {
            backupFolder(category, gameDir);
            pruneBackups(category, gameDir);
            if (category.clearFolder) {
                clearFolder(category, gameDir);
            }
        }
        fs.cpSync(staging, gameDir, { recursive: true });
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }

    writeInstalledVersion(category, version.id, gameDir, activeManifestUrl());
}

// Replaces the category's folder with a backup's contents. The current folder is
// backed up first, so a restore can itself be undone.
export function restoreBackup(category, backupId, gameDir = defaultGameDir) {
    const backup = listBackups(category, gameDir).find(b => b.id === backupId);
    if (!backup) {
        throw new Error(t('services.bundleInstaller.backupNotFound', { id: backupId, category: category.id }));
    }
    const source = path.join(backupsDir(category, gameDir), backup.id, 'files');
    const folder = path.join(gameDir, category.backupFolder);

    backupFolder(category, gameDir);
    fs.rmSync(folder, { recursive: true, force: true });
    fs.cpSync(source, folder, { recursive: true });
    writeInstalledVersion(category, backup.version, gameDir, backup.manifest);
    // Prune only now, so the backup being restored is never deleted before it is copied.
    pruneBackups(category, gameDir);
}
