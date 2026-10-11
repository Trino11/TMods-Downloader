// The page has no Node of its own (the window is sandboxed). The preload script gives it
// window.tmods, whose calls the main process carries out, and only inside the Minecraft
// folder (see public/bridge.js). This file wraps those calls in the familiar shapes of
// Node's fs, path and crypto, so services read like ordinary Node code. Every service
// takes them from here and never touches window.tmods itself. Tests install a bridge
// that runs the main process's code directly (services/__fixtures__/bridge.js).
const bridge = window.tmods;

export const path = {
    sep: bridge?.sep,
    join: (...parts) => bridge.path.join(...parts),
    dirname: p => bridge.path.dirname(p),
    basename: p => bridge.path.basename(p),
};

export const fs = {
    existsSync: p => bridge.fs.exists(p),
    readFileSync: (p, encoding) => bridge.fs.readFile(p, encoding),
    writeFileSync: (p, data) => bridge.fs.writeFile(p, data),
    mkdirSync: (p, options) => bridge.fs.mkdir(p, options),
    rmSync: (p, options) => bridge.fs.rm(p, options),
    renameSync: (from, to) => bridge.fs.rename(from, to),
    // Recursive, like every copy the app makes.
    cpSync: (from, to) => bridge.fs.copy(from, to),
    readdirSync: (p, { withFileTypes = false } = {}) => {
        const entries = bridge.fs.readdir(p);
        if (!withFileTypes) {
            return entries.map(entry => entry.name);
        }
        return entries.map(({ name, isDirectory }) => ({ name, isDirectory: () => isDirectory }));
    },
};

export const crypto = {
    // createHash(algorithm).update(data).digest('hex'), for sha1, sha256 and sha512.
    createHash: algorithm => {
        let input;
        const hash = {
            update: data => {
                input = data;
                return hash;
            },
            digest: () => bridge.crypto.hash(algorithm, input),
        };
        return hash;
    },
};

// Zips are read and written by the main process too. Data is a Uint8Array or ArrayBuffer.
export const zip = {
    // Every entry, as { name, isDirectory, data }.
    read: data => bridge.zip.read(data),
    extract: (data, dir) => bridge.zip.extract(data, dir),
    // Entries are { name, data }, { file, into } or { folder, into }; returns the zip's bytes.
    create: entries => bridge.zip.create(entries),
};

// Where the official launcher keeps the game.
export const minecraftDir = bridge?.minecraftDir;

// The page's web requests are made by the main process, so CORS doesn't apply.
export const http = request => bridge.http(request);

// Finding and opening the app's log file (Settings). Each call resolves to the log's
// path or, for the opening ones, an error message ('' when it worked).
export const logs = {
    getPath: () => bridge.logs.getPath(),
    openFile: () => bridge.logs.openFile(),
    showInFolder: () => bridge.logs.showInFolder(),
};

export function bytesToText(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
}
