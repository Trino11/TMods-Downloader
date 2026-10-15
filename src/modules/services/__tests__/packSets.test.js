import { installBridge, removeBridge } from '../__fixtures__/bridge';

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('axios', () => ({ get: jest.fn() }));

let home;
let gameDir;
let packSets;
let installer;
let pins;
let mrpack;

const manifest = {
    versions: {
        mods: [
            { id: '2.1.1', url: 'https://x/mods-2.1.1.zip' },
            { id: '2.0.0', url: 'https://x/mods-2.0.0.zip' },
        ],
        configs: [{ id: '1.0.1', url: 'https://x/configs-1.0.1.zip' }],
    },
};

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-sets-'));
    gameDir = path.join(home, 'game');
    fs.mkdirSync(gameDir, { recursive: true });
    installBridge(home);
    jest.isolateModules(() => {
        jest.doMock('../bundleInstaller', () => ({ installBundle: jest.fn(), readInstalledVersion: jest.fn() }));
        packSets = require('../packSets');
        installer = require('../bundleInstaller');
        pins = require('../pins');
        mrpack = require('../mrpack');
    });
});

afterEach(() => {
    jest.dontMock('../bundleInstaller');
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

it("lists a set's parts in the sidebar's order, marking what the channel doesn't have", () => {
    const parts = packSets.packSetParts(manifest, {
        id: '3',
        versions: { configs: '1.0.1', mods: '2.1.1', shaderpacks: '9', capes: '1' },
    });
    expect(parts.map(part => [part.categoryId, part.versionId, part.version?.url ?? null])).toEqual([
        ['mods', '2.1.1', 'https://x/mods-2.1.1.zip'],
        ['configs', '1.0.1', 'https://x/configs-1.0.1.zip'],
        ['shaderpacks', '9', null],
        ['capes', '1', null],
    ]);
    expect(parts[3].category).toBeNull();
    expect(packSets.partFolders(parts)).toEqual(['mods', 'config', 'shaderpacks']);
});

it('installs every part like its own page, then records the pack and whether it is kept', async () => {
    const pack = { id: '3', versions: { mods: '2.1.1', configs: '1.0.1' } };
    const parts = packSets.packSetParts(manifest, pack);
    await packSets.installPackSet(pack, parts, gameDir, { replace: false, keepVersion: true });

    expect(
        installer.installBundle.mock.calls.map(([category, version, dir, options]) => [
            category.id,
            version.id,
            dir,
            options,
        ]),
    ).toEqual([
        ['mods', '2.1.1', gameDir, { replace: false }],
        ['configs', '1.0.1', gameDir, { replace: false }],
    ]);
    expect(mrpack.readInstalledPack(gameDir, '')).toBe('3');
    expect(mrpack.readInstalledPackVersions(gameDir)).toEqual(pack.versions);
    expect(['packs', 'mods', 'configs'].map(id => pins.isPinned(gameDir, id))).toEqual([true, true, true]);

    // Letting updates through again frees the pack and what it installed.
    packSets.setPackKept(gameDir, false);
    expect(['packs', 'mods', 'configs'].map(id => pins.isPinned(gameDir, id))).toEqual([false, false, false]);
});

it("refuses a set listing a version the channel doesn't have, before installing anything", async () => {
    const pack = { id: '3', versions: { mods: '2.1.1', configs: '7' } };
    await expect(packSets.installPackSet(pack, packSets.packSetParts(manifest, pack), gameDir)).rejects.toThrow(
        "Pack 3 can't be installed: your channel doesn't have Configs 7.",
    );
    expect(installer.installBundle).not.toHaveBeenCalled();
});

it('installs the rest when one part fails, and only then says the pack is not fully in', async () => {
    installer.installBundle.mockImplementation(async category => {
        if (category.id === 'mods') {
            throw new Error('Network Error');
        }
    });
    const pack = { id: '3', versions: { mods: '2.1.1', configs: '1.0.1' } };
    await expect(packSets.installPackSet(pack, packSets.packSetParts(manifest, pack), gameDir)).rejects.toThrow(
        'Pack 3 was only partly installed. These failed: Mods 2.1.1: Network Error.',
    );
    expect(installer.installBundle).toHaveBeenCalledTimes(2);
    expect(mrpack.readInstalledPack(gameDir, '')).toBeNull();
});
