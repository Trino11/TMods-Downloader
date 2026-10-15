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

    it('commits each category its own part of the pack, with its text', async () => {
        const result = await service.publishPack({
            repo: 'a/b',
            versions: [{ category: 'mods', version: '1.2.0' }],
            data: pack,
            description: ' Faster ',
            changelog: '- Added Sodium\n',
        });

        const request = bridge.github.publish.mock.calls[0][0];
        expect(request.message).toBe('Add mods 1.2.0 from TMods');
        const [mods] = request.versions;
        expect(mods).toMatchObject({ category: 'mods', version: '1.2.0' });
        expect(mods.files[1]).toEqual({
            name: 'bundle.json',
            data: '{\n  "description": "Faster",\n  "changelog": "- Added Sodium"\n}\n',
        });
        expect(result).toEqual({ commitUrl: 'c', actionsUrl: 'a' });
    });

    it('publishes several categories in one commit, each with only its own files', async () => {
        await service.publishPack({
            repo: 'a/b',
            versions: [
                { category: 'mods', version: '1.4.0' },
                { category: 'configs', version: '3' },
            ],
            data: pack,
        });

        expect(bridge.github.publish).toHaveBeenCalledTimes(1);
        const request = bridge.github.publish.mock.calls[0][0];
        expect(request.message).toBe('Add mods 1.4.0, configs 3 from TMods');
        const [mods, configs] = request.versions;
        expect(mods).toMatchObject({ category: 'mods', version: '1.4.0' });
        expect(contents(mods.files[0].data)).toEqual({ entries: ['modrinth.index.json'], links: ['mods/sodium.jar'] });
        expect(contents(configs.files[0].data)).toEqual({
            entries: ['modrinth.index.json', 'overrides/config/sodium.json'],
            links: [],
        });
    });

    it('adds a pack listing the category versions it installs, with the same text', async () => {
        await service.publishPack({
            repo: 'a/b',
            versions: [{ category: 'mods', version: '2.1.2' }],
            data: pack,
            changelog: 'New mods',
            pack: { version: '2.0.0', versions: { mods: '2.1.2', configs: '1.0.1' } },
        });

        const request = bridge.github.publish.mock.calls[0][0];
        expect(request.message).toBe('Add mods 2.1.2, pack 2.0.0 from TMods');
        expect(request.versions[1]).toEqual({
            category: 'packs',
            version: '2.0.0',
            files: [
                {
                    name: 'bundle.json',
                    data:
                        JSON.stringify(
                            { changelog: 'New mods', versions: { mods: '2.1.2', configs: '1.0.1' } },
                            null,
                            2,
                        ) + '\n',
                },
            ],
        });
    });

    it('publishes a pack on its own, but not an empty one', async () => {
        await service.publishPack({ repo: 'a/b', pack: { version: '3', versions: { mods: '2.1.1' } } });
        expect(bridge.github.publish).toHaveBeenLastCalledWith(
            expect.objectContaining({ message: 'Add pack 3 from TMods' }),
        );
        await expect(service.publishPack({ repo: 'a/b', pack: { version: '4', versions: {} } })).rejects.toThrow(
            'The pack lists no versions.',
        );
        expect(bridge.github.publish).toHaveBeenCalledTimes(1);
    });

    it('refuses a category the pack has nothing for, before publishing anything', async () => {
        await expect(
            service.publishPack({
                repo: 'a/b',
                versions: [
                    { category: 'mods', version: '1' },
                    { category: 'shaderpacks', version: '1' },
                ],
                data: pack,
            }),
        ).rejects.toThrow('The pack has nothing that goes in Shaderpacks.');
        expect(bridge.github.publish).not.toHaveBeenCalled();
    });

    it('knows which categories a pack has files for', () => {
        expect(service.categoryHasFiles('packs', ['mod'])).toBe(false);
        expect(service.categoryHasFiles('mods', ['mod', 'config'])).toBe(true);
        expect(service.categoryHasFiles('shaderpacks', ['mod', 'config'])).toBe(false);
        expect(service.categoryHasFiles('mods', [])).toBe(false);
    });

    it('refuses parts over the 100 MB GitHub takes', async () => {
        let isolated;
        jest.isolateModules(() => {
            jest.doMock('../mrpack', () => ({ filterMrpack: () => ({ length: 101 * 1024 * 1024 }) }));
            isolated = require('../bundlePublish');
        });
        jest.dontMock('../mrpack');
        const versions = [{ category: 'mods', version: '1' }];
        await expect(isolated.publishPack({ repo: 'a/b', versions, data: pack })).rejects.toThrow(
            /101 MB, and GitHub takes files up to 100 MB/,
        );
        expect(bridge.github.publish).not.toHaveBeenCalled();
    });

    it('offers every category the main process accepts but packs, then the server list', () => {
        const { CATEGORIES } = require('../../../../public/bundlePublisher');
        expect(service.PUBLISH_CATEGORIES.map(category => category.id)).toEqual([
            ...CATEGORIES.filter(id => id !== 'packs'),
            'servers',
        ]);
        expect(CATEGORIES).toContain('packs');
        expect(service.PUBLISH_CATEGORIES.filter(category => !service.isVersioned(category.id)).map(c => c.id)).toEqual(
            ['servers'],
        );
        expect(service.categoryHasFiles('servers', ['mod', 'servers'])).toBe(true);
        expect(service.categoryHasFiles('servers', ['mod'])).toBe(false);
    });

    it('publishes the server list with the versions, or on its own', async () => {
        const servers = [
            { name: 'Lobby', address: 'lobby.example.com', resourcePack: 'enabled', extra: [['icon', {}]] },
            { name: 'Mine', address: 'mine.example.com', resourcePack: 'prompt', extra: [] },
        ];
        const channel = [
            { name: 'Lobby', address: 'lobby.example.com', resourcePack: 'enabled' },
            { name: 'Mine', address: 'mine.example.com' },
        ];

        await service.publishPack({
            repo: 'a/b',
            versions: [{ category: 'mods', version: '2' }],
            data: pack,
            servers,
        });
        expect(bridge.github.publish).toHaveBeenLastCalledWith(
            expect.objectContaining({ servers: channel, message: 'Add mods 2, the server list from TMods' }),
        );

        await service.publishPack({ repo: 'a/b', servers });
        expect(bridge.github.publish).toHaveBeenLastCalledWith({
            repo: 'a/b',
            versions: [],
            servers: channel,
            message: 'Update the server list from TMods',
        });
    });

    it("reads the servers of a profile or of a pack's servers.dat", () => {
        const { serversDat } = require('../__fixtures__/serversDat');
        const data = serversDat([{ name: 'Lobby', ip: 'lobby.example.com' }]);
        const gameDir = path.join(home, 'game');
        fs.mkdirSync(gameDir);
        fs.writeFileSync(path.join(gameDir, 'servers.dat'), data);

        expect(service.serversOfProfile(gameDir).map(server => server.address)).toEqual(['lobby.example.com']);
        const packWith = {
            items: [
                { kind: 'mod', files: [] },
                { kind: 'servers', files: [{ path: 'servers.dat', data }] },
            ],
        };
        expect(service.serversOfPack(packWith).map(server => server.name)).toEqual(['Lobby']);
        expect(service.serversOfPack({ items: [] })).toEqual([]);
    });

    it("shows the main process's message without Electron's wrapping", async () => {
        bridge.github.publish.mockRejectedValue(
            new Error(
                "Error invoking remote method 'github:publish': Error: packs 1 is already in a/b. Pick a new version.",
            ),
        );
        const versions = [{ category: 'mods', version: '1' }];
        await expect(service.publishPack({ repo: 'a/b', versions, data: pack })).rejects.toThrow(
            /^packs 1 is already in a\/b. Pick a new version.$/,
        );
    });
});
