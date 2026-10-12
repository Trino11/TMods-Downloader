// Modrinth modpacks (.mrpack, https://support.modrinth.com/en/articles/8802351). A pack
// is a zip with modrinth.index.json, which lists files by download URL and checksum,
// plus overrides/ folders (configs and anything else) copied over the game folder.
// The Packs page exports the files picked in a profile as one, previews a pack, and
// installs the items picked from it into a new profile or an existing one.
import axios from 'axios';
import {
    createProfile,
    deleteProfile,
    DEFAULT_PROFILE_ID,
    listGameVersions,
    listProfiles,
    profileGameDir,
} from './profiles';
import { detectTarget, gameVersionOf } from './gameTarget';
import { KINDS, LOADERS, getProjectVersions, pickVersion, primaryFile, versionsFromHashes } from './modrinth';
import {
    adoptUnmanaged,
    downloadVerified,
    dropTracked,
    readModList,
    sha1,
    trackedPath,
    writeFileSafely,
} from './modrinthMods';
import { PACK_KINDS, groupItems, isEnabled } from './packKinds';
import { bytesToText, crypto, fs, path, zip as zips } from './node';
import { t } from '../i18n';

// Pass as `into` to install a pack into a profile of its own.
export const NEW_PROFILE = 'new';

const INDEX_FILE = 'modrinth.index.json';
// client-overrides come last so they win over overrides, as the format says.
const OVERRIDE_FOLDERS = ['overrides/', 'client-overrides/'];
// TMods' own state in a game folder, which a pack may not write to.
const STATE_FOLDER = '.tmods_loader';
const TRACKING_FILE = `${STATE_FOLDER}/modrinth.json`;
// Which version of the channel's pack (its manifest id) was last imported into the folder.
const PACK_FILE = `${STATE_FOLDER}/pack.json`;
const BACKUPS_KEPT = 5;

// The hosts Modrinth itself accepts in pack download links. Files elsewhere are refused,
// so a pack from a stranger can't make TMods fetch from anywhere it likes.
const ALLOWED_HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com'];

// How a pack names each loader in its dependencies.
const LOADER_KEYS = {
    fabric: 'fabric-loader',
    quilt: 'quilt-loader',
    forge: 'forge',
    neoforge: 'neoforge',
};

// The launcher version id each loader's installer creates.
const LOADER_VERSION_IDS = {
    fabric: (loaderVersion, gameVersion) => `fabric-loader-${loaderVersion}-${gameVersion}`,
    quilt: (loaderVersion, gameVersion) => `quilt-loader-${loaderVersion}-${gameVersion}`,
    forge: (loaderVersion, gameVersion) => `${gameVersion}-forge-${loaderVersion}`,
    neoforge: loaderVersion => `neoforge-${loaderVersion}`,
};

const DOWNLOADS_AT_ONCE = 4;

// Resolves a path from the pack inside `gameDir`, refusing anything that would land
// outside it (.. segments, absolute paths, drive letters).
function safeTarget(gameDir, relative) {
    const normalized = String(relative).replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (
        !normalized ||
        normalized.startsWith('/') ||
        /^[a-zA-Z]:/.test(normalized) ||
        parts.some(part => part === '..' || part === '')
    ) {
        throw new Error(t('services.mrpack.unsafePath', { path: relative }));
    }
    const target = path.join(gameDir, ...parts);
    if (!target.startsWith(path.join(gameDir) + path.sep)) {
        throw new Error(t('services.mrpack.unsafePath', { path: relative }));
    }
    return target;
}

// A pack's path with forward slashes, once it is known to be safe and not TMods' own.
function packPath(relative) {
    safeTarget(path.join(path.sep, 'probe'), relative);
    const normalized = String(relative).replace(/\\/g, '/');
    if (normalized.split('/')[0].toLowerCase() === STATE_FOLDER) {
        throw new Error(t('services.mrpack.stateFolderPath', { path: relative }));
    }
    return normalized;
}

function allowedUrls(file) {
    return (file.downloads || []).filter(url => {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' && ALLOWED_HOSTS.includes(parsed.hostname);
        } catch {
            return false;
        }
    });
}

