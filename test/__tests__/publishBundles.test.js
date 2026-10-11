jest.mock('axios', () => ({ get: jest.fn() }));

const axios = require('axios');
const categories = require('../../src/modules/categories').default;
const { changelogOf, latestVersion } = require('../../src/modules/services/manifest');
const { realmSafeAdmZip } = require('../../src/modules/services/__fixtures__/modrinthFake');
const { installBridge, removeBridge } = require('../../src/modules/services/__fixtures__/bridge');

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CATEGORIES, buildBundles, main } = require('../../publish-bundles/build-bundles');
const { createRemote } = require('../../publish-bundles/remote');
const { createZip } = require('../../publish-bundles/zip');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bundles');
const BASE = 'https://github.com/someone/bundles/releases/download/bundles-1';

let temp;
let AdmZip;

beforeEach(() => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-publish-'));
    // adm-zip can't read in-memory buffers under jsdom; see realmSafeAdmZip.
    AdmZip = realmSafeAdmZip(temp);
    axios.get.mockReset();
});

afterEach(() => {
    fs.rmSync(temp, { recursive: true, force: true });
    removeBridge();
});

function writeTree(root, files) {
    for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), content);
    }
    return root;
}

function zipContents(data) {
    return Object.fromEntries(
        new AdmZip(data).getEntries().map(entry => [entry.entryName, entry.getData().toString('utf-8')]),
    );
}

