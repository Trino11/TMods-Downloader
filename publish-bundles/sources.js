// Reads one version folder into what its zip will hold. A version can mix three kinds
// of input, all landing in the zip at their game-folder path:
//
//   files         any file in the folder, e.g. mods/my-own.jar or config/sodium.json
//   <name>.mrpack a Modrinth modpack: its listed downloads plus its overrides
//   bundle.json   "modrinth": { "<project>": "<version>" } and "files": [{ path, url, hash }]
//
// A version of the packs category is different: it is one .mrpack, published as it is
// so players can import the whole pack into a profile (readPack).
//
// Nothing is downloaded here. Each input gets a `key` that names exactly what it is
// (a file's hash, a download's hash, a pinned Modrinth version), so a version whose keys
// match the last publish can keep its zip without downloading or zipping anything.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readZip } = require('./unzip');

const METADATA_FILE = 'bundle.json';
const CHANGELOG_FILE = 'CHANGELOG.md';
const TEXT_KEYS = ['description', 'target', 'changelog'];
const METADATA_KEYS = [...TEXT_KEYS, 'modrinth', 'files'];
const HASHES = ['sha512', 'sha256', 'sha1'];
const IGNORED_FILES = new Set(['.gitkeep', '.DS_Store', 'Thumbs.db']);

// How a .mrpack names each loader in its dependencies, and how the app shows it.
const PACK_LOADERS = {
    'fabric-loader': 'Fabric',
    'quilt-loader': 'Quilt',
    forge: 'Forge',
    neoforge: 'NeoForge',
};

// Bump when the zip layout or the keys change, so every bundle is rebuilt once.
const FORMAT = 'tmods-bundle-2';
// The same for packs, which are published as the .mrpack itself.
const PACK_FORMAT = 'tmods-pack-1';

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function readJson(file, what) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (error) {
        throw new Error(`${what} (${file}) is not valid JSON: ${error.message}`, { cause: error });
    }
}

// A forward-slash path inside the game folder, or an error naming where it came from.
function safePath(relative, where) {
    const normalized = String(relative ?? '').replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (
        !normalized ||
        normalized.startsWith('/') ||
        /^[a-zA-Z]:/.test(normalized) ||
        parts.some(part => part === '..' || part === '.' || part === '')
    ) {
        throw new Error(`${where}: "${relative}" is not a path inside the game folder.`);
    }
    return normalized;
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// The strongest hash a download lists, as { algorithm, value }.
function strongestHash(hashes, where) {
    const algorithm = HASHES.find(name => typeof hashes?.[name] === 'string' && hashes[name]);
    if (!algorithm) {
        throw new Error(`${where} needs a checksum (${HASHES.join(', ')}).`);
    }
    return { algorithm, value: hashes[algorithm].toLowerCase() };
}

function httpsUrls(urls, where) {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(url => {
        try {
            return new URL(url).protocol === 'https:';
        } catch {
            return false;
        }
    });
    if (list.length === 0) {
        throw new Error(`${where} needs an https download link.`);
    }
    return list;
}

function localFile(name, data) {
    return { kind: 'file', path: name, data, key: `file ${name} sha256:${sha256(data)}` };
}

function download(name, urls, hashes, where) {
    const hash = strongestHash(hashes, where);
    return {
        kind: 'download',
        path: name,
        urls: httpsUrls(urls, where),
        hash,
        key: `download ${name} ${hash.algorithm}:${hash.value}`,
    };
}

// Every file under `dir` as { name, full }, `name` relative with forward slashes.
function listFiles(dir, prefix = '') {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const name = prefix + entry.name;
        if (entry.isDirectory()) {
            files.push(...listFiles(full, `${name}/`));
        } else if (entry.isFile() && !IGNORED_FILES.has(entry.name)) {
            files.push({ name, full });
        }
    }
    return files;
}