// `entries` are the pack's zip entries, as { name, isDirectory, data }.
export function readIndex(entries) {
    const entry = entries.find(e => e.name === INDEX_FILE);
    if (!entry) {
        throw new Error(t('services.mrpack.noIndex'));
    }
    let index;
    try {
        index = JSON.parse(bytesToText(entry.data));
    } catch {
        throw new Error(t('services.mrpack.badIndexJson'));
    }
    if (index.formatVersion !== 1 || index.game !== 'minecraft') {
        throw new Error(t('services.mrpack.unknownFormat'));
    }
    if (!index.dependencies?.minecraft) {
        throw new Error(t('services.mrpack.noGameVersion'));
    }
    return index;
}

function packLoader(index) {
    for (const [loader, key] of Object.entries(LOADER_KEYS)) {
        if (index.dependencies[key]) {
            return { loader, loaderVersion: index.dependencies[key] };
        }
    }
    return null;
}

// Reads and checks a pack (its bytes) without writing anything. Returns { name, version,
// summary, gameVersion, loader, items }: `loader` is null or { loader, loaderVersion },
// and `items` are grouped like the Packs page lists them ({ id, kind, name, size, files,
// link, enabled }), each file { path, size } plus either `download` ({ urls, hashes }) or
// `data`. Files only servers need are left out.
export function readPack(data) {
    let entries;
    try {
        entries = zips.read(data);
    } catch {
        throw new Error(t('services.mrpack.notZip'));
    }
    const index = readIndex(entries);
    const files = new Map();
    for (const file of (index.files || []).filter(entry => entry.env?.client !== 'unsupported')) {
        const relative = packPath(file.path);
        if (!file.hashes?.sha1) {
            throw new Error(t('services.mrpack.noChecksum', { path: file.path }));
        }
        const urls = allowedUrls(file);
        if (urls.length === 0) {
            throw new Error(t('services.mrpack.untrustedHost', { path: file.path }));
        }
        files.set(relative, { path: relative, size: file.fileSize || 0, download: { urls, hashes: file.hashes } });
    }
    for (const prefix of OVERRIDE_FOLDERS) {
        for (const entry of entries) {
            if (!entry.isDirectory && entry.name.startsWith(prefix)) {
                const relative = packPath(entry.name.slice(prefix.length));
                files.set(relative, { path: relative, size: entry.data.length, data: entry.data });
            }
        }
    }
    return {
        name: typeof index.name === 'string' && index.name.trim() ? index.name.trim() : 'Modpack',
        version: typeof index.versionId === 'string' ? index.versionId : '',
        summary: typeof index.summary === 'string' ? index.summary.trim() : '',
        gameVersion: index.dependencies.minecraft,
        loader: packLoader(index),
        items: groupItems([...files.values()]).map(item => ({
            ...item,
            link: item.files.every(file => file.download),
            enabled: isEnabled(item.id),
        })),
    };
}

// The installed launcher version to play the pack with: the exact loader version it
// asks for, else the same loader on the same game version. Without either, the profile
// gets the plain game version and the player has to install the loader.
function chooseGameVersion(gameVersion, loader) {
    if (!loader) {
        return { versionId: gameVersion, exact: true };
    }
    const installed = listGameVersions();
    const exactId = LOADER_VERSION_IDS[loader.loader](loader.loaderVersion, gameVersion);
    if (installed.includes(exactId)) {
        return { versionId: exactId, exact: true };
    }
    const similar = installed.find(id => {
        const target = detectTarget(id);
        return target && target.loader === loader.loader && target.gameVersion === gameVersion;
    });
    return { versionId: similar || gameVersion, exact: false, installedLoader: Boolean(similar) };
}

async function inBatches(items, size, work) {
    for (let i = 0; i < items.length; i += size) {
        await Promise.all(items.slice(i, i + size).map(work));
    }
}

// Writes `files` (from readPack) under `dir`, downloading the ones that are links.
async function writeFiles(dir, files) {
    await inBatches(files, DOWNLOADS_AT_ONCE, async file => {
        const contents = file.data || (await downloadVerified(file.download.urls, file.download.hashes));
        writeFileSafely(safeTarget(dir, file.path), contents);
    });
}

// Tracks the mods, resource packs and shaders a pack brought, so they can be updated and
// exported. Not being able to look them up right now doesn't undo the install; they
// show as added by hand.
async function trackModrinthFiles(gameDir) {
    for (const kind of Object.keys(KINDS)) {
        try {
            await adoptUnmanaged(gameDir, kind);
        } catch (error) {
            console.error(`Could not look up the modpack's ${KINDS[kind].label.toLowerCase()} on Modrinth:`, error);
        }
    }
}

