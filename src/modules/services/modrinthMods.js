// Single mods from Modrinth, installed into a game folder's mods/ and tracked in
// <gameDir>/.tmods_loader/modrinth.json. That list is what lets TMods update and remove
// the mods it installed, keep them when a bundle replaces the mods folder, and export
// the folder as a modpack. Jars the player added by hand are left alone.
import axios from 'axios';
import {
    getProjects,
    getProjectVersions,
    getVersion,
    latestVersionsFromHashes,
    pickVersion,
    primaryFile,
    versionsFromHashes,
} from './modrinth';
import { crypto, fs, path } from './node';

const DISABLED_SUFFIX = '.disabled';

function listFile(gameDir) {
    return path.join(gameDir, '.tmods_loader', 'modrinth.json');
}

export function modsDir(gameDir) {
    return path.join(gameDir, 'mods');
}

export function sha1(data) {
    return crypto.createHash('sha1').update(data).digest('hex');
}

export function sha512(data) {
    return crypto.createHash('sha512').update(data).digest('hex');
}

// A mod is disabled the way other launchers do it: its jar renamed to .jar.disabled.
function filePath(gameDir, mod, enabled = mod.enabled) {
    return path.join(modsDir(gameDir), enabled ? mod.fileName : mod.fileName + DISABLED_SUFFIX);
}

function readRaw(gameDir) {
    try {
        const data = JSON.parse(fs.readFileSync(listFile(gameDir), 'utf-8'));
        return { target: data.target || null, mods: Array.isArray(data.mods) ? data.mods : [] };
    } catch {
        return { target: null, mods: [] };
    }
}

function save(gameDir, list) {
    fs.mkdirSync(path.dirname(listFile(gameDir)), { recursive: true });
    const mods = list.mods.map(({ enabled, ...mod }) => mod);
    fs.writeFileSync(listFile(gameDir), JSON.stringify({ target: list.target, mods }, null, 2));
}

// The tracked mods, each with `enabled`. Mods whose jar is gone (deleted by hand, or a
// backup was restored) are forgotten, so the list always matches the folder.
export function readModList(gameDir) {
    const list = readRaw(gameDir);
    const mods = [];
    for (const mod of list.mods) {
        if (fs.existsSync(filePath(gameDir, mod, true))) {
            mods.push({ ...mod, enabled: true });
        } else if (fs.existsSync(filePath(gameDir, mod, false))) {
            mods.push({ ...mod, enabled: false });
        }
    }
    return { target: list.target, mods };
}

// Remembers which installed launcher version a folder is played with, for folders whose
// profile doesn't say (the default .minecraft one).
export function setTargetVersion(gameDir, versionId) {
    const list = readModList(gameDir);
    save(gameDir, { ...list, target: versionId ? { versionId } : null });
}

// File names in mods/ that belong to tracked mods, enabled or not.
export function managedFileNames(gameDir) {
    return new Set(readModList(gameDir).mods.flatMap(mod => [mod.fileName, mod.fileName + DISABLED_SUFFIX]));
}

// Jars in mods/ that TMods didn't install.
export function listUnmanaged(gameDir) {
    const dir = modsDir(gameDir);
    if (!fs.existsSync(dir)) {
        return [];
    }
    const managed = managedFileNames(gameDir);
    return fs
        .readdirSync(dir)
        .filter(name => /\.jar(\.disabled)?$/.test(name) && !managed.has(name))
        .sort();
}

function checkFileName(name) {
    if (!name || name !== path.basename(name) || name.startsWith('.')) {
        throw new Error(`Refusing to save a file named "${name}".`);
    }
}

