import axios from 'axios';

const fs = window.require('fs');
const os = window.require('os');
const path = window.require('path');
const { Buffer } = window.require('buffer');
const AdmZip = window.require('adm-zip');

const minecraftDir = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
const stateRoot = path.join(minecraftDir, '.tmods_loader');

// How many backups each category keeps; older ones are deleted after a new one is made.
export const MAX_BACKUPS = 5;

function stateDir(category) {
    return path.join(stateRoot, category.id);
}

function installedMarker(category) {
    return path.join(stateDir(category), 'downloaded.txt');
}

function backupsDir(category) {
    return path.join(stateDir(category), 'backups');
}

export function readInstalledVersion(category) {
    const marker = installedMarker(category);
    return fs.existsSync(marker) ? fs.readFileSync(marker, 'utf-8') : '';
}

function writeInstalledVersion(category, versionId) {
    fs.mkdirSync(stateDir(category), { recursive: true });
    if (versionId) {
        fs.writeFileSync(installedMarker(category), versionId, 'utf-8');
    } else {
        fs.rmSync(installedMarker(category), { force: true });
    }
}

// Backup ids are timestamps, so sorting them by name also sorts them by age.
function newBackupId(category) {
    const base = new Date().toISOString().replace(/[:.]/g, '-');
    let id = base;
    for (let n = 1; fs.existsSync(path.join(backupsDir(category), id)); n++) {
        id = `${base}_${n}`;
    }
    return id;
}

// Lists a category's backups, newest first, as { id, createdAt, version }.
export function listBackups(category) {
    const dir = backupsDir(category);
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

function pruneBackups(category) {
    for (const backup of listBackups(category).slice(MAX_BACKUPS)) {
        fs.rmSync(path.join(backupsDir(category), backup.id), { recursive: true, force: true });
    }
}

// Copies the category's folder into a new timestamped backup, tagged with the
// version installed at the time. Callers prune afterwards.
function backupFolder(category) {
    const folder = path.join(minecraftDir, category.backupFolder);
    if (!fs.existsSync(folder)) {
        return;
    }
    const target = path.join(backupsDir(category), newBackupId(category));
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(folder, path.join(target, 'files'), { recursive: true });
    const meta = { createdAt: new Date().toISOString(), version: readInstalledVersion(category) };
    fs.writeFileSync(path.join(target, 'backup.json'), JSON.stringify(meta), 'utf-8');
}

// Downloads a version's zip and extracts it over .minecraft, then records it as installed.
export async function installBundle(category, version) {
    const response = await axios.get(version.url, { responseType: 'arraybuffer' });

    fs.mkdirSync(stateDir(category), { recursive: true });
    const zipFile = path.join(stateDir(category), `${category.id}.zip`);
    fs.writeFileSync(zipFile, Buffer.from(response.data));

    try {
        if (category.backupFolder) {
            backupFolder(category);
            pruneBackups(category);
            if (category.clearFolder) {
                fs.rmSync(path.join(minecraftDir, category.backupFolder), { recursive: true, force: true });
            }
        }
        new AdmZip(zipFile).extractAllTo(minecraftDir, true);
    } finally {
        fs.unlinkSync(zipFile);
    }

    writeInstalledVersion(category, version.id);
}

// Replaces the category's folder with a backup's contents. The current folder is
// backed up first, so a restore can itself be undone.
export function restoreBackup(category, backupId) {
    const backup = listBackups(category).find(b => b.id === backupId);
    if (!backup) {
        throw new Error(`Backup ${backupId} not found for ${category.id}`);
    }
    const source = path.join(backupsDir(category), backup.id, 'files');
    const folder = path.join(minecraftDir, category.backupFolder);

    backupFolder(category);
    fs.rmSync(folder, { recursive: true, force: true });
    fs.cpSync(source, folder, { recursive: true });
    writeInstalledVersion(category, backup.version);
    // Prune only now, so the backup being restored is never deleted before it is copied.
    pruneBackups(category);
}
