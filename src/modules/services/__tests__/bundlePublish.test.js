import { installBridge, removeBridge } from '../__fixtures__/bridge';

const fs = require('fs');
const os = require('os');
const path = require('path');

let home;
let bridge;
let service;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-publish-'));
    localStorage.clear();
    bridge = installBridge(home);
    jest.isolateModules(() => {
        service = require('../bundlePublish');
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

describe('nextVersion', () => {
    it.each([
        [[], '1.0.0'],
        [['1.9.0', '1.10.0'], '1.10.1'],
        [['2024-06'], '2024-07'],
        [['1.0.0-beta'], '1.0.1-beta'],
        [['first'], '1.0.0'],
    ])('after %p suggests %p', (existing, next) => {
        expect(service.nextVersion(existing)).toBe(next);
    });
});

describe('bundlesRepo', () => {
    it('defaults to the repository the manifest is published from', () => {
        localStorage.setItem(
            'tmods.manifestUrl',
            'https://github.com/Trino11/TMods-bundles/releases/latest/download/manifest.json',
        );
        expect(service.bundlesRepo()).toBe('Trino11/TMods-bundles');
    });

    it('prefers the one saved in Settings', () => {
        localStorage.setItem('tmods.manifestUrl', 'https://github.com/a/b/releases/latest/download/manifest.json');
        localStorage.setItem('tmods.bundlesRepo', 'c/d');
        expect(service.bundlesRepo()).toBe('c/d');
    });

    it('is empty for a manifest hosted elsewhere', () => {
        localStorage.setItem('tmods.manifestUrl', 'https://cdn.example.com/manifest.json');
        expect(service.bundlesRepo()).toBe('');
    });
});

describe('publishPack', () => {
    const AdmZip = require('adm-zip');

    // A pack with a mod link and a config copied into overrides/.
    function makePack() {
        const zip = new AdmZip();
        const index = {
            formatVersion: 1,
            game: 'minecraft',
            versionId: '1.2.0',
            name: 'Friends',
            files: [
                {
                    path: 'mods/sodium.jar',
                    hashes: { sha1: 'a', sha512: 'b' },
                    downloads: ['https://cdn.modrinth.com/s.jar'],
                    fileSize: 1,
                },
            ],
            dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
        };
        zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index)));
        zip.addFile('overrides/config/sodium.json', Buffer.from('{}'));
        return new Uint8Array(zip.toBuffer());
    }

    const contents = data => {
        const zip = new AdmZip(Buffer.from(data));
        return {
            entries: zip.getEntries().map(entry => entry.entryName),
            links: JSON.parse(zip.readAsText('modrinth.index.json')).files.map(file => file.path),
        };
    };

    let pack;

    beforeEach(() => {
        pack = makePack();
        bridge.github.publish.mockResolvedValue({ commitUrl: 'c', actionsUrl: 'a' });
    });

    it('commits the whole pack and its text as a new packs version', async () => {
        const result = await service.publishPack({
            repo: 'a/b',
            versions: [{ category: 'packs', version: '1.2.0' }],
            data: pack,
            description: ' Faster ',
            changelog: '- Added Sodium\n',
        });

        expect(bridge.github.publish).toHaveBeenCalledWith({
            repo: 'a/b',
            versions: [
                {
                    category: 'packs',
                    version: '1.2.0',
                    files: [
                        { name: 'pack.mrpack', data: pack },
                        {
                            name: 'bundle.json',
                            data: '{\n  "description": "Faster",\n  "changelog": "- Added Sodium"\n}\n',
                        },
                    ],
                },
            ],
            message: 'Add packs 1.2.0 from TMods',
        });
        expect(result).toEqual({ commitUrl: 'c', actionsUrl: 'a' });
    });

    it('publishes several categories in one commit, each with only its own files', async () => {
        await service.publishPack({
            repo: 'a/b',
            versions: [
                { category: 'packs', version: '2.0.0' },
                { category: 'mods', version: '1.4.0' },
                { category: 'configs', version: '3' },
            ],
            data: pack,
        });

        expect(bridge.github.publish).toHaveBeenCalledTimes(1);
        const request = bridge.github.publish.mock.calls[0][0];
        expect(request.message).toBe('Add packs 2.0.0, mods 1.4.0, configs 3 from TMods');
        const [packs, mods, configs] = request.versions;
        expect(packs.files).toEqual([{ name: 'pack.mrpack', data: pack }]);
        expect(mods).toMatchObject({ category: 'mods', version: '1.4.0' });
        expect(contents(mods.files[0].data)).toEqual({ entries: ['modrinth.index.json'], links: ['mods/sodium.jar'] });
        expect(contents(configs.files[0].data)).toEqual({
            entries: ['modrinth.index.json', 'overrides/config/sodium.json'],
            links: [],
        });
    });

    it('refuses a category the pack has nothing for, before publishing anything', async () => {
        await expect(
            service.publishPack({
                repo: 'a/b',
                versions: [
                    { category: 'packs', version: '1' },
                    { category: 'shaderpacks', version: '1' },
                ],
                data: pack,
            }),
        ).rejects.toThrow('The pack has nothing that goes in Shaderpacks.');
        expect(bridge.github.publish).not.toHaveBeenCalled();
    });

    it('knows which categories a pack has files for', () => {
        expect(service.categoryHasFiles('packs', ['settings'])).toBe(true);
        expect(service.categoryHasFiles('mods', ['mod', 'config'])).toBe(true);
        expect(service.categoryHasFiles('shaderpacks', ['mod', 'config'])).toBe(false);
        expect(service.categoryHasFiles('mods', [])).toBe(false);
    });

    it('refuses packs over the 100 MB GitHub takes', async () => {
        const big = { length: service.MAX_PACK_BYTES + 1 };
        const versions = [{ category: 'packs', version: '1' }];
        await expect(service.publishPack({ repo: 'a/b', versions, data: big })).rejects.toThrow(
            /101 MB, and GitHub takes files up to 100 MB/,
        );
        expect(bridge.github.publish).not.toHaveBeenCalled();
    });

    it('offers whole packs first, then every category the main process accepts', () => {
        const { CATEGORIES } = require('../../../../public/bundlePublisher');
        expect(service.PUBLISH_CATEGORIES.map(category => category.id)).toEqual([
            'packs',
            ...CATEGORIES.filter(id => id !== 'packs'),
        ]);
        expect(service.PUBLISH_CATEGORIES.filter(category => !category.kinds).map(category => category.id)).toEqual([
            'packs',
        ]);
    });

    it("shows the main process's message without Electron's wrapping", async () => {
        bridge.github.publish.mockRejectedValue(
            new Error(
                "Error invoking remote method 'github:publish': Error: packs 1 is already in a/b. Pick a new version.",
            ),
        );
        const versions = [{ category: 'packs', version: '1' }];
        await expect(service.publishPack({ repo: 'a/b', versions, data: pack })).rejects.toThrow(
            /^packs 1 is already in a\/b. Pick a new version.$/,
        );
    });
});