describe('buildBundles', () => {
    it('knows the same categories as the app', async () => {
        expect(CATEGORIES).toEqual(categories.map(category => category.id));
    });

    it('writes the manifest the app reads, newest version first', async () => {
        const { manifest, uploads } = await buildBundles({ source: FIXTURE, downloadBase: BASE });

        expect(manifest.latest).toEqual({ mods: '1.10.0', configs: '2024-06' });
        expect(manifest.versions.mods.map(v => v.id)).toEqual(['1.10.0', '1.9.0']);
        expect(manifest.versions.mods[0]).toEqual({
            id: '1.10.0',
            url: `${BASE}/mods-1.10.0.zip`,
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            source: expect.stringMatching(/^[0-9a-f]{64}$/),
            target: 'Fabric 1.21.1',
            description: 'Adds Lithium',
            changelog: '- Added Lithium\n- Updated Sodium to 0.6',
        });
        expect(manifest.versions.mods[1].changelog).toBe('First pack.');
        expect(latestVersion(manifest, 'mods').id).toBe('1.10.0');
        expect(changelogOf(latestVersion(manifest, 'mods'))).toBe('- Added Lithium\n- Updated Sodium to 0.6');
        expect(uploads.map(upload => upload.name)).toEqual([
            'mods-1.10.0.zip',
            'mods-1.9.0.zip',
            'configs-2024-06.zip',
        ]);
    });

    it('zips the files as they land in the game folder, without the metadata files', async () => {
        const { manifest, uploads } = await buildBundles({ source: FIXTURE, downloadBase: BASE });
        const zip = uploads.find(upload => upload.name === 'mods-1.10.0.zip').data;

        expect(zipContents(zip)).toEqual({
            'mods/lithium.jar': 'fake lithium jar\n',
            'mods/sodium.jar': 'fake sodium 0.6 jar\n',
        });
        expect(crypto.createHash('sha256').update(zip).digest('hex')).toBe(manifest.versions.mods[0].sha256);
    });

    it('compresses files that shrink', async () => {
        const text = 'option=value\n'.repeat(5000);
        const source = writeTree(path.join(temp, 'src'), { 'configs/1/config/big.txt': text });
        const { uploads } = await buildBundles({ source, downloadBase: BASE });

        expect(uploads[0].data.length).toBeLessThan(text.length / 10);
        expect(zipContents(uploads[0].data)).toEqual({ 'config/big.txt': text });
    });

    it('builds identical zips from identical files', async () => {
        const first = await buildBundles({ source: FIXTURE, downloadBase: BASE });
        const second = await buildBundles({ source: FIXTURE, downloadBase: BASE });
        expect(second.manifest).toEqual(first.manifest);
        expect(Buffer.compare(second.uploads[0].data, first.uploads[0].data)).toBe(0);
    });

    it('keeps the old URL of a bundle that has not changed and uploads only the rest', async () => {
        const previous = (await buildBundles({ source: FIXTURE, downloadBase: BASE })).manifest;
        // 1.10.0 changed since.
        previous.versions.mods[0].source = 'f'.repeat(64);
        previous.versions.mods[0].sha256 = 'f'.repeat(64);

        const { manifest, uploads } = await buildBundles({
            source: FIXTURE,
            downloadBase: 'https://github.com/someone/bundles/releases/download/bundles-2',
            previous,
        });

        expect(uploads.map(upload => upload.name)).toEqual(['mods-1.10.0.zip']);
        expect(uploads[0].replaced).toBe(true);
        expect(manifest.versions.mods[0].url).toContain('/bundles-2/');
        expect(manifest.versions.mods[1].url).toBe(`${BASE}/mods-1.9.0.zip`);
    });

    it('lets bundles.json pick the latest version', async () => {
        const source = writeTree(path.join(temp, 'src'), {
            'mods/1.0.0/mods/a.jar': 'a',
            'mods/2.0.0-beta/mods/b.jar': 'b',
            'bundles.json': JSON.stringify({ latest: { mods: '1.0.0' } }),
        });
        const { manifest } = await buildBundles({ source, downloadBase: BASE });
        expect(latestVersion(manifest, 'mods').id).toBe('1.0.0');
    });

    it.each([
        [{ 'mod/1.0.0/a.jar': 'a' }, /Unknown category folder\(s\): mod/],
        [{ 'mods/1.0.0/bundle.json': '{}' }, /mods\/1.0.0 has no files/],
        [{ 'mods/1.0.0/a.jar': 'a', 'mods/1.0.0/bundle.json': '{"descripton":"x"}' }, /unknown key "descripton"/],
        [{ 'mods/1.0.0/a.jar': 'a', 'mods/1.0.0/bundle.json': '{"target":1}' }, /"target" must be a string/],
        [{ 'mods/1.0.0/a.jar': 'a', 'mods/1.0.0/bundle.json': '{' }, /not valid JSON/],
        [
            { 'mods/1.0.0/a.jar': 'a', 'mods/1.0.0/bundle.json': '{"changelog":"x"}', 'mods/1.0.0/CHANGELOG.md': 'y' },
            /keep one/,
        ],
        [{ 'mods/1.0.0/a.jar': 'a', 'bundles.json': '{"latest":{"mods":"9"}}' }, /no mods\/9/],
        [{ 'mods/a b/a.jar': 'a', 'mods/a-b/a.jar': 'a' }, /already uses/],
        [{ 'README.md': 'hi' }, /has no bundles/],
    ])('refuses a broken bundles folder (%#)', async (files, message) => {
        const source = writeTree(path.join(temp, 'src'), files);
        await expect(buildBundles({ source, downloadBase: BASE })).rejects.toThrow(message);
    });
});