function readMetadata(versionDir, label) {
    const metadataFile = path.join(versionDir, METADATA_FILE);
    const metadata = fs.existsSync(metadataFile) ? readJson(metadataFile, `${label}/${METADATA_FILE}`) : {};
    if (!isObject(metadata)) {
        throw new Error(`${label}/${METADATA_FILE} must be a JSON object.`);
    }
    for (const [key, value] of Object.entries(metadata)) {
        if (!METADATA_KEYS.includes(key)) {
            throw new Error(
                `${label}/${METADATA_FILE} has an unknown key "${key}" (allowed: ${METADATA_KEYS.join(', ')}).`,
            );
        }
        if (TEXT_KEYS.includes(key) && typeof value !== 'string') {
            throw new Error(`${label}/${METADATA_FILE}: "${key}" must be a string.`);
        }
    }

    const changelogFile = path.join(versionDir, CHANGELOG_FILE);
    if (fs.existsSync(changelogFile)) {
        if (metadata.changelog !== undefined) {
            throw new Error(`${label} has both ${CHANGELOG_FILE} and a "changelog" in ${METADATA_FILE}; keep one.`);
        }
        metadata.changelog = fs.readFileSync(changelogFile, 'utf-8').trim();
    }
    return metadata;
}

function modrinthInputs(modrinth, where) {
    if (modrinth === undefined) {
        return [];
    }
    if (!isObject(modrinth)) {
        throw new Error(
            `${where}: "modrinth" must map project names to versions, like { "sodium": "mc1.21.1-0.6.0" }.`,
        );
    }
    return Object.entries(modrinth).map(([project, version]) => {
        if (typeof version !== 'string' || !version.trim()) {
            throw new Error(
                `${where}: Modrinth project "${project}" needs the version to bundle (its version number or id).`,
            );
        }
        return { kind: 'modrinth', project, version: version.trim(), key: `modrinth ${project}@${version.trim()}` };
    });
}

function fileInputs(files, where) {
    if (files === undefined) {
        return [];
    }
    if (!Array.isArray(files)) {
        throw new Error(`${where}: "files" must be a list like [{ "path": "mods/x.jar", "url": "…", "sha512": "…" }].`);
    }
    return files.map((file, i) => {
        const at = `${where} files[${i}]`;
        if (!isObject(file)) {
            throw new Error(`${at} must be an object with path, url and a checksum.`);
        }
        const unknown = Object.keys(file).filter(key => !['path', 'url', ...HASHES].includes(key));
        if (unknown.length > 0) {
            throw new Error(
                `${at} has unknown key(s) ${unknown.join(', ')} (allowed: path, url, ${HASHES.join(', ')}).`,
            );
        }
        return download(safePath(file.path, at), file.url, file, at);
    });
}

// A .mrpack's downloads, its overrides (client-overrides win) and the target and
// description it implies. `data` is the pack's bytes.
function mrpackInputs(data, where) {
    let entries;
    try {
        entries = readZip(data);
    } catch (error) {
        throw new Error(`${where} can't be read: ${error.message}.`, { cause: error });
    }
    const indexEntry = entries.find(entry => entry.name === 'modrinth.index.json');
    if (!indexEntry) {
        throw new Error(`${where} is not a Modrinth modpack (no modrinth.index.json inside).`);
    }
    let index;
    try {
        index = JSON.parse(indexEntry.data.toString('utf-8'));
    } catch (error) {
        throw new Error(`${where}: modrinth.index.json is not valid JSON.`, { cause: error });
    }
    if (index.formatVersion !== 1 || index.game !== 'minecraft') {
        throw new Error(`${where} is in a modpack format TMods doesn't know.`);
    }

    const inputs = (index.files || [])
        .filter(entry => entry.env?.client !== 'unsupported')
        .map(entry => {
            const at = `${where}: ${entry.path}`;
            return download(safePath(entry.path, where), entry.downloads, entry.hashes, at);
        });
    const overrides = new Map();
    for (const prefix of ['overrides/', 'client-overrides/']) {
        for (const entry of entries) {
            if (entry.name.startsWith(prefix) && !IGNORED_FILES.has(path.posix.basename(entry.name))) {
                const name = safePath(entry.name.slice(prefix.length), where);
                overrides.set(name, localFile(name, entry.data));
            }
        }
    }
    inputs.push(...overrides.values());

    const dependencies = index.dependencies || {};
    const loader = Object.keys(PACK_LOADERS).find(key => dependencies[key]);
    const game = dependencies.minecraft;
    const target = game ? `${loader ? PACK_LOADERS[loader] : 'Minecraft'} ${game}` : undefined;
    return { inputs, target, description: typeof index.summary === 'string' ? index.summary : undefined };
}

