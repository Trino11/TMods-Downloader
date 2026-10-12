import axios from 'axios';
import { makeVersion, serveModrinth } from '../__fixtures__/modrinthFake';
import { installBridge, removeBridge } from '../__fixtures__/bridge';
import { formatSize, itemOf } from '../packKinds';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');

let home;
let gameDir;
let scan;
let mods;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-scan-'));
    gameDir = path.join(home, 'game');
    fs.mkdirSync(gameDir);
    installBridge(home);
    jest.isolateModules(() => {
        scan = require('../packScan');
        mods = require('../modrinthMods');
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

function write(relative, content) {
    const file = path.join(gameDir, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

const sodium = makeVersion('sodium', '0.6.0');
const faithful = makeVersion('faithful', '1.0', { ext: 'zip', loaders: ['minecraft'] });

describe('itemOf', () => {
    it.each([
        ['mods/sodium.jar', 'mod', 'mods/sodium.jar'],
        ['resourcepacks/Mine/assets/x.png', 'resourcepack', 'resourcepacks/Mine'],
        ['shaderpacks/BSL.zip.txt', 'shader', 'shaderpacks/BSL.zip.txt'],
        ['config/xaero/map.txt', 'config', 'config/xaero'],
        ['defaultconfigs/a.toml', 'config', 'defaultconfigs/a.toml'],
        ['schematics/house.litematic', 'schematic', 'schematics/house.litematic'],
        ['options.txt', 'settings', 'options.txt'],
        ['servers.dat', 'servers', 'servers.dat'],
        ['kubejs/scripts/a.js', 'other', 'kubejs/scripts'],
        ['readme.txt', 'other', 'readme.txt'],
    ])('puts %s under %s', (relative, kind, item) => {
        expect(itemOf(relative)).toEqual({ kind, item });
    });
});

describe('scanProfile', () => {
    it('lists every kind, links what Modrinth knows and picks the usual things', async () => {
        serveModrinth(axios, {
            sodium: { title: 'Sodium', versions: [sodium] },
            faithful: { title: 'Faithful', versions: [faithful] },
        });
        await mods.installMod(gameDir, { loader: 'fabric', gameVersion: '1.21.1' }, 'sodium', 'Sodium');
        write('mods/mine.jar', 'mine');
        write('mods/old.jar.disabled', 'old');
        write('resourcepacks/Mine/pack.mcmeta', '{}');
        write('resourcepacks/Mine/assets/x.png', 'png');
        write('config/a.toml', 'a=1');
        write('schematics/house.litematic', 'house');
        write('options.txt', 'fov:90');
        write('saves/World/level.dat', 'world');
        write('logs/latest.log', 'log');

        const items = scan.scanProfile(gameDir);

        expect(items.map(item => [item.id, item.kind, Boolean(item.link), item.ticked])).toEqual([
            ['mods/mine.jar', 'mod', false, true],
            ['mods/old.jar.disabled', 'mod', false, false],
            ['mods/sodium-0.6.0.jar', 'mod', true, true],
            ['resourcepacks/Mine', 'resourcepack', false, true],
            ['config/a.toml', 'config', false, true],
            ['schematics/house.litematic', 'schematic', false, false],
            ['options.txt', 'settings', false, false],
        ]);
        const sodiumItem = items.find(item => item.id === 'mods/sodium-0.6.0.jar');
        expect(sodiumItem).toMatchObject({
            title: 'Sodium',
            link: { url: sodium.files[0].url, hashes: sodium.files[0].hashes },
        });
        expect(items.find(item => item.id === 'resourcepacks/Mine')).toMatchObject({ size: 5, enabled: true });
    });

    it('is empty for a new folder', () => {
        expect(scan.scanProfile(gameDir)).toEqual([]);
    });

    it('recognises hand-added files on Modrinth so they go in as links', async () => {
        serveModrinth(axios, { faithful: { title: 'Faithful', versions: [faithful] } });
        write('resourcepacks/faithful.zip', faithful.data);

        expect(await scan.recogniseFiles(gameDir)).toBe(1);
        expect(scan.scanProfile(gameDir)[0]).toMatchObject({ title: 'Faithful', link: expect.any(Object) });
    });

    it('recognises nothing, quietly, when Modrinth is out of reach', async () => {
        axios.post.mockRejectedValue(new Error('offline'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        write('mods/mine.jar', 'mine');

        expect(await scan.recogniseFiles(gameDir)).toBe(0);
    });
});

describe('formatSize', () => {
    it.each([
        [512, '512 B'],
        [2048, '2.0 KB'],
        [5 * 1024 * 1024, '5.0 MB'],
    ])('shows %p as %p', (bytes, text) => {
        expect(formatSize(bytes)).toBe(text);
    });
});