describe('bundles built from references', () => {
    const API = 'https://api.modrinth.com/v2';
    const CDN = 'https://cdn.modrinth.com/data';
    const hash = (algorithm, data) => crypto.createHash(algorithm).update(data).digest('hex');

    function modrinthVersion(number, loaders, filename, data) {
        return {
            version_number: number,
            loaders,
            files: [
                { primary: false, filename: 'sources.jar', url: `${CDN}/sources.jar`, hashes: {} },
                { primary: true, filename, url: `${CDN}/${filename}`, hashes: { sha512: hash('sha512', data) } },
            ],
        };
    }

    // A fetch that serves Modrinth's API and CDN from `routes` (url -> body or status).
    function fakeFetch(routes) {
        return jest.fn(async url => {
            const route = routes[url];
            if (route === undefined || typeof route === 'number') {
                return { ok: false, status: route ?? 404 };
            }
            return {
                ok: true,
                status: 200,
                json: async () => route,
                arrayBuffer: async () => {
                    const data = Buffer.from(route);
                    return data.buffer.slice(data.byteOffset, data.byteOffset + data.length);
                },
            };
        });
    }

    const routes = {
        [`${API}/project/sodium/version/0.6.0`]: modrinthVersion('0.6.0', ['fabric', 'quilt'], 'sodium.jar', 'S'),
        [`${API}/project/faithful/version/1.0`]: modrinthVersion('1.0', ['minecraft'], 'faithful.zip', 'F'),
        [`${API}/project/complementary/version/r5`]: modrinthVersion('r5', ['iris', 'optifine'], 'comp.zip', 'C'),
        [`${API}/project/sodium/version`]: [{ version_number: '0.6.1' }, { version_number: '0.6.0' }],
        [`${CDN}/sodium.jar`]: 'S',
        [`${CDN}/faithful.zip`]: 'F',
        [`${CDN}/comp.zip`]: 'C',
        'https://example.com/extra.jar': 'E',
        'https://example.com/lithium.jar': 'L',
    };

    function mrpack(index, overrides = {}) {
        return createZip([
            { name: 'modrinth.index.json', data: Buffer.from(JSON.stringify(index)) },
            ...Object.entries(overrides).map(([name, text]) => ({ name, data: Buffer.from(text) })),
        ]);
    }

    const packIndex = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.0.0',
        name: 'My pack',
        summary: 'Sodium and friends',
        dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
        files: [
            {
                path: 'mods/lithium.jar',
                hashes: { sha1: hash('sha1', 'L'), sha512: hash('sha512', 'L') },
                downloads: ['https://example.com/lithium.jar'],
            },
            {
                path: 'mods/server-only.jar',
                hashes: { sha1: 'x' },
                downloads: ['https://example.com/server-only.jar'],
                env: { client: 'unsupported', server: 'required' },
            },
        ],
    };

    async function build(files, options = {}) {
        const source = writeTree(path.join(temp, 'src'), files);
        const fetch = options.fetch || fakeFetch(routes);
        const remote = createRemote({ fetch, retryDelay: 0 });
        const result = await buildBundles({ source, downloadBase: BASE, remote, previous: options.previous });
        return { ...result, fetch, source };
    }

    it('downloads pinned Modrinth versions into the folder each one belongs in', async () => {
        const { manifest, uploads } = await build({
            'mods/1.0.0/bundle.json': JSON.stringify({
                target: 'Fabric 1.21.1',
                modrinth: { sodium: '0.6.0', faithful: '1.0', complementary: 'r5' },
            }),
            'mods/1.0.0/config/sodium-options.json': '{}',
        });

        expect(zipContents(uploads[0].data)).toEqual({
            'config/sodium-options.json': '{}',
            'mods/sodium.jar': 'S',
            'resourcepacks/faithful.zip': 'F',
            'shaderpacks/comp.zip': 'C',
        });
        // Only the text reaches the manifest.
        expect(Object.keys(manifest.versions.mods[0]).sort()).toEqual(['id', 'sha256', 'source', 'target', 'url']);
    });

    it('bundles a .mrpack: its downloads for the client and its overrides', async () => {
        const pack = mrpack(packIndex, {
            'overrides/config/a.txt': 'shared',
            'client-overrides/config/a.txt': 'client',
            'overrides/options.txt': 'fov:90',
        });
        const { manifest, uploads } = await build({ 'mods/1.0.0/pack.mrpack': pack });

        expect(zipContents(uploads[0].data)).toEqual({
            'config/a.txt': 'client',
            'mods/lithium.jar': 'L',
            'options.txt': 'fov:90',
        });
        expect(manifest.versions.mods[0]).toMatchObject({ target: 'Fabric 1.21.1', description: 'Sodium and friends' });
    });

    it('lets bundle.json override what the .mrpack says and add to it', async () => {
        const { manifest, uploads } = await build({
            'mods/1.0.0/pack.mrpack': mrpack(packIndex),
            'mods/1.0.0/bundle.json': JSON.stringify({
                description: 'Mine',
                files: [{ path: 'mods/extra.jar', url: 'https://example.com/extra.jar', sha256: hash('sha256', 'E') }],
            }),
        });
        expect(Object.keys(zipContents(uploads[0].data))).toEqual(['mods/extra.jar', 'mods/lithium.jar']);
        expect(manifest.versions.mods[0]).toMatchObject({ target: 'Fabric 1.21.1', description: 'Mine' });
    });

    it('downloads a file shared by several versions once', async () => {
        const { fetch } = await build({
            'mods/1/bundle.json': JSON.stringify({ modrinth: { sodium: '0.6.0' } }),
            'mods/2/bundle.json': JSON.stringify({ modrinth: { sodium: '0.6.0' } }),
            'mods/2/config/x.txt': 'x',
        });
        expect(fetch.mock.calls.filter(([url]) => url === `${CDN}/sodium.jar`)).toHaveLength(1);
        expect(fetch.mock.calls.filter(([url]) => url.startsWith(API))).toHaveLength(1);
    });

    it('reuses published zips without downloading anything when nothing changed', async () => {
        const files = {
            'mods/1.0.0/pack.mrpack': mrpack(packIndex),
            'mods/1.0.0/bundle.json': JSON.stringify({ modrinth: { sodium: '0.6.0' } }),
        };
        const first = await build(files);
        fs.rmSync(first.source, { recursive: true });
        const second = await build(files, { previous: first.manifest });

        expect(second.fetch).not.toHaveBeenCalled();
        expect(second.uploads).toEqual([]);
        expect(second.manifest).toEqual(first.manifest);
    });

    it('rebuilds a version when its pinned version changes', async () => {
        const first = await build({ 'mods/1/bundle.json': JSON.stringify({ modrinth: { sodium: '0.6.0' } }) });
        fs.rmSync(first.source, { recursive: true });
        const second = await build(
            { 'mods/1/bundle.json': JSON.stringify({ modrinth: { faithful: '1.0' } }) },
            { previous: first.manifest },
        );
        expect(second.uploads.map(upload => upload.replaced)).toEqual([true]);
    });

    it('retries a download that fails for a moment', async () => {
        const fetch = fakeFetch(routes);
        const flaky = jest.fn(async (url, init) =>
            flaky.mock.calls.length === 1 ? { ok: false, status: 502 } : fetch(url, init),
        );
        const { uploads } = await build(
            { 'mods/1/bundle.json': JSON.stringify({ modrinth: { sodium: '0.6.0' } }) },
            { fetch: flaky },
        );
        expect(zipContents(uploads[0].data)).toEqual({ 'mods/sodium.jar': 'S' });
    });

    it.each([
        [{ modrinth: { sodium: '9.9' } }, /"sodium" has no version "9.9". Its newest are: 0.6.1, 0.6.0/],
        [{ modrinth: { sodiumm: '1' } }, /no project "sodiumm"/],
        [{ modrinth: { sodium: '' } }, /needs the version to bundle/],
        [{ modrinth: ['sodium'] }, /"modrinth" must map project names/],
        [{ files: [{ path: 'mods/x.jar', url: 'https://example.com/extra.jar' }] }, /needs a checksum/],
        [{ files: [{ path: 'mods/x.jar', url: 'http://example.com/x', sha1: 'a' }] }, /needs an https download/],
        [{ files: [{ path: '../x.jar', url: 'https://example.com/extra.jar', sha1: 'a' }] }, /not a path inside/],
        [
            { files: [{ path: 'mods/x.jar', url: 'https://example.com/extra.jar', sha256: 'bad' }] },
            /doesn't match its sha256 checksum/,
        ],
        [
            {
                modrinth: { sodium: '0.6.0' },
                files: [{ path: 'mods/sodium.jar', url: 'https://example.com/extra.jar', sha256: hash('sha256', 'E') }],
            },
            /two files at mods\/sodium.jar/,
        ],
    ])('refuses a broken reference (%#)', async (metadata, message) => {
        await expect(build({ 'mods/1/bundle.json': JSON.stringify(metadata) })).rejects.toThrow(message);
    });

    it.each([
        [{ 'mods/1/a.mrpack': 'not a zip' }, /can't be read/],
        [{ 'mods/1/a.mrpack': createZip([{ name: 'x', data: Buffer.from('') }]) }, /no modrinth.index.json/],
        [
            { 'mods/1/a.mrpack': mrpack({ ...packIndex, files: [{ ...packIndex.files[0], path: '/etc/x' }] }) },
            /not a path inside/,
        ],
        [{ 'mods/1/a.mrpack': mrpack(packIndex), 'mods/1/b.mrpack': mrpack(packIndex) }, /2 .mrpack files/],
    ])('refuses a broken .mrpack (%#)', async (files, message) => {
        await expect(build(files)).rejects.toThrow(message);
    });
});

