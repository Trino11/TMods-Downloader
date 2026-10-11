// Single mods, resource packs and shaders from Modrinth, installed into a game folder's
// mods/, resourcepacks/ and shaderpacks/ and tracked in <gameDir>/.tmods_loader/modrinth.json.
// That list is what lets TMods update and remove what it installed, keep mods when a
// bundle replaces the mods folder, and export the folder as a modpack. Files the player
// added by hand are left alone.
import axios from 'axios';
import {
    KINDS,
    SHADER_LOADERS,
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

export function kindOf(entry) {
    return KINDS[entry.kind] ? entry.kind : 'mod';
}

function listFile(gameDir) {
    return path.join(gameDir, '.tmods_loader', 'modrinth.json');
}

export function modsDir(gameDir) {
    return kindDir(gameDir, 'mod');
}

export function kindDir(gameDir, kind) {
    return path.join(gameDir, KINDS[kind].folder);
}

export function sha1(data) {
    return crypto.createHash('sha1').update(data).digest('hex');
}

export function sha512(data) {
    return crypto.createHash('sha512').update(data).digest('hex');
}

// Disabled the way other launchers do it: the file renamed to .jar.disabled (or
// .zip.disabled), so the game no longer sees it.
function filePath(gameDir, mod, enabled = mod.enabled) {
    return path.join(kindDir(gameDir, kindOf(mod)), enabled ? mod.fileName : mod.fileName + DISABLED_SUFFIX);
}

function readRaw(gameDir) {
    try {
        const data = JSON.parse(fs.readFileSync(listFile(gameDir), 'utf-8'));
        const mods = Array.isArray(data.mods) ? data.mods : [];
        return { target: data.target || null, mods: mods.map(mod => ({ ...mod, kind: kindOf(mod) })) };
    } catch {
        return { target: null, mods: [] };
    }
}

function save(gameDir, list) {
    fs.mkdirSync(path.dirname(listFile(gameDir)), { recursive: true });
    const mods = list.mods.map(({ enabled, ...mod }) => mod);
    fs.writeFileSync(listFile(gameDir), JSON.stringify({ target: list.target, mods }, null, 2));
}

// The tracked mods, resource packs and shaders, each with `kind` and `enabled`. Ones
// whose file is gone (deleted by hand, or a backup was restored) are forgotten, so the
// list always matches the folder.
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

// File names in the kind's folder that belong to tracked entries, enabled or not.
export function managedFileNames(gameDir, kind = 'mod') {
    return new Set(
        readModList(gameDir)
            .mods.filter(mod => mod.kind === kind)
            .flatMap(mod => [mod.fileName, mod.fileName + DISABLED_SUFFIX]),
    );
}

// Files in the kind's folder (jars in mods/, zips in the pack folders) that TMods
// didn't install.
export function listUnmanaged(gameDir, kind = 'mod') {
    const dir = kindDir(gameDir, kind);
    if (!fs.existsSync(dir)) {
        return [];
    }
    const managed = managedFileNames(gameDir, kind);
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(entry => !entry.isDirectory() && KINDS[kind].files.test(entry.name) && !managed.has(entry.name))
        .map(entry => entry.name)
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
    return target.loader === 'minecraft' ? `Minecraft ${target.gameVersion}` : `${target.loader} ${target.gameVersion}`;
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

// Installs the newest version of a project that fits `target` ({ loader, gameVersion },
// the loader being Modrinth's: a mod loader for mods, "minecraft" for resource packs, a
// shader loader for shaders). Mods come with their required dependencies; packs and
// shaders (`kind`) are single files. Returns the titles of everything installed.
// `asDependency` marks the mod itself as pulled in for another one, so removing that one
// removes it too; `allowIncompatible` installs it even if it clashes with an installed mod.
export async function installMod(
    gameDir,
    target,
    projectId,
    title,
    { kind = 'mod', asDependency = false, allowIncompatible = false } = {},
) {
    const noun = KINDS[kind].noun;
    const list = readModList(gameDir);
    const installedIds = new Set(list.mods.map(mod => mod.projectId));
    if (installedIds.has(projectId)) {
        throw new Error(`${title || `This ${noun}`} is already installed.`);
    }
    const version = pickVersion(await getProjectVersions(projectId, target));
    if (!version) {
        throw new Error(`${title || `This ${noun}`} has no version for ${targetLabel(target)}.`);
    }

    const plan = kind === 'mod' ? await planInstall(version, target, installedIds, allowIncompatible) : [version];
    const extra = kind === 'mod' ? {} : { kind, loader: target.loader };
    const titles = new Map((await getProjects(plan.map(v => v.project_id))).map(p => [p.id, p.title]));
    if (title) {
        titles.set(projectId, title);
    }

    const entries = plan.map(planned => ({
        ...entryFor(planned, titles.get(planned.project_id) || planned.name, {
            ...extra,
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

// The { loader, gameVersion } an entry's versions are looked up for: the profile's mod
// loader for mods, and for packs and shaders the loader they were installed for on the
// profile's game version. Null when that isn't known.
export function targetFor(mod, target, gameVersion = target?.gameVersion) {
    const kind = kindOf(mod);
    const loader = kind === 'mod' ? target?.loader : mod.loader || KINDS[kind].loader;
    const version = kind === 'mod' ? target?.gameVersion : gameVersion;
    return loader && version ? { loader, gameVersion: version } : null;
}

// Finds newer versions of everything tracked. Mods are checked against `target` (the
// profile's mod loader, null when it has none, which skips them); resource packs and
// shaders against `gameVersion` and the loader they were installed for. Returns
// [{ mod, version }].
export async function checkUpdates(gameDir, target, gameVersion = target?.gameVersion) {
    const groups = new Map();
    for (const mod of readModList(gameDir).mods) {
        const modTarget = targetFor(mod, target, gameVersion);
        if (!modTarget) {
            continue;
        }
        const key = `${modTarget.loader} ${modTarget.gameVersion}`;
        if (!groups.has(key)) {
            groups.set(key, { ...modTarget, mods: [] });
        }
        groups.get(key).mods.push(mod);
    }
    const found = [];
    // One request per loader and game version: usually one for mods and one per pack kind.
    for (const group of groups.values()) {
        const latest = await latestVersionsFromHashes(
            group.mods.map(mod => mod.sha1),
            group,
        );
        for (const mod of group.mods) {
            if (latest[mod.sha1] && latest[mod.sha1].id !== mod.versionId) {
                found.push({ mod, version: latest[mod.sha1] });
            }
        }
    }
    return found;
}

// What updating `mod` to `latest` brings, as changelog entries newest first: every
// version of the project for `target` published after the installed one, up to
// `latest`. When the installed version isn't in that list (it was for another game
// version, say), only `latest` is shown. Changelogs are the authors' Markdown.
export async function updateChangelog(mod, latest, target, gameVersion = target?.gameVersion) {
    const versions = await getProjectVersions(mod.projectId, targetFor(mod, target, gameVersion) || {});
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
        throw new Error("That isn't installed anymore.");
    }
    const old = list.mods[index];
    const extra = old.kind === 'mod' ? {} : { kind: old.kind, loader: old.loader };
    const entry = {
        ...entryFor(version, old.title, { ...extra, asDependency: old.asDependency }),
        enabled: old.enabled,
    };
    const data = await downloadVerified([entry.url], entry);
    fs.rmSync(filePath(gameDir, old), { force: true });
    writeFileSafely(filePath(gameDir, entry), data);
    list.mods[index] = entry;
    save(gameDir, list);
}

// Removes a tracked mod, resource pack or shader, plus any mods it pulled in as
// dependencies that nothing else needs anymore. Returns the titles removed.
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

// A file found in a pack folder is only adopted as that kind when Modrinth files its
// version under a matching loader (a resource pack's under "minecraft", a shader's under
// a shader loader), so a stray mod jar or modpack zip isn't taken for a pack.
function projectTypeMatches(version, kind) {
    if (kind === 'mod' || !Array.isArray(version.loaders)) {
        return true;
    }
    const allowed = kind === 'resourcepack' ? ['minecraft'] : Object.keys(SHADER_LOADERS);
    return version.loaders.some(loader => allowed.includes(loader));
}

function packLoader(version, kind) {
    if (kind === 'resourcepack') {
        return 'minecraft';
    }
    return (version.loaders || []).find(loader => SHADER_LOADERS[loader]) || 'iris';
}

// Looks up hand-added files of a kind on Modrinth by their checksum and starts tracking
// the ones it recognises. Returns how many were recognised.
export async function adoptUnmanaged(gameDir, kind = 'mod') {
    const files = listUnmanaged(gameDir, kind).map(name => {
        const data = fs.readFileSync(path.join(kindDir(gameDir, kind), name));
        return { name, sha1: sha1(data), sha512: sha512(data), size: data.length };
    });
    const versions = await versionsFromHashes(files.map(file => file.sha1));
    const list = readModList(gameDir);
    const tracked = new Set(list.mods.map(mod => mod.projectId));
    const found = files.filter(
        file =>
            versions[file.sha1] &&
            !tracked.has(versions[file.sha1].project_id) &&
            projectTypeMatches(versions[file.sha1], kind),
    );
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
        const extra = kind === 'mod' ? {} : { kind, loader: packLoader(version, kind) };
        list.mods.push({
            ...entryFor(
                { ...version, files: [{ ...remoteFile, primary: true }] },
                titles.get(version.project_id) || version.name,
                extra,
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