// Reads a version folder. Returns { metadata, inputs, key } where metadata holds the
// manifest's text fields and `key` changes whenever the zip's contents would.
function readVersion(versionDir, label) {
    const metadata = readMetadata(versionDir, label);
    const inputs = [];
    const packs = [];
    for (const { name, full } of listFiles(versionDir)) {
        if (name === METADATA_FILE || name === CHANGELOG_FILE) {
            continue;
        }
        if (!name.includes('/') && name.toLowerCase().endsWith('.mrpack')) {
            packs.push(full);
        } else {
            inputs.push(localFile(name, fs.readFileSync(full)));
        }
    }
    if (packs.length > 1) {
        throw new Error(`${label} has ${packs.length} .mrpack files; a version can be built from one.`);
    }

    const defaults = {};
    for (const pack of packs) {
        const result = mrpackInputs(fs.readFileSync(pack), `${label}/${path.basename(pack)}`);
        inputs.push(...result.inputs);
        defaults.target = result.target;
        defaults.description = result.description;
    }
    inputs.push(...modrinthInputs(metadata.modrinth, `${label}/${METADATA_FILE}`));
    inputs.push(...fileInputs(metadata.files, `${label}/${METADATA_FILE}`));
    if (inputs.length === 0) {
        throw new Error(`${label} has no files to bundle.`);
    }

    const key = sha256([FORMAT, ...inputs.map(input => input.key).sort()].join('\n'));
    return { metadata: textOf(metadata, defaults), inputs, key };
}

// The manifest's text fields: bundle.json's, else what the .mrpack says.
function textOf(metadata, defaults) {
    const text = {};
    for (const key of TEXT_KEYS) {
        const value = metadata[key] ?? defaults[key];
        if (value !== undefined) {
            text[key] = value;
        }
    }
    return text;
}

// Reads a version of the packs category: exactly one .mrpack, plus the optional text
// files. Returns { metadata, data, inputs, key }: `data` is the pack to publish as it is,
// `inputs` its downloads and overrides (fetched only to check every link still works),
// and `key` changes whenever the pack's bytes do.
function readPack(versionDir, label) {
    const metadata = readMetadata(versionDir, label);
    for (const key of ['modrinth', 'files']) {
        if (metadata[key] !== undefined) {
            throw new Error(
                `${label}/${METADATA_FILE}: a pack is published as its .mrpack, so "${key}" can't add to it.`,
            );
        }
    }
    const files = listFiles(versionDir).filter(({ name }) => name !== METADATA_FILE && name !== CHANGELOG_FILE);
    if (files.length !== 1 || !/^[^/]+\.mrpack$/i.test(files[0].name)) {
        throw new Error(
            `${label} must hold exactly one .mrpack file (plus an optional ${METADATA_FILE} or ${CHANGELOG_FILE}).`,
        );
    }
    const data = fs.readFileSync(files[0].full);
    const result = mrpackInputs(data, `${label}/${files[0].name}`);
    const key = sha256([PACK_FORMAT, sha256(data)].join('\n'));
    return { metadata: textOf(metadata, result), data, inputs: result.inputs, key };
}

module.exports = { FORMAT, PACK_FORMAT, METADATA_FILE, CHANGELOG_FILE, readPack, readVersion, safePath };