describe('the build-bundles command', () => {
    it('writes the release assets and the stable manifest URL', async () => {
        const out = path.join(temp, 'out');
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const result = await main([
            '--source',
            FIXTURE,
            '--out',
            out,
            '--repo',
            'someone/bundles',
            '--tag',
            'bundles-1',
        ]);

        expect(result.changed).toBe(true);
        expect(fs.readdirSync(path.join(out, 'assets')).sort()).toEqual([
            'configs-2024-06.zip',
            'manifest.json',
            'mods-1.10.0.zip',
            'mods-1.9.0.zip',
        ]);
        expect(JSON.parse(fs.readFileSync(path.join(out, 'assets', 'manifest.json'), 'utf-8'))).toEqual(
            result.manifest,
        );
        expect(fs.readFileSync(path.join(out, 'notes.md'), 'utf-8')).toContain('| mods | 1.10.0 |');
        expect(log).toHaveBeenCalledWith(
            'Manifest: https://github.com/someone/bundles/releases/latest/download/manifest.json',
        );

        // Run again against the manifest just written: nothing to upload, nothing to release.
        const again = await main([
            ...['--source', FIXTURE, '--out', path.join(temp, 'out2'), '--repo', 'someone/bundles'],
            ...['--tag', 'bundles-2', '--previous', path.join(out, 'assets', 'manifest.json')],
        ]);
        expect(again.uploads).toEqual([]);
        expect(again.changed).toBe(false);
        log.mockRestore();
    });
});

describe('installing a published bundle in the app', () => {
    it('passes the checksum check and extracts into the game folder', async () => {
        const { manifest, uploads } = await buildBundles({ source: FIXTURE, downloadBase: BASE });
        const gameDir = path.join(temp, 'game');
        fs.mkdirSync(gameDir);
        installBridge(temp, { AdmZip });
        let installBundle;
        jest.isolateModules(() => {
            ({ installBundle } = require('../../src/modules/services/bundleInstaller'));
        });

        const version = latestVersion(manifest, 'mods');
        const zip = uploads.find(upload => version.url.endsWith(upload.name)).data;
        axios.get.mockResolvedValue({ data: zip });
        await installBundle(
            categories.find(c => c.id === 'mods'),
            version,
            gameDir,
        );

        expect(axios.get).toHaveBeenCalledWith(version.url, { responseType: 'arraybuffer' });
        expect(fs.readdirSync(path.join(gameDir, 'mods')).sort()).toEqual(['lithium.jar', 'sodium.jar']);
    });
});
