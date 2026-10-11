// Modrinth modpacks (.mrpack, https://support.modrinth.com/en/articles/8802351). A pack
// is a zip with modrinth.index.json, which lists each mod by download URL and checksum,
// plus overrides/ folders (configs and anything else) copied over the game folder.
// Importing one makes a new profile; exporting turns a profile into a file to share.
import { createProfile, deleteProfile, listGameVersions, profileGameDir } from './profiles';
import { detectTarget } from './gameTarget';
import { KINDS, getProjectVersions, pickVersion, primaryFile } from './modrinth';
import { adoptUnmanaged, downloadVerified, listUnmanaged, modsDir, readModList, writeFileSafely } from './modrinthMods';
import { AdmZip, Buffer, fs, path } from './node';

const INDEX_FILE = 'modrinth.index.json';

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
        throw new Error(`The pack contains an unsafe file path: ${relative}`);
    }
    const target = path.join(gameDir, ...parts);
    if (!target.startsWith(path.join(gameDir) + path.sep)) {
        throw new Error(`The pack contains an unsafe file path: ${relative}`);
    }
    return target;
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

export function readIndex(zip) {
    const entry = zip.getEntry(INDEX_FILE);
    if (!entry) {
        throw new Error('This is not a Modrinth modpack (no modrinth.index.json inside).');
    }
    let index;
    try {
        index = JSON.parse(entry.getData().toString('utf-8'));
    } catch {
        throw new Error("The modpack's modrinth.index.json is not valid JSON.");
    }
    if (index.formatVersion !== 1 || index.game !== 'minecraft') {
        throw new Error("This modpack is in a format TMods doesn't know.");
    }
    if (!index.dependencies?.minecraft) {
        throw new Error("The modpack doesn't say which Minecraft version it is for.");
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

// Installs a .mrpack (its bytes) as a new profile. Returns { profile, loaderNote },
// where loaderNote says what the player still has to install, if anything.
export async function importMrpack(data, { name } = {}) {
    let zip;
    try {
        zip = new AdmZip(Buffer.from(data));
    } catch {
        throw new Error("This file is not a modpack (it isn't a zip).");
    }
    const index = readIndex(zip);
    const gameVersion = index.dependencies.minecraft;
    const loader = packLoader(index);

    // Check every path and link before creating anything.
    const probe = path.join(path.sep, 'probe');
    const files = (index.files || []).filter(file => file.env?.client !== 'unsupported');
    for (const file of files) {
        safeTarget(probe, file.path);
        if (!file.hashes?.sha1) {
            throw new Error(`The pack lists ${file.path} without a checksum.`);
        }
        if (allowedUrls(file).length === 0) {
            throw new Error(`The pack downloads ${file.path} from a site TMods doesn't trust.`);
        }
    }
    const overrides = ['overrides/', 'client-overrides/'].flatMap(prefix =>
        zip
            .getEntries()
            .filter(entry => !entry.isDirectory && entry.entryName.startsWith(prefix))
            .map(entry => ({ entry, relative: entry.entryName.slice(prefix.length) })),
    );
    for (const { relative } of overrides) {
        safeTarget(probe, relative);
    }

    const chosen = chooseGameVersion(gameVersion, loader);
    const profile = createProfile({ name: name || index.name || 'Modpack', gameVersion: chosen.versionId });
    const gameDir = profileGameDir(profile);
    try {
        await inBatches(files, DOWNLOADS_AT_ONCE, async file => {
            const contents = await downloadVerified(allowedUrls(file), file.hashes);
            writeFileSafely(safeTarget(gameDir, file.path), contents);
        });
        // client-overrides come last so they win over overrides, as the format says.
        for (const { entry, relative } of overrides) {
            writeFileSafely(safeTarget(gameDir, relative), entry.getData());
        }
    } catch (error) {
        // The profile is brand new, so nothing of the player's is in its folder.
        deleteProfile(profile.id);
        fs.rmSync(gameDir, { recursive: true, force: true });
        throw error;
    }

    // Track the pack's mods, resource packs and shaders so they can be updated and
    // exported. Not being able to look them up right now doesn't undo the install; they
    // show as added by hand.
    for (const kind of Object.keys(KINDS)) {
        try {
            await adoptUnmanaged(gameDir, kind);
        } catch (error) {
            console.error(`Could not look up the modpack's ${KINDS[kind].label.toLowerCase()} on Modrinth:`, error);
        }
    }

    let loaderNote = '';
    if (loader && !chosen.exact) {
        const wanted = `${loader.loader} ${loader.loaderVersion} for Minecraft ${gameVersion}`;
        loaderNote = chosen.installedLoader
            ? `The pack asks for ${wanted}; TMods used the ${loader.loader} version you already have installed.`
            : `Install ${wanted}, then pick it for this profile in Profiles.`;
    }
    return { profile, loaderNote };
}

// Downloads the newest version of a modpack from Modrinth and imports it.
export async function installModrinthModpack(projectId, title) {
    const version = pickVersion(await getProjectVersions(projectId));
    if (!version) {
        throw new Error(`${title} has no version to download.`);
    }
    const file = primaryFile(version);
    const data = await downloadVerified([file.url], file.hashes);
    return importMrpack(data, { name: title });
}

function addFolder(zip, folder, zipPath) {
    if (fs.existsSync(folder)) {
        zip.addLocalFolder(folder, zipPath);
    }
}

// Packs a game folder into a .mrpack: enabled Modrinth mods, resource packs and shaders
// as download links, and
// hand-added jars and the config folder as overrides. `target` is the folder's
// detected loader. Returns { data, mods, extraFiles }.
export function exportMrpack(gameDir, target, { name, version = '1.0.0', includeConfig = true }) {
    if (!target?.loaderVersion) {
        throw new Error('Pick the loader version this profile plays with before exporting.');
    }
    const mods = readModList(gameDir).mods.filter(mod => mod.enabled && mod.url);
    const index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: version,
        name: name || 'TMods modpack',
        files: mods.map(mod => ({
            path: `${KINDS[mod.kind].folder}/${mod.fileName}`,
            hashes: { sha1: mod.sha1, sha512: mod.sha512 },
            downloads: [mod.url],
            fileSize: mod.size,
        })),
        dependencies: {
            minecraft: target.gameVersion,
            [LOADER_KEYS[target.loader]]: target.loaderVersion,
        },
    };

    const zip = new AdmZip();
    zip.addFile(INDEX_FILE, Buffer.from(JSON.stringify(index, null, 2)));
    const extraJars = listUnmanaged(gameDir).filter(file => file.endsWith('.jar'));
    for (const jar of extraJars) {
        zip.addLocalFile(path.join(modsDir(gameDir), jar), 'overrides/mods');
    }
    if (includeConfig) {
        addFolder(zip, path.join(gameDir, 'config'), 'overrides/config');
    }
    return { data: zip.toBuffer(), mods: mods.length, extraFiles: extraJars };
}
