jest.mock('axios', () => ({ get: jest.fn() }));

const axios = require('axios');
const categories = require('../../src/modules/categories').default;
const { latestVersion } = require('../../src/modules/services/manifest');
const { realmSafeAdmZip } = require('../../src/modules/services/__fixtures__/modrinthFake');

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CATEGORIES, buildBundles, main } = require('../../publish-bundles/build-bundles');

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
    delete global.window.require;
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
    it('knows the same categories as the app', () => {
        expect(CATEGORIES).toEqual(categories.map(category => category.id));
    });

    it('writes the manifest the app reads, newest version first', () => {
        const { manifest, uploads } = buildBundles({ source: FIXTURE, downloadBase: BASE });

        expect(manifest.latest).toEqual({ mods: '1.10.0', configs: '2024-06' });
        expect(manifest.versions.mods.map(v => v.id)).toEqual(['1.10.0', '1.9.0']);
        expect(manifest.versions.mods[0]).toEqual({
            id: '1.10.0',
            url: `${BASE}/mods-1.10.0.zip`,
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            target: 'Fabric 1.21.1',
            description: 'Adds Lithium',
            changelog: '- Added Lithium\n- Updated Sodium to 0.6',
        });
        expect(manifest.versions.mods[1].changelog).toBe('First pack.');
        expect(latestVersion(manifest, 'mods').id).toBe('1.10.0');
        expect(uploads.map(upload => upload.name)).toEqual([
            'mods-1.10.0.zip',
            'mods-1.9.0.zip',
            'configs-2024-06.zip',
        ]);
    });

    it('zips the files as they land in the game folder, without the metadata files', () => {
        const { manifest, uploads } = buildBundles({ source: FIXTURE, downloadBase: BASE });
        const zip = uploads.find(upload => upload.name === 'mods-1.10.0.zip').data;

        expect(zipContents(zip)).toEqual({
            'mods/lithium.jar': 'fake lithium jar\n',
            'mods/sodium.jar': 'fake sodium 0.6 jar\n',
        });
        expect(crypto.createHash('sha256').update(zip).digest('hex')).toBe(manifest.versions.mods[0].sha256);
    });

    it('compresses files that shrink', () => {
        const text = 'option=value\n'.repeat(5000);
        const source = writeTree(path.join(temp, 'src'), { 'configs/1/config/big.txt': text });
        const { uploads } = buildBundles({ source, downloadBase: BASE });

        expect(uploads[0].data.length).toBeLessThan(text.length / 10);
        expect(zipContents(uploads[0].data)).toEqual({ 'config/big.txt': text });
    });

    it('builds identical zips from identical files', () => {
        const first = buildBundles({ source: FIXTURE, downloadBase: BASE });
        const second = buildBundles({ source: FIXTURE, downloadBase: BASE });
        expect(second.manifest).toEqual(first.manifest);
        expect(Buffer.compare(second.uploads[0].data, first.uploads[0].data)).toBe(0);
    });

    it('keeps the old URL of a bundle that has not changed and uploads only the rest', () => {
        const previous = buildBundles({ source: FIXTURE, downloadBase: BASE }).manifest;
        previous.versions.mods[0].sha256 = 'f'.repeat(64); // 1.10.0 changed since

        const { manifest, uploads } = buildBundles({
            source: FIXTURE,
            downloadBase: 'https://github.com/someone/bundles/releases/download/bundles-2',
            previous,
        });

        expect(uploads.map(upload => upload.name)).toEqual(['mods-1.10.0.zip']);
        expect(uploads[0].replaced).toBe(true);
        expect(manifest.versions.mods[0].url).toContain('/bundles-2/');
        expect(manifest.versions.mods[1].url).toBe(`${BASE}/mods-1.9.0.zip`);
    });

    it('lets bundles.json pick the latest version', () => {
        const source = writeTree(path.join(temp, 'src'), {
            'mods/1.0.0/mods/a.jar': 'a',
            'mods/2.0.0-beta/mods/b.jar': 'b',
            'bundles.json': JSON.stringify({ latest: { mods: '1.0.0' } }),
        });
        const { manifest } = buildBundles({ source, downloadBase: BASE });
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
    ])('refuses a broken bundles folder (%#)', (files, message) => {
        const source = writeTree(path.join(temp, 'src'), files);
        expect(() => buildBundles({ source, downloadBase: BASE })).toThrow(message);
    });
});

describe('the build-bundles command', () => {
    it('writes the release assets and the stable manifest URL', () => {
        const out = path.join(temp, 'out');
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const result = main(['--source', FIXTURE, '--out', out, '--repo', 'someone/bundles', '--tag', 'bundles-1']);

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
        const again = main([
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
        const { manifest, uploads } = buildBundles({ source: FIXTURE, downloadBase: BASE });
        const home = path.join(temp, 'home');
        const gameDir = path.join(temp, 'game');
        fs.mkdirSync(gameDir);
        global.window.require = name => {
            if (name === 'os') {
                return { ...os, homedir: () => home };
            }
            return name === 'adm-zip' ? AdmZip : require(name);
        };
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
