import axios from 'axios';
import { makeVersion, required, serveModrinth } from '../__fixtures__/modrinthFake';
import { installBridge, removeBridge } from '../__fixtures__/bridge';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');

let home;
let minecraftDir;
let mrpack;
let profiles;
let mods;
let detectTarget;
let gameVersionOf;
const AdmZip = require('adm-zip');

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-mrpack-'));
    minecraftDir = path.join(home, 'AppData', 'Roaming', '.minecraft');
    fs.mkdirSync(minecraftDir, { recursive: true });
    localStorage.clear();
    installBridge(home);
    jest.isolateModules(() => {
        mrpack = require('../mrpack');
        profiles = require('../profiles');
        mods = require('../modrinthMods');
        ({ detectTarget, gameVersionOf } = require('../gameTarget'));
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

// Pretends a loader's installer ran, the way the launcher stores versions.
function installVersion(id, inheritsFrom) {
    const dir = path.join(minecraftDir, 'versions', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(inheritsFrom ? { id, inheritsFrom } : { id }));
}

const fabricApi = makeVersion('fabric-api', '0.100.0');
const sodium = makeVersion('sodium', '0.6.0', { deps: [required('fabric-api')] });
const serverOnly = makeVersion('server-thing', '1.0');

function serve() {
    serveModrinth(axios, {
        'fabric-api': { title: 'Fabric API', versions: [fabricApi] },
        sodium: { title: 'Sodium', versions: [sodium] },
    });
}

function fileEntry(version, extra = {}) {
    const file = version.files[0];
    return { path: `mods/${file.filename}`, hashes: file.hashes, downloads: [file.url], fileSize: file.size, ...extra };
}

function buildPack({ index = {}, files = {} } = {}) {
    const zip = new AdmZip();
    zip.addFile(
        'modrinth.index.json',
        Buffer.from(
            JSON.stringify({
                formatVersion: 1,
                game: 'minecraft',
                versionId: '1.0',
                name: 'Friends Pack',
                files: [
                    fileEntry(sodium),
                    fileEntry(fabricApi),
                    fileEntry(serverOnly, { env: { client: 'unsupported', server: 'required' } }),
                ],
                dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
                ...index,
            }),
        ),
    );
    for (const [name, content] of Object.entries(files)) {
        zip.addFile(name, Buffer.from(content));
    }
    return zip.toBuffer();
}

function profileFiles(profile, sub) {
    const dir = path.join(profiles.profileGameDir(profile), sub);
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

describe('detectTarget', () => {
    it.each([
        ['fabric-loader-0.16.5-1.21.1', '1.21.1', 'fabric', '0.16.5'],
        ['fabric-loader-0.16.5-1.21-pre1', '1.21-pre1', 'fabric', '0.16.5'],
        ['quilt-loader-0.26.4-1.21.1', '1.21.1', 'quilt', '0.26.4'],
        ['1.20.1-forge-47.2.0', '1.20.1', 'forge', '47.2.0'],
        ['neoforge-21.1.77', '1.21.1', 'neoforge', '21.1.77'],
    ])('reads %s', (id, gameVersion, loader, loaderVersion) => {
        installVersion(id, gameVersion);
        expect(detectTarget(id)).toEqual({ versionId: id, gameVersion, loader, loaderVersion });
    });

    it('returns null for vanilla, aliases and versions that are not installed', () => {
        installVersion('1.21.1');
        expect(detectTarget('1.21.1')).toBeNull();
        expect(detectTarget('latest-release')).toBeNull();
        expect(detectTarget('fabric-loader-0.1-1.20')).toBeNull();
        expect(detectTarget('')).toBeNull();
    });
});

describe('gameVersionOf', () => {
    it('reads the Minecraft version of loader, vanilla and other installed versions', () => {
        installVersion('fabric-loader-0.16.5-1.21.1', '1.21.1');
        installVersion('1.20.1-OptiFine_HD_U_I6', '1.20.1');
        expect(gameVersionOf('fabric-loader-0.16.5-1.21.1')).toBe('1.21.1');
        expect(gameVersionOf('1.20.1-OptiFine_HD_U_I6')).toBe('1.20.1');
        expect(gameVersionOf('1.19.4')).toBe('1.19.4');
        expect(gameVersionOf('')).toBeNull();
    });

    it('resolves the latest aliases from the cached version list, once there is one', () => {
        expect(gameVersionOf('latest-release')).toBeNull();
        localStorage.setItem(
            'tmods.versionManifest',
            JSON.stringify([
                { id: '25w01a', type: 'snapshot' },
                { id: '1.21.4', type: 'release' },
            ]),
        );
        expect(gameVersionOf('latest-release')).toBe('1.21.4');
        expect(gameVersionOf('latest-snapshot')).toBe('25w01a');
    });
});

describe('importMrpack', () => {
    it('creates a profile with the exact loader version, the client mods and the overrides', async () => {
        serve();
        installVersion('fabric-loader-0.16.5-1.21.1', '1.21.1');

        const { profile, loaderNote } = await mrpack.importMrpack(
            buildPack({
                files: {
                    'overrides/config/sodium.json': '{}',
                    'client-overrides/config/sodium.json': '{"client":true}',
                    'overrides/options.txt': 'fov:90',
                },
            }),
        );

        expect(profile).toMatchObject({ name: 'Friends Pack', gameVersion: 'fabric-loader-0.16.5-1.21.1' });
        expect(loaderNote).toBe('');
        expect(profileFiles(profile, 'mods')).toEqual(['fabric-api-0.100.0.jar', 'sodium-0.6.0.jar']);
        const dir = profiles.profileGameDir(profile);
        expect(fs.readFileSync(path.join(dir, 'config', 'sodium.json'), 'utf-8')).toBe('{"client":true}');
        expect(fs.readFileSync(path.join(dir, 'options.txt'), 'utf-8')).toBe('fov:90');
        // The pack's mods are tracked, so they can be updated and exported.
        expect(
            mods
                .readModList(dir)
                .mods.map(m => m.projectId)
                .sort(),
        ).toEqual(['fabric-api', 'sodium']);
        expect(profiles.listProfiles().map(p => p.name)).toContain('Friends Pack');
    });

    it("tracks the pack's resource packs and shaders too", async () => {
        const pack = makeVersion('faithful', '1.0', { ext: 'zip', loaders: ['minecraft'] });
        const shader = makeVersion('bsl', '8.2', { ext: 'zip', loaders: ['iris'] });
        serveModrinth(axios, {
            'fabric-api': { title: 'Fabric API', versions: [fabricApi] },
            sodium: { title: 'Sodium', versions: [sodium] },
            faithful: { title: 'Faithful', versions: [pack] },
            bsl: { title: 'BSL', versions: [shader] },
        });
        installVersion('fabric-loader-0.16.5-1.21.1', '1.21.1');
        const files = [
            fileEntry(sodium),
            fileEntry(fabricApi),
            { ...fileEntry(pack), path: 'resourcepacks/faithful-1.0.zip' },
            { ...fileEntry(shader), path: 'shaderpacks/bsl-8.2.zip' },
        ];

        const { profile } = await mrpack.importMrpack(buildPack({ index: { files } }));

        const tracked = mods.readModList(profiles.profileGameDir(profile)).mods;
        expect(tracked.map(m => [m.projectId, m.kind]).sort()).toEqual([
            ['bsl', 'shader'],
            ['fabric-api', 'mod'],
            ['faithful', 'resourcepack'],
            ['sodium', 'mod'],
        ]);
    });

    it('uses another installed version of the same loader and says so', async () => {
        serve();
        installVersion('fabric-loader-0.15.0-1.21.1', '1.21.1');

        const { profile, loaderNote } = await mrpack.importMrpack(buildPack());

        expect(profile.gameVersion).toBe('fabric-loader-0.15.0-1.21.1');
        expect(loaderNote).toContain('used the fabric version you already have');
    });

    it('falls back to the plain game version and asks for the loader when none is installed', async () => {
        serve();

        const { profile, loaderNote } = await mrpack.importMrpack(buildPack(), { name: 'Mine' });

        expect(profile).toMatchObject({ name: 'Mine', gameVersion: '1.21.1' });
        expect(loaderNote).toBe(
            'Install fabric 0.16.5 for Minecraft 1.21.1, then pick it for this profile in Profiles.',
        );
    });

    it.each([['../../evil.jar'], ['/etc/evil'], ['C:/Windows/evil.dll'], ['mods/../../evil.jar']])(
        'refuses the unsafe path %s before creating anything',
        async unsafe => {
            serve();
            const pack = buildPack({ index: { files: [fileEntry(sodium, { path: unsafe })] } });

            await expect(mrpack.importMrpack(pack)).rejects.toThrow('unsafe file path');
            expect(profiles.listProfiles()).toHaveLength(1);
        },
    );

    it('refuses unsafe paths in the overrides', async () => {
        serve();
        const zip = new AdmZip(buildPack());
        zip.addFile('overrides/x', Buffer.from('x'));
        zip.getEntry('overrides/x').entryName = 'overrides/../../evil.txt';

        await expect(mrpack.importMrpack(zip.toBuffer())).rejects.toThrow('unsafe file path');
        expect(profiles.listProfiles()).toHaveLength(1);
    });

    it('refuses downloads from sites outside the allowed list', async () => {
        serve();
        const pack = buildPack({
            index: { files: [fileEntry(sodium, { downloads: ['https://evil.example.com/sodium.jar'] })] },
        });

        await expect(mrpack.importMrpack(pack)).rejects.toThrow("site TMods doesn't trust");
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('rejects files that are not modpacks', async () => {
        await expect(mrpack.importMrpack(Buffer.from('nope'))).rejects.toThrow();
        const zip = new AdmZip();
        zip.addFile('readme.txt', Buffer.from('hi'));
        await expect(mrpack.importMrpack(zip.toBuffer())).rejects.toThrow('not a Modrinth modpack');
    });

    it('removes the new profile again when a download fails', async () => {
        serve();
        const broken = { ...fileEntry(sodium), hashes: { sha1: 'bad' } };
        const pack = buildPack({ index: { files: [broken] } });

        await expect(mrpack.importMrpack(pack)).rejects.toThrow('checksum');
        expect(profiles.listProfiles()).toHaveLength(1);
        expect(fs.readdirSync(path.join(minecraftDir, 'tmods_profiles'))).toEqual([]);
    });
});

describe('exportMrpack', () => {
    const target = {
        versionId: 'fabric-loader-0.16.5-1.21.1',
        gameVersion: '1.21.1',
        loader: 'fabric',
        loaderVersion: '0.16.5',
    };

    it('lists enabled Modrinth mods as downloads and copies hand-added jars and config', async () => {
        serve();
        const gameDir = path.join(home, 'game');
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        mods.setModEnabled(gameDir, 'fabric-api', false);
        fs.writeFileSync(path.join(gameDir, 'mods', 'mine.jar'), 'mine');
        fs.mkdirSync(path.join(gameDir, 'config'));
        fs.writeFileSync(path.join(gameDir, 'config', 'a.toml'), 'a=1');

        const result = mrpack.exportMrpack(gameDir, target, { name: 'Shared' });

        expect(result).toMatchObject({ mods: 1, extraFiles: ['mine.jar'] });
        const zip = new AdmZip(Buffer.from(result.data));
        const index = mrpack.readIndex(window.tmods.zip.read(result.data));
        expect(index).toMatchObject({
            name: 'Shared',
            dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
        });
        expect(index.files).toEqual([fileEntry(sodium)]);
        expect(zip.readAsText('overrides/mods/mine.jar')).toBe('mine');
        expect(zip.readAsText('overrides/config/a.toml')).toBe('a=1');
    });

    it('lists Modrinth resource packs and shaders under their folders', async () => {
        const pack = makeVersion('faithful', '1.0', { ext: 'zip', loaders: ['minecraft'] });
        serveModrinth(axios, { faithful: { title: 'Faithful', versions: [pack] } });
        const gameDir = path.join(home, 'game');
        await mods.installMod(gameDir, { loader: 'minecraft', gameVersion: '1.21.1' }, 'faithful', 'F', {
            kind: 'resourcepack',
        });

        const index = mrpack.readIndex(window.tmods.zip.read(mrpack.exportMrpack(gameDir, target, { name: 'P' }).data));

        expect(index.files.map(file => file.path)).toEqual(['resourcepacks/faithful-1.0.zip']);
    });

    it('can leave the config folder out', () => {
        const gameDir = path.join(home, 'game');
        fs.mkdirSync(path.join(gameDir, 'config'), { recursive: true });
        fs.writeFileSync(path.join(gameDir, 'config', 'a.toml'), 'a=1');

        const zip = new AdmZip(
            Buffer.from(mrpack.exportMrpack(gameDir, target, { name: 'x', includeConfig: false }).data),
        );

        expect(zip.getEntry('overrides/config/a.toml')).toBeNull();
    });

    it('needs a loader version', () => {
        expect(() => mrpack.exportMrpack(home, null, { name: 'x' })).toThrow('loader version');
    });

    it('round-trips: an exported pack imports into a new profile', async () => {
        serve();
        installVersion(target.versionId, '1.21.1');
        const gameDir = path.join(home, 'game');
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        const { data } = mrpack.exportMrpack(gameDir, target, { name: 'Round trip' });
        const { profile } = await mrpack.importMrpack(data);

        expect(profile.gameVersion).toBe(target.versionId);
        expect(profileFiles(profile, 'mods')).toEqual(['fabric-api-0.100.0.jar', 'sodium-0.6.0.jar']);
    });
});

describe('installModrinthModpack', () => {
    it('downloads the newest modpack file and imports it', async () => {
        const packData = buildPack();
        const packVersion = makeVersion('friends-pack', '2.0', { content: packData });
        packVersion.files[0].filename = 'friends-2.0.mrpack';
        serveModrinth(axios, {
            'fabric-api': { title: 'Fabric API', versions: [fabricApi] },
            sodium: { title: 'Sodium', versions: [sodium] },
            'friends-pack': { title: 'Friends Pack', versions: [packVersion] },
        });

        const { profile } = await mrpack.installModrinthModpack('friends-pack', 'Friends Pack');

        expect(profileFiles(profile, 'mods')).toEqual(['fabric-api-0.100.0.jar', 'sodium-0.6.0.jar']);
    });
});