// Downloads a file from the first URL that works and checks it against its SHA1 (and
// SHA512 when given) before anything is written. Returns the file's contents.
export async function downloadVerified(urls, hashes) {
    let lastError;
    for (const url of urls) {
        try {
            const { data } = await axios.get(url, { responseType: 'arraybuffer' });
            const buffer = new Uint8Array(data);
            if (sha1(buffer) !== hashes.sha1 || (hashes.sha512 && sha512(buffer) !== hashes.sha512)) {
                throw new Error(`The file from ${url} doesn't match its checksum.`);
            }
            return buffer;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('The file has no download link.');
}

// Writes through a temporary file, so a crash never leaves a half-written jar behind.
export function writeFileSafely(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const partial = `${file}.part`;
    fs.writeFileSync(partial, data);
    fs.renameSync(partial, file);
}

function entryFor(version, title, extra = {}) {
    const file = primaryFile(version);
    checkFileName(file.filename);
    return {
        projectId: version.project_id,
        versionId: version.id,
        title,
        versionNumber: version.version_number,
        fileName: file.filename,
        sha1: file.hashes.sha1,
        sha512: file.hashes.sha512,
        url: file.url,
        size: file.size,
        dependencies: version.dependencies
            .filter(dep => dep.dependency_type === 'required' && dep.project_id)
            .map(dep => dep.project_id),
        ...extra,
    };
}

function targetLabel(target) {
    return `${target.loader} ${target.gameVersion}`;
}

async function projectTitle(projectId) {
    try {
        const [project] = await getProjects([projectId]);
        return project?.title || projectId;
    } catch {
        return projectId;
    }
}

// Works out everything installing `rootVersion` needs: the version itself plus every
// required dependency not installed yet, picked for the same loader and game version.
// Refuses mods that say they don't work with an installed one; `allowIncompatible` lets
// the root mod through (the player was warned and chose to install it anyway).
async function planInstall(rootVersion, target, installedIds, allowIncompatible) {
    const plan = new Map([[rootVersion.project_id, rootVersion]]);
    const queue = [rootVersion];
    while (queue.length > 0) {
        const version = queue.shift();
        for (const dep of version.dependencies) {
            if (dep.dependency_type !== 'required') {
                continue;
            }
            let depVersion = null;
            if (dep.project_id && (installedIds.has(dep.project_id) || plan.has(dep.project_id))) {
                continue;
            }
            if (dep.version_id) {
                depVersion = await getVersion(dep.version_id);
            } else if (dep.project_id) {
                depVersion = pickVersion(await getProjectVersions(dep.project_id, target));
            }
            if (!depVersion) {
                const name = dep.project_id ? await projectTitle(dep.project_id) : dep.file_name || 'a mod';
                throw new Error(`It needs ${name}, which has no version for ${targetLabel(target)}.`);
            }
            if (installedIds.has(depVersion.project_id) || plan.has(depVersion.project_id)) {
                continue;
            }
            plan.set(depVersion.project_id, depVersion);
            queue.push(depVersion);
        }
    }

    const all = new Set([...installedIds, ...plan.keys()]);
    for (const version of plan.values()) {
        if (allowIncompatible && version === rootVersion) {
            continue;
        }
        const clash = version.dependencies.find(
            dep => dep.dependency_type === 'incompatible' && all.has(dep.project_id),
        );
        if (clash) {
            throw new Error(`It doesn't work together with ${await projectTitle(clash.project_id)}.`);
        }
    }
    return [...plan.values()];
}

// Installs the newest version of a project that fits `target` ({ loader, gameVersion }),
// with its required dependencies. Returns the titles of everything installed.
// `asDependency` marks the mod itself as pulled in for another one, so removing that one
// removes it too; `allowIncompatible` installs it even if it clashes with an installed mod.
export async function installMod(
    gameDir,
    target,
    projectId,
    title,
    { asDependency = false, allowIncompatible = false } = {},
) {
    const list = readModList(gameDir);
    const installedIds = new Set(list.mods.map(mod => mod.projectId));
    if (installedIds.has(projectId)) {
        throw new Error(`${title || 'This mod'} is already installed.`);
    }
    const version = pickVersion(await getProjectVersions(projectId, target));
    if (!version) {
        throw new Error(`${title || 'This mod'} has no version for ${targetLabel(target)}.`);
    }

    const plan = await planInstall(version, target, installedIds, allowIncompatible);
    const titles = new Map((await getProjects(plan.map(v => v.project_id))).map(p => [p.id, p.title]));
    if (title) {
        titles.set(projectId, title);
    }

    const entries = plan.map(planned => ({
        ...entryFor(planned, titles.get(planned.project_id) || planned.name, {
            asDependency: asDependency || planned.project_id !== projectId,
        }),
        enabled: true,
    }));
    // Download everything before writing anything, so a failed download leaves no strays.
    const downloads = [];
    for (const entry of entries) {
        downloads.push(await downloadVerified([entry.url], entry));
    }
    entries.forEach((entry, i) => writeFileSafely(filePath(gameDir, entry), downloads[i]));
    save(gameDir, { ...list, mods: [...list.mods, ...entries] });
    return entries.map(entry => entry.title);
}

// Finds newer versions of the tracked mods for `target`. Returns [{ mod, version }].
export async function checkUpdates(gameDir, target) {
    const { mods } = readModList(gameDir);
    const latest = await latestVersionsFromHashes(
        mods.map(mod => mod.sha1),
        target,
    );
    return mods
        .filter(mod => latest[mod.sha1] && latest[mod.sha1].id !== mod.versionId)
        .map(mod => ({ mod, version: latest[mod.sha1] }));
}

// What updating `mod` to `latest` brings, as changelog entries newest first: every
// version of the project for `target` published after the installed one, up to
// `latest`. When the installed version isn't in that list (it was for another game
// version, say), only `latest` is shown. Changelogs are the authors' Markdown.
export async function updateChangelog(mod, latest, target) {
    const versions = await getProjectVersions(mod.projectId, target);
    const from = versions.findIndex(version => version.id === latest.id);
    const to = versions.findIndex(version => version.id === mod.versionId);
    const changes = from !== -1 && to > from ? versions.slice(from, to) : [latest];
    return changes.map(version => ({
        id: version.id,
        label: version.version_number || version.name || version.id,
        text: typeof version.changelog === 'string' ? version.changelog.trim() : '',
        date: version.date_published,
    }));
}

// Replaces a tracked mod's jar with `version`, keeping it enabled or disabled as it was.
export async function updateMod(gameDir, projectId, version) {
    const list = readModList(gameDir);
    const index = list.mods.findIndex(mod => mod.projectId === projectId);
    if (index === -1) {
        throw new Error('That mod is no longer installed.');
    }
    const old = list.mods[index];
    const entry = { ...entryFor(version, old.title, { asDependency: old.asDependency }), enabled: old.enabled };
    const data = await downloadVerified([entry.url], entry);
    fs.rmSync(filePath(gameDir, old), { force: true });
    writeFileSafely(filePath(gameDir, entry), data);
    list.mods[index] = entry;
    save(gameDir, list);
}

// Removes a tracked mod, plus any mods it pulled in as dependencies that nothing else
// needs anymore. Returns the titles removed.
export function removeMod(gameDir, projectId) {
    const list = readModList(gameDir);
    let remaining = list.mods.filter(mod => mod.projectId !== projectId);
    let removed = list.mods.filter(mod => mod.projectId === projectId);
    for (;;) {
        const needed = new Set(remaining.flatMap(mod => mod.dependencies || []));
        const orphans = remaining.filter(mod => mod.asDependency && !needed.has(mod.projectId));
        if (orphans.length === 0) {
            break;
        }
        remaining = remaining.filter(mod => !orphans.includes(mod));
        removed = [...removed, ...orphans];
    }
    for (const mod of removed) {
        fs.rmSync(filePath(gameDir, mod), { force: true });
    }
    save(gameDir, { ...list, mods: remaining });
    return removed.map(mod => mod.title);
}

export function setModEnabled(gameDir, projectId, enabled) {
    const list = readModList(gameDir);
    const mod = list.mods.find(m => m.projectId === projectId);
    if (!mod || mod.enabled === enabled) {
        return;
    }
    fs.renameSync(filePath(gameDir, mod), filePath(gameDir, mod, enabled));
}

// Looks up hand-added jars on Modrinth by their checksum and starts tracking the ones it
// recognises. Returns how many were recognised.
export async function adoptUnmanaged(gameDir) {
    const files = listUnmanaged(gameDir).map(name => {
        const data = fs.readFileSync(path.join(modsDir(gameDir), name));
        return { name, sha1: sha1(data), sha512: sha512(data), size: data.length };
    });
    const versions = await versionsFromHashes(files.map(file => file.sha1));
    const list = readModList(gameDir);
    const tracked = new Set(list.mods.map(mod => mod.projectId));
    const found = files.filter(file => versions[file.sha1] && !tracked.has(versions[file.sha1].project_id));
    if (found.length === 0) {
        return 0;
    }
    const titles = new Map(
        (await getProjects(found.map(file => versions[file.sha1].project_id))).map(p => [p.id, p.title]),
    );

    for (const file of found) {
        const version = versions[file.sha1];
        const remoteFile = version.files.find(f => f.hashes.sha1 === file.sha1) || primaryFile(version);
        const enabled = !file.name.endsWith(DISABLED_SUFFIX);
        list.mods.push({
            ...entryFor(
                { ...version, files: [{ ...remoteFile, primary: true }] },
                titles.get(version.project_id) || version.name,
            ),
            // Keep the name it has on disk, which may differ from Modrinth's.
            fileName: enabled ? file.name : file.name.slice(0, -DISABLED_SUFFIX.length),
            sha1: file.sha1,
            sha512: file.sha512,
            size: file.size,
            asDependency: false,
            enabled,
        });
        tracked.add(version.project_id);
    }
    save(gameDir, list);
    return found.length;
}
