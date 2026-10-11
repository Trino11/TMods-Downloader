import axios from 'axios';

jest.mock('axios', () => ({ get: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');

// Fabric writes into ~/AppData/Roaming/.minecraft through Electron's window.require,
// so point the home folder at a temp dir and load a fresh copy per test.
let home;
let versionsDir;
let fabric;

const profileJson = {
    id: 'fabric-loader-0.16.5-1.21.1',
    inheritsFrom: '1.21.1',
    mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.5', url: 'https://maven.fabricmc.net/' }],
};

function serve(routes) {
    axios.get.mockImplementation(async url => {
        const route = url.replace('https://meta.fabricmc.net/v2', '');
        if (!(route in routes)) {
            throw new Error(`unexpected ${url}`);
        }
        return { data: routes[route] };
    });
}

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-fabric-'));
    versionsDir = path.join(home, 'AppData', 'Roaming', '.minecraft', 'versions');
    window.require = name => (name === 'os' ? { ...os, homedir: () => home, platform: () => 'win32' } : require(name));
    jest.isolateModules(() => {
        fabric = require('../fabric');
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    delete window.require;
});

it('lists stable Minecraft versions unless snapshots are asked for', async () => {
    serve({
        '/versions/game': [
            { version: '1.21.2-pre1', stable: false },
            { version: '1.21.1', stable: true },
        ],
    });

    expect(await fabric.listFabricGameVersions()).toEqual(['1.21.1']);
    expect(await fabric.listFabricGameVersions({ snapshots: true })).toEqual(['1.21.2-pre1', '1.21.1']);
});

it('picks the newest stable loader', async () => {
    serve({
        '/versions/loader/1.21.1': [
            { loader: { version: '0.17.0-beta.1', stable: false } },
            { loader: { version: '0.16.5', stable: true } },
            { loader: { version: '0.16.4', stable: true } },
        ],
    });

    expect(await fabric.latestLoaderVersion('1.21.1')).toBe('0.16.5');
});

it('fails clearly when a version has no stable loader', async () => {
    serve({ '/versions/loader/1.0': [] });

    await expect(fabric.latestLoaderVersion('1.0')).rejects.toThrow('no stable loader for Minecraft 1.0');
});

it("writes the launcher version json the way Fabric's installer does", async () => {
    serve({
        '/versions/loader/1.21.1': [{ loader: { version: '0.16.5', stable: true } }],
        '/versions/loader/1.21.1/0.16.5/profile/json': profileJson,
    });
    const dir = path.join(versionsDir, 'fabric-loader-0.16.5-1.21.1');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'fabric-loader-0.16.5-1.21.1.jar'), 'stale');

    const id = await fabric.installFabric('1.21.1');

    expect(id).toBe('fabric-loader-0.16.5-1.21.1');
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf-8'))).toEqual(profileJson);
    expect(fs.existsSync(path.join(dir, `${id}.jar`))).toBe(false);
});

it('installs a given loader version without looking up the latest', async () => {
    serve({ '/versions/loader/1.21.1/0.16.4/profile/json': { ...profileJson, id: 'whatever' } });

    const id = await fabric.installFabric('1.21.1', { loaderVersion: '0.16.4' });

    expect(id).toBe('fabric-loader-0.16.4-1.21.1');
    const written = JSON.parse(fs.readFileSync(path.join(versionsDir, id, `${id}.json`), 'utf-8'));
    expect(written.id).toBe(id);
});

it('refuses versions that would escape the versions folder', async () => {
    await expect(fabric.installFabric('../1.21.1', { loaderVersion: '0.16.5' })).rejects.toThrow(
        'Invalid Minecraft version',
    );
    await expect(fabric.installFabric('1.21.1', { loaderVersion: '..\\x' })).rejects.toThrow(
        'Invalid Fabric loader version',
    );
    expect(axios.get).not.toHaveBeenCalled();
});

it('rejects a profile that is not for the asked version and writes nothing', async () => {
    serve({ '/versions/loader/1.21.1/0.16.5/profile/json': { ...profileJson, inheritsFrom: '1.20.1' } });

    await expect(fabric.installFabric('1.21.1', { loaderVersion: '0.16.5' })).rejects.toThrow(
        'unexpected launcher profile',
    );
    expect(fs.existsSync(versionsDir)).toBe(false);
});

it('is recognised as Fabric by the Modrinth page', async () => {
    serve({ '/versions/loader/1.21.1/0.16.5/profile/json': profileJson });
    const id = await fabric.installFabric('1.21.1', { loaderVersion: '0.16.5' });

    let gameTarget;
    jest.isolateModules(() => {
        gameTarget = require('../gameTarget');
    });
    expect(gameTarget.detectTarget(id)).toEqual({
        versionId: id,
        gameVersion: '1.21.1',
        loader: 'fabric',
        loaderVersion: '0.16.5',
    });
});
