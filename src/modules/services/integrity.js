// "Is what's on disk still exactly what was downloaded?" for a category's install.
// Installing records every file the bundle wrote, with its sha256, and whether the
// install replaced the category's folder or was added to what was there. Checking
// compares the game folder with that record.
import { crypto, fs, path } from './node';

// Files that change on their own after an install: the server list is merged with the
// player's at install and synced from the manifest every time the app opens.
const IGNORED = new Set(['servers.dat']);

function recordFile(category, gameDir) {
    return path.join(gameDir, '.tmods_loader', category.id, 'files.json');
}

function onDisk(gameDir, name) {
    return path.join(gameDir, ...name.split('/'));
}

// Every file now in the category's folder, named from the game folder with forward
// slashes ("mods/sodium.jar").
function folderFiles(category, gameDir) {
    if (!category.backupFolder) {
        return [];
    }
    const folder = path.join(gameDir, category.backupFolder);
    if (!fs.existsSync(folder)) {
        return [];
    }
    return fs
        .walkSync(folder)
        .map(file => `${category.backupFolder}/${file.name}`)
        .filter(name => !IGNORED.has(name));
}

// The record of the last install, or null when there is none (nothing installed, or
// installed before TMods kept records).
export function readRecord(category, gameDir) {
    const file = recordFile(category, gameDir);
    if (!fs.existsSync(file)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return null;
    }
}

// Saves a record (from readRecord or recordInstall), or removes it when given null.
export function writeRecord(category, gameDir, record) {
    const file = recordFile(category, gameDir);
    if (!record) {
        fs.rmSync(file, { force: true });
        return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(record));
}

// Records an install that just copied `written` (file names from the game folder, with
// forward slashes) into `gameDir`. Without `replace`, the files already in the category's
// folder that the bundle didn't overwrite are remembered too, as what it was merged with.
export function recordInstall(category, versionId, gameDir, { written, replace }) {
    const files = {};
    for (const name of written) {
        if (IGNORED.has(name)) {
            continue;
        }
        const full = onDisk(gameDir, name);
        const { size, mtimeMs } = fs.statSync(full);
        files[name] = { size, mtimeMs, sha256: crypto.hashFile('sha256', full) };
    }
    const kept = replace ? [] : folderFiles(category, gameDir).filter(name => !Object.hasOwn(files, name));
    writeRecord(category, gameDir, {
        version: versionId,
        mode: replace ? 'replace' : 'merge',
        installedAt: new Date().toISOString(),
        files,
        kept,
    });
}

// Compares the game folder with the record of `installedVersion`. Returns null when
// nothing is installed, { tracked: false } when there is no record for that version, and
// otherwise { tracked: true, modified, merged, changed, added, removed }, each list being
// file names: `merged` the player's own files the install was added to (and that are
// still there), `changed` downloaded files whose bytes differ now, `added` files in the
// category's folder that came later, `removed` downloaded files that are gone.
// A file whose size and modification time match the record isn't read again.
export function checkIntegrity(category, gameDir, installedVersion) {
    if (!installedVersion) {
        return null;
    }
    const record = readRecord(category, gameDir);
    if (!record || record.version !== installedVersion || !record.files) {
        return { tracked: false };
    }
    const changed = [];
    const removed = [];
    for (const [name, expected] of Object.entries(record.files)) {
        const full = onDisk(gameDir, name);
        if (!fs.existsSync(full)) {
            removed.push(name);
            continue;
        }
        const { size, mtimeMs } = fs.statSync(full);
        if (size !== expected.size) {
            changed.push(name);
        } else if (mtimeMs !== expected.mtimeMs && crypto.hashFile('sha256', full) !== expected.sha256) {
            changed.push(name);
        }
    }
    const kept = new Set(record.kept || []);
    const present = folderFiles(category, gameDir);
    const merged = present.filter(name => kept.has(name));
    const added = present.filter(name => !Object.hasOwn(record.files, name) && !kept.has(name));
    return {
        tracked: true,
        modified: merged.length + changed.length + added.length + removed.length > 0,
        merged,
        changed,
        added,
        removed,
    };
}

// checkIntegrity that never throws: a folder that can't be read shows no status.
export function safeCheckIntegrity(category, gameDir, installedVersion) {
    try {
        return checkIntegrity(category, gameDir, installedVersion);
    } catch (error) {
        console.error(`Could not check ${category.id} files:`, error);
        return null;
    }
}
