// Turns a version's inputs into files: looks pinned Modrinth versions up and downloads
// every listed file, checking it against its checksum. Runs on the GitHub runner, so
// the bundles repository only stores small JSON and .mrpack files, not jars.
const crypto = require('crypto');
const { safePath } = require('./sources');

const MODRINTH_API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'Trino11/TMods-Downloader publish-bundles (github.com/Trino11/TMods-Downloader)';
const ATTEMPTS = 3;
const DOWNLOADS_AT_ONCE = 4;

// Where Modrinth content lands, from the loaders its version lists. Canvas and vanilla
// (core) shaders load from resourcepacks/, like the app's Modrinth page assumes.
const SHADER_LOADERS = ['iris', 'optifine'];
const PACK_LOADERS = ['minecraft', 'canvas', 'vanilla'];

function folderFor(loaders) {
    if (loaders.includes('datapack')) {
        return null;
    }
    if (loaders.some(loader => SHADER_LOADERS.includes(loader))) {
        return 'shaderpacks';
    }
    if (loaders.length > 0 && loaders.every(loader => PACK_LOADERS.includes(loader))) {
        return 'resourcepacks';
    }
    return 'mods';
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Shares lookups and downloads across every version of a publish, so a mod pinned by
// twenty versions is fetched once.
function createRemote({ fetch = globalThis.fetch, retryDelay = 1000 } = {}) {
    const versions = new Map();
    const downloads = new Map();

    async function request(url, what) {
        let lastError;
        for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
            try {
                const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
                // A missing page won't appear on a retry.
                if (response.ok || response.status === 404) {
                    return response;
                }
                lastError = new Error(`${what} answered ${response.status}`);
            } catch (error) {
                lastError = new Error(`${what} failed: ${error.message}`, { cause: error });
            }
            if (attempt < ATTEMPTS) {
                await wait(retryDelay * attempt);
            }
        }
        throw lastError;
    }

    async function recentVersions(project) {
        const response = await request(`${MODRINTH_API}/project/${encodeURIComponent(project)}/version`, project);
        if (!response.ok) {
            return null;
        }
        return (await response.json()).slice(0, 5).map(version => version.version_number);
    }

    async function lookUp({ project, version }) {
        const url = `${MODRINTH_API}/project/${encodeURIComponent(project)}/version/${encodeURIComponent(version)}`;
        const response = await request(url, `Modrinth (${project} ${version})`);
        if (response.status === 404) {
            const recent = await recentVersions(project);
            throw new Error(
                recent
                    ? `Modrinth project "${project}" has no version "${version}". Its newest are: ${recent.join(', ')}.`
                    : `Modrinth has no project "${project}". Use the name in its URL, e.g. modrinth.com/mod/sodium.`,
            );
        }
        const found = await response.json();
        const file = found.files.find(f => f.primary) || found.files[0];
        if (!file) {
            throw new Error(`Modrinth ${project} ${version} has no file to download.`);
        }
        const folder = folderFor(found.loaders || []);
        if (!folder) {
            throw new Error(`Modrinth ${project} ${version} is a data pack, which goes inside a world, not a bundle.`);
        }
        return {
            path: safePath(`${folder}/${file.filename}`, `Modrinth ${project} ${version}`),
            urls: [file.url],
            hash: { algorithm: 'sha512', value: file.hashes.sha512 },
            label: `${project} ${version}`,
        };
    }

    async function fetchVerified({ urls, hash, label }) {
        let lastError;
        for (const url of urls) {
            try {
                const response = await request(url, label);
                if (!response.ok) {
                    throw new Error(`${label} answered ${response.status}`);
                }
                const data = Buffer.from(await response.arrayBuffer());
                const actual = crypto.createHash(hash.algorithm).update(data).digest('hex');
                if (actual !== hash.value) {
                    throw new Error(`${label} doesn't match its ${hash.algorithm} checksum`);
                }
                return data;
            } catch (error) {
                lastError = error;
            }
        }
        throw new Error(`Couldn't download ${label} from ${urls.join(' or ')}: ${lastError.message}`, {
            cause: lastError,
        });
    }

    function once(cache, key, work) {
        if (!cache.has(key)) {
            const pending = work();
            // A failure shouldn't be remembered for the next caller to rethrow silently.
            pending.catch(() => cache.delete(key));
            cache.set(key, pending);
        }
        return cache.get(key);
    }

    async function resolve(input) {
        if (input.kind === 'file') {
            return { name: input.path, data: input.data };
        }
        const source =
            input.kind === 'modrinth'
                ? await once(versions, input.key, () => lookUp(input))
                : { path: input.path, urls: input.urls, hash: input.hash, label: input.path };
        const data = await once(downloads, `${source.hash.algorithm}:${source.hash.value}`, () =>
            fetchVerified(source),
        );
        return { name: source.path, data };
    }

    // Every input of a version as { name, data }, refusing two inputs at one path.
    async function filesOf(inputs, label) {
        const files = [];
        for (let i = 0; i < inputs.length; i += DOWNLOADS_AT_ONCE) {
            files.push(...(await Promise.all(inputs.slice(i, i + DOWNLOADS_AT_ONCE).map(resolve))));
        }
        const seen = new Set();
        for (const file of files) {
            if (seen.has(file.name)) {
                throw new Error(`${label} has two files at ${file.name}; keep one.`);
            }
            seen.add(file.name);
        }
        return files;
    }

    return { filesOf };
}

module.exports = { createRemote, folderFor };
