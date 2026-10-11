import axios from 'axios';

const fs = window.require('fs');
const os = window.require('os');
const path = window.require('path');
const { Buffer } = window.require('buffer');
const AdmZip = window.require('adm-zip');

// Every function below works on a game folder passed in as `gameDir`, so the same
// install, backup and restore logic applies to any profile folder. It defaults to
// the standard .minecraft folder.
export const defaultGameDir = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');

// How many backups each category keeps; older ones are deleted after a new one is made.
export const MAX_BACKUPS = 5;

function stateDir(category, gameDir) {
    return path.join(gameDir, '.tmods_loader', category.id);
}

function installedMarker(category, gameDir) {
    return path.join(stateDir(category, gameDir), 'downloaded.txt');
}

function backupsDir(category, gameDir) {
    return path.join(stateDir(category, gameDir), 'backups');
}

export function readInstalledVersion(category, gameDir = defaultGameDir) {
    const marker = installedMarker(category, gameDir);
    return fs.existsSync(marker) ? fs.readFileSync(marker, 'utf-8') : '';
}

function writeInstalledVersion(category, versionId, gameDir) {
    fs.mkdirSync(stateDir(category, gameDir), { recursive: true });
    if (versionId) {
        fs.writeFileSync(installedMarker(category, gameDir), versionId, 'utf-8');
    } else {
        fs.rmSync(installedMarker(category, gameDir), { force: true });
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

// Lists a category's backups, newest first, as { id, createdAt, version }.
export function listBackups(category, gameDir = defaultGameDir) {
    const dir = backupsDir(category, gameDir);
    if (!category.backupFolder || !fs.existsSync(dir)) {
        return [];
    }
    return fs.readdirSync(dir)
        .map(id => {
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(dir, id, 'backup.json'), 'utf-8'));
                return { id, createdAt: meta.createdAt, version: meta.version || '' };
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
    const meta = { createdAt: new Date().toISOString(), version: readInstalledVersion(category, gameDir) };
    fs.writeFileSync(path.join(target, 'backup.json'), JSON.stringify(meta), 'utf-8');
}

// Downloads a version's zip and extracts it over .minecraft, then records it as installed.
export async function installBundle(category, version, gameDir = defaultGameDir) {
    const response = await axios.get(version.url, { responseType: 'arraybuffer' });

    fs.mkdirSync(stateDir(category, gameDir), { recursive: true });
    const zipFile = path.join(stateDir(category, gameDir), `${category.id}.zip`);
    fs.writeFileSync(zipFile, Buffer.from(response.data));

    try {
        if (category.backupFolder) {
            backupFolder(category, gameDir);
            pruneBackups(category, gameDir);
            if (category.clearFolder) {
                fs.rmSync(path.join(gameDir, category.backupFolder), { recursive: true, force: true });
            }
        }
        new AdmZip(zipFile).extractAllTo(gameDir, true);
    } finally {
        fs.unlinkSync(zipFile);
    }

    writeInstalledVersion(category, version.id, gameDir);
}

// Replaces the category's folder with a backup's contents. The current folder is
// backed up first, so a restore can itself be undone.
export function restoreBackup(category, backupId, gameDir = defaultGameDir) {
    const backup = listBackups(category, gameDir).find(b => b.id === backupId);
    if (!backup) {
        throw new Error(`Backup ${backupId} not found for ${category.id}`);
    }
    const source = path.join(backupsDir(category, gameDir), backup.id, 'files');
    const folder = path.join(gameDir, category.backupFolder);

    backupFolder(category, gameDir);
    fs.rmSync(folder, { recursive: true, force: true });
    fs.cpSync(source, folder, { recursive: true });
    writeInstalledVersion(category, backup.version, gameDir);
    // Prune only now, so the backup being restored is never deleted before it is copied.
    pruneBackups(category, gameDir);
}