// The launcher version a profile plays, its mod loader target ({ loader, loaderVersion,
// gameVersion }, null without one) and its Minecraft version ('' when unknown). The
// default profile can be played with any version, so it uses the one picked on the
// Modrinth page.
export function profileTarget(profile) {
    const versionId =
        profile.id === DEFAULT_PROFILE_ID
            ? readModList(profileGameDir(profile)).target?.versionId || ''
            : profile.gameVersion || '';
    const target = versionId ? detectTarget(versionId) : null;
    return { versionId, target, gameVersion: target?.gameVersion || (versionId && gameVersionOf(versionId)) || '' };
}

// Why `pack` may not work in `profile`, as sentences; empty when it fits.
export function packWarnings(pack, profile) {
    const { target, gameVersion } = profileTarget(profile);
    const warnings = [];
    if (gameVersion && gameVersion !== pack.gameVersion) {
        warnings.push(
            t('services.mrpack.warnings.gameVersion', {
                packVersion: pack.gameVersion,
                profile: profile.name,
                gameVersion,
            }),
        );
    }
    if (pack.loader && target?.loader !== pack.loader.loader) {
        const vars = { loader: LOADERS[pack.loader.loader], profile: profile.name };
        warnings.push(
            target
                ? t('services.mrpack.warnings.otherLoader', { ...vars, profileLoader: LOADERS[target.loader] })
                : t('services.mrpack.warnings.noLoader', vars),
        );
    }
    return warnings;
}

function backupsDir(gameDir) {
    return path.join(gameDir, STATE_FOLDER, 'pack-backups');
}

function inGame(gameDir, relative) {
    return path.join(gameDir, ...relative.split('/'));
}

// The backups imports into this folder made, newest first, as { id, createdAt, pack }.
export function listPackBackups(gameDir) {
    const dir = backupsDir(gameDir);
    if (!fs.existsSync(dir)) {
        return [];
    }
    return fs
        .readdirSync(dir)
        .map(id => {
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(dir, id, 'backup.json'), 'utf-8'));
                return { id, createdAt: meta.createdAt, pack: meta.pack || '' };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => (a.id < b.id ? 1 : -1));
}

// The id of the channel pack version last imported into a game folder, or null when
// none was (packs imported from a file or from Modrinth aren't the channel's).
export function readInstalledPack(gameDir) {
    try {
        const { id } = JSON.parse(fs.readFileSync(inGame(gameDir, PACK_FILE), 'utf-8'));
        return typeof id === 'string' && id ? id : null;
    } catch {
        return null;
    }
}

function writeInstalledPack(gameDir, id) {
    fs.mkdirSync(path.join(gameDir, STATE_FOLDER), { recursive: true });
    fs.writeFileSync(inGame(gameDir, PACK_FILE), JSON.stringify({ id, importedAt: new Date().toISOString() }, null, 2));
}

// Copies everything an import of `files` may change: the files and folders at the top
// of the game folder it writes into, TMods' list of Modrinth files and the record of
// the channel pack installed. Keeps the last few backups. Returns the new backup's id.
function backUp(gameDir, files, packName) {
    const entries = [...new Set(files.map(file => file.path.split('/')[0])), TRACKING_FILE, PACK_FILE];
    const base = new Date().toISOString().replace(/[:.]/g, '-');
    let id = base;
    for (let n = 1; fs.existsSync(path.join(backupsDir(gameDir), id)); n++) {
        id = `${base}_${n}`;
    }
    const dir = path.join(backupsDir(gameDir), id);
    const existed = entries.filter(entry => fs.existsSync(inGame(gameDir, entry)));
    for (const entry of existed) {
        const copy = inGame(path.join(dir, 'files'), entry);
        fs.mkdirSync(path.dirname(copy), { recursive: true });
        fs.cpSync(inGame(gameDir, entry), copy);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'backup.json'),
        JSON.stringify({ createdAt: new Date().toISOString(), pack: packName, entries, existed }, null, 2),
    );
    for (const old of listPackBackups(gameDir).slice(BACKUPS_KEPT)) {
        fs.rmSync(path.join(backupsDir(gameDir), old.id), { recursive: true, force: true });
    }
    return id;
}

