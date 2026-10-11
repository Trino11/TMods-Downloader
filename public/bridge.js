// Everything the page may ask the main process to do, and nothing more. The window runs
// sandboxed without Node, so its preload forwards each call here over IPC. Files can
// only be touched inside the allowed folders (the Minecraft folder, where every profile
// lives), so a page that shows text from strangers (mod descriptions, modpacks) can't be
// turned into a way to read or change anything else on the computer.
//
// Kept apart from Electron, with its Node modules passed in, so Jest can test it and the
// renderer's tests can run their services against it.

const HASH_ALGORITHMS = ['sha1', 'sha256', 'sha512'];
const HTTP_METHODS = ['GET', 'HEAD', 'POST'];

// Where the official launcher keeps the game. Profiles TMods makes live inside it too.
function defaultMinecraftDir(path, homedir) {
    return path.join(homedir, 'AppData', 'Roaming', '.minecraft');
}

// IPC hands binary data over as Uint8Array or ArrayBuffer; Node APIs want Buffers.
function toBuffer(data) {
    if (typeof data === 'string') {
        return Buffer.from(data, 'utf-8');
    }
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    if (data instanceof ArrayBuffer || Object.prototype.toString.call(data) === '[object ArrayBuffer]') {
        return Buffer.from(data);
    }
    throw new Error('Expected text or binary data.');
}

// `roots` are the folders the page may touch, `minecraftDir` the one it installs into.
function createBridge({ fs, path, crypto, AdmZip, platform, minecraftDir, roots = [minecraftDir] }) {
    const sameCase = platform === 'win32' ? p => p.toLowerCase() : p => p;
    const allowed = roots.map(root => sameCase(path.resolve(root)));

    // The absolute path to use for `target`, or an error when it's outside every root.
    function inside(target) {
        if (typeof target !== 'string' || !path.isAbsolute(target)) {
            throw new Error(`Not an absolute path: ${target}`);
        }
        const resolved = path.resolve(target);
        const key = sameCase(resolved);
        if (!allowed.some(root => key === root || key.startsWith(root + path.sep))) {
            throw new Error(`TMods may not access ${resolved}`);
        }
        return resolved;
    }

    function openZip(data) {
        try {
            return new AdmZip(toBuffer(data));
        } catch {
            throw new Error('Not a valid zip file.');
        }
    }

    const methods = {
        'path.join': (...parts) => path.join(...parts.map(String)),
        'path.dirname': p => path.dirname(String(p)),
        'path.basename': p => path.basename(String(p)),

        'fs.exists': p => fs.existsSync(inside(p)),
        // Text when an encoding is given, bytes otherwise.
        'fs.readFile': (p, encoding) => fs.readFileSync(inside(p), encoding ? 'utf-8' : undefined),
        'fs.writeFile': (p, data) => fs.writeFileSync(inside(p), toBuffer(data)),
        'fs.mkdir': (p, { recursive = false } = {}) => {
            fs.mkdirSync(inside(p), { recursive: Boolean(recursive) });
        },
        'fs.rm': (p, { recursive = false, force = false } = {}) =>
            fs.rmSync(inside(p), { recursive: Boolean(recursive), force: Boolean(force) }),
        'fs.rename': (from, to) => fs.renameSync(inside(from), inside(to)),
        'fs.readdir': p =>
            fs.readdirSync(inside(p), { withFileTypes: true }).map(entry => ({
                name: entry.name,
                isDirectory: entry.isDirectory(),
            })),
        'fs.copy': (from, to) => fs.cpSync(inside(from), inside(to), { recursive: true }),

        'crypto.hash': (algorithm, data) => {
            if (!HASH_ALGORITHMS.includes(algorithm)) {
                throw new Error(`Unsupported hash: ${algorithm}`);
            }
            return crypto.createHash(algorithm).update(toBuffer(data)).digest('hex');
        },

        // Every entry of a zip, as { name, isDirectory, data }.
        'zip.read': data =>
            openZip(data)
                .getEntries()
                .map(entry => ({
                    name: entry.entryName,
                    isDirectory: entry.isDirectory,
                    data: entry.isDirectory ? new Uint8Array(0) : entry.getData(),
                })),
        'zip.extract': (data, dir) => openZip(data).extractAllTo(inside(dir), true),
        // Builds a zip from entries: { name, data } adds a file, { file, into } a file from
        // disk under the folder `into`, { folder, into } a whole folder from disk.
        'zip.create': entries => {
            const zip = new AdmZip();
            for (const entry of entries) {
                if (entry.file) {
                    zip.addLocalFile(inside(entry.file), entry.into || '');
                } else if (entry.folder) {
                    zip.addLocalFolder(inside(entry.folder), entry.into || '');
                } else {
                    zip.addFile(String(entry.name), toBuffer(entry.data));
                }
            }
            return zip.toBuffer();
        },
    };

    // Runs one call from the page. Errors come back as values, since a synchronous IPC
    // reply can't throw.
    function call(method, args) {
        if (!Object.prototype.hasOwnProperty.call(methods, method)) {
            return { error: `Unknown call: ${method}` };
        }
        try {
            return { value: methods[method](...(Array.isArray(args) ? args : [])) };
        } catch (error) {
            return { error: error.message, code: error.code };
        }
    }

    return {
        info: { platform, sep: path.sep, minecraftDir, methods: Object.keys(methods) },
        methods,
        call,
    };
}

// The page's web requests, made by the main process so they aren't subject to CORS
// (the manifest and bundle hosts don't send CORS headers). Only plain http(s) requests,
// and every one identifies TMods, as Modrinth asks apps to.
function createHttp(fetch, userAgent) {
    return async function request({ method = 'GET', url, headers = {}, data, responseType } = {}) {
        const verb = String(method).toUpperCase();
        if (!HTTP_METHODS.includes(verb)) {
            throw new Error(`Unsupported request method: ${method}`);
        }
        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error(`Invalid URL: ${url}`);
        }
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            throw new Error(`Only web addresses can be fetched: ${url}`);
        }

        const response = await fetch(parsed.href, {
            method: verb,
            headers: { ...headers, 'User-Agent': userAgent },
            body: verb === 'POST' && data != null ? data : undefined,
        });
        const body = responseType === 'arraybuffer' ? await response.arrayBuffer() : await response.text();
        return {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data: body,
        };
    };
}

module.exports = { HASH_ALGORITHMS, defaultMinecraftDir, toBuffer, createBridge, createHttp };