// Puts the folder back the way it was before the import that made backup `id`: what the
// import touched is replaced by the backup's copy, or removed if it didn't exist then.
// The backup is used up.
export function restorePackBackup(gameDir, id) {
    const dir = path.join(backupsDir(gameDir), id);
    let meta;
    try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, 'backup.json'), 'utf-8'));
    } catch {
        throw new Error(t('services.mrpack.backupGone'));
    }
    for (const entry of meta.entries) {
        fs.rmSync(inGame(gameDir, entry), { recursive: true, force: true });
        if (meta.existed.includes(entry)) {
            fs.mkdirSync(path.dirname(inGame(gameDir, entry)), { recursive: true });
            fs.cpSync(inGame(path.join(dir, 'files'), entry), inGame(gameDir, entry));
        }
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// Before an import into an existing profile: removes and forgets the mods, resource
// packs and shaders the profile has that the pack brings too, in whatever version, so
// the game never loads two copies of one mod. Modrinth says which project each file
// belongs to; when it can't be reached, only entries at the same path are replaced.
// `staged` is where the pack's files were downloaded. Returns the titles of the other
// versions removed.
async function dropOtherVersions(gameDir, files, staged) {
    const folders = new Set(PACK_KINDS.filter(kind => kind.modrinth).flatMap(kind => kind.folders));
    const incoming = files.filter(file => {
        const parts = file.path.split('/');
        return parts.length === 2 && folders.has(parts[0]);
    });
    if (incoming.length === 0) {
        return [];
    }
    let projects = new Set();
    try {
        // Hand-added files are looked up first, so their projects are known too.
        for (const kind of Object.keys(KINDS)) {
            await adoptUnmanaged(gameDir, kind);
        }
        const hashes = incoming.map(
            file => file.download?.hashes.sha1 || sha1(fs.readFileSync(safeTarget(staged, file.path))),
        );
        projects = new Set(Object.values(await versionsFromHashes(hashes)).map(version => version.project_id));
    } catch (error) {
        console.error("Could not look the pack's files up on Modrinth:", error);
    }
    const paths = new Set(incoming.map(file => file.path));
    return dropTracked(gameDir, mod => projects.has(mod.projectId) || paths.has(trackedPath(mod)))
        .filter(mod => !paths.has(trackedPath(mod)))
        .map(mod => mod.title);
}

async function importIntoNewProfile(pack, files, name) {
    const chosen = chooseGameVersion(pack.gameVersion, pack.loader);
    const profile = createProfile({ name: name || pack.name, gameVersion: chosen.versionId });
    const gameDir = profileGameDir(profile);
    try {
        await writeFiles(gameDir, files);
    } catch (error) {
        // The profile is brand new, so nothing of the player's is in its folder.
        deleteProfile(profile.id);
        fs.rmSync(gameDir, { recursive: true, force: true });
        throw error;
    }
    await trackModrinthFiles(gameDir);

    let loaderNote = '';
    if (pack.loader && !chosen.exact) {
        const wanted = t('services.mrpack.loaderWanted', {
            loader: LOADERS[pack.loader.loader],
            loaderVersion: pack.loader.loaderVersion,
            gameVersion: pack.gameVersion,
        });
        loaderNote = chosen.installedLoader
            ? t('services.mrpack.loaderNote.usedInstalled', { wanted, loader: LOADERS[pack.loader.loader] })
            : t('services.mrpack.loaderNote.install', { wanted });
    }
    return {
        profile,
        loaderNote,
        needsLoader: Boolean(pack.loader && !chosen.exact && !chosen.installedLoader),
        loader: pack.loader,
        gameVersion: pack.gameVersion,
        replaced: [],
        backupId: null,
    };
}

async function importIntoProfile(pack, files, profile) {
    const gameDir = profileGameDir(profile);
    const staged = path.join(gameDir, STATE_FOLDER, 'pack-import');
    fs.rmSync(staged, { recursive: true, force: true });
    let backupId;
    let replaced;
    try {
        // Everything is downloaded before the profile changes, so a failed download
        // leaves it as it was.
        await writeFiles(staged, files);
        backupId = backUp(gameDir, files, pack.name);
        replaced = await dropOtherVersions(gameDir, files, staged);
        if (files.length > 0) {
            fs.cpSync(staged, gameDir);
        }
    } finally {
        fs.rmSync(staged, { recursive: true, force: true });
    }
    await trackModrinthFiles(gameDir);
    return {
        profile,
        loaderNote: '',
        needsLoader: false,
        loader: pack.loader,
        gameVersion: pack.gameVersion,
        replaced,
        backupId,
    };
}

// Installs a pack (its bytes). `into` is a profile id, or NEW_PROFILE for a new profile
// called `name` (the pack's own name by default). `items` are the ids of the items to
// install (readPack); all of them when left out. `channelVersion` is the manifest id
// when the pack is a version of the channel's pack, so the profile remembers it and
// can tell when a newer one is out. Into an existing profile, what the pack
// touches is backed up first (restorePackBackup undoes it) and other versions of the
// pack's mods are removed. Returns { profile, loaderNote, needsLoader, loader,
// gameVersion, replaced, backupId }: `loaderNote` says what the player still has to
// install, if anything, and `needsLoader` whether the pack's loader is missing.
export async function importMrpack(data, { into = NEW_PROFILE, name, items, channelVersion } = {}) {
    const pack = readPack(data);
    const wanted = items && new Set(items);
    const files = pack.items.filter(item => !wanted || wanted.has(item.id)).flatMap(item => item.files);
    let result;
    if (into === NEW_PROFILE) {
        result = await importIntoNewProfile(pack, files, name);
    } else {
        const profile = listProfiles().find(item => item.id === into);
        if (!profile) {
            throw new Error(t('services.mrpack.profileGone'));
        }
        result = await importIntoProfile(pack, files, profile);
    }
    if (channelVersion) {
        writeInstalledPack(profileGameDir(result.profile), channelVersion);
    }
    return result;
}

// Downloads the newest version of a modpack from Modrinth. Returns its bytes.
export async function downloadModrinthModpack(projectId, title) {
    const version = pickVersion(await getProjectVersions(projectId));
    if (!version) {
        throw new Error(t('services.mrpack.noVersionToDownload', { title }));
    }
    const file = primaryFile(version);
    return downloadVerified([file.url], file.hashes);
}

// Downloads a pack published in the player's channel (the manifest's packs category),
// checking it against the manifest's checksum. Returns its bytes.
export async function downloadPublishedPack(version) {
    const { data } = await axios.get(version.url, { responseType: 'arraybuffer' });
    const bytes = new Uint8Array(data);
    if (version.sha256 && crypto.createHash('sha256').update(bytes).digest('hex') !== version.sha256.toLowerCase()) {
        throw new Error(t('services.mrpack.corruptDownload', { id: version.id }));
    }
    return bytes;
}

// Packs the picked `items` of a game folder (packScan.js) into a .mrpack: items with a
// Modrinth link as downloads, everything else copied into overrides/. `target` is the
// profile's { gameVersion, loader, loaderVersion }; the loader is only needed for mods.
// Returns { data, links, copies } (how many items went in each way).
export function exportMrpack(gameDir, target, { name, version = '1.0.0', items }) {
    if (!target?.gameVersion) {
        throw new Error(t('services.mrpack.unknownGameVersion'));
    }
    if (items.some(item => item.kind === 'mod') && !target.loaderVersion) {
        throw new Error(t('services.mrpack.pickLoaderVersion'));
    }
    const links = items.filter(item => item.link);
    const copies = items.filter(item => !item.link);
    const dependencies = { minecraft: target.gameVersion };
    if (target.loaderVersion && LOADER_KEYS[target.loader]) {
        dependencies[LOADER_KEYS[target.loader]] = target.loaderVersion;
    }
    const index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: version,
        name: name || 'TMods modpack',
        files: links.map(item => ({
            path: item.id,
            hashes: item.link.hashes,
            downloads: [item.link.url],
            fileSize: item.link.size,
        })),
        dependencies,
    };

    const entries = [{ name: INDEX_FILE, data: JSON.stringify(index, null, 2) }];
    for (const item of copies) {
        for (const file of item.files) {
            const parts = file.path.split('/');
            entries.push({ file: inGame(gameDir, file.path), into: ['overrides', ...parts.slice(0, -1)].join('/') });
        }
    }
    return { data: zips.create(entries), links: links.length, copies: copies.length };
}
