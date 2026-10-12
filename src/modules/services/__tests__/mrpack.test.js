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
let scan;
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
        scan = require('../packScan');
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
        expect(loaderNote).toContain('used the Fabric version you already have');
    });

    it('falls back to the plain game version and asks for the loader when none is installed', async () => {
        serve();

        const { profile, loaderNote } = await mrpack.importMrpack(buildPack(), { name: 'Mine' });

        expect(profile).toMatchObject({ name: 'Mine', gameVersion: '1.21.1' });
        expect(loaderNote).toBe(
            'Install Fabric 0.16.5 for Minecraft 1.21.1, then pick it for this profile in Profiles.',
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

describe('readPack', () => {
    it("lists the pack's items by kind without writing anything, leaving out server-only files", () => {
        const pack = mrpack.readPack(
            buildPack({
                index: { summary: ' Fast ' },
                files: {
                    'overrides/config/sodium.json': '{}',
                    'overrides/config/xaero/map.txt': 'map',
                    'client-overrides/options.txt': 'fov:90',
                    'overrides/resourcepacks/Mine/pack.mcmeta': '{}',
                    'overrides/notes/readme.txt': 'hi',
                },
            }),
        );

        expect(pack).toMatchObject({
            name: 'Friends Pack',
            version: '1.0',
            summary: 'Fast',
            gameVersion: '1.21.1',
            loader: { loader: 'fabric', loaderVersion: '0.16.5' },
        });
        expect(pack.items.map(item => [item.kind, item.id, item.link])).toEqual([
            ['mod', 'mods/fabric-api-0.100.0.jar', true],
            ['mod', 'mods/sodium-0.6.0.jar', true],
            ['resourcepack', 'resourcepacks/Mine', false],
            ['config', 'config/sodium.json', false],
            ['config', 'config/xaero', false],
            ['settings', 'options.txt', false],
            ['other', 'notes/readme.txt', false],
        ]);
        expect(axios.get).not.toHaveBeenCalled();
        expect(profiles.listProfiles()).toHaveLength(1);
    });

    it("refuses files in TMods' own folder", () => {
        expect(() => mrpack.readPack(buildPack({ files: { 'overrides/.tmods_loader/modrinth.json': '{}' } }))).toThrow(
            "TMods' own folder",
        );
    });
});

describe('importMrpack into a new profile', () => {
    it('installs only the picked items', async () => {
        serve();
        const { profile } = await mrpack.importMrpack(
            buildPack({ files: { 'overrides/config/a.txt': 'a', 'overrides/options.txt': 'fov:90' } }),
            { items: ['mods/sodium-0.6.0.jar', 'config/a.txt'] },
        );

        const dir = profiles.profileGameDir(profile);
        expect(profileFiles(profile, 'mods')).toEqual(['sodium-0.6.0.jar']);
        expect(fs.existsSync(path.join(dir, 'config', 'a.txt'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'options.txt'))).toBe(false);
    });

    it('remembers the channel pack version in the new profile', async () => {
        serve();
        const { profile } = await mrpack.importMrpack(buildPack(), { channelVersion: '2.0.0' });
        expect(mrpack.readInstalledPack(profiles.profileGameDir(profile))).toBe('2.0.0');
    });

    it('makes the new profile follow the manifest the channel pack came from', async () => {
        const urls = ['https://a.example.com/m.json', 'https://b.example.com/m.json'];
        localStorage.setItem(
            'tmods.manifests',
            JSON.stringify(urls.map((url, n) => ({ id: `manifest-${n + 1}`, name: url, url }))),
        );
        localStorage.setItem('tmods.defaultProfileManifest', 'manifest-2');
        serve();
        const { profile } = await mrpack.importMrpack(buildPack(), { channelVersion: '2.0.0' });

        const saved = profiles.listProfiles().find(item => item.id === profile.id);
        expect(saved.manifestId).toBe('manifest-2');
        const dir = profiles.profileGameDir(profile);
        expect(mrpack.readInstalledPack(dir, urls[1])).toBe('2.0.0');
        expect(mrpack.readInstalledPack(dir, urls[0])).toBeNull();
    });
});

describe('importMrpack into an existing profile', () => {
    const oldSodium = makeVersion('sodium', '0.5.0');
    let profile;
    let gameDir;

    beforeEach(async () => {
        serveModrinth(axios, {
            'fabric-api': { title: 'Fabric API', versions: [fabricApi] },
            sodium: { title: 'Sodium', versions: [sodium, oldSodium] },
        });
        installVersion('fabric-loader-0.16.5-1.21.1', '1.21.1');
        profile = profiles.createProfile({ name: 'Survival', gameVersion: 'fabric-loader-0.16.5-1.21.1' });
        gameDir = profiles.profileGameDir(profile);
        // The player has an older Sodium (added by hand), their own mod and a config.
        fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
        fs.writeFileSync(path.join(gameDir, 'mods', 'sodium-old.jar'), oldSodium.data);
        fs.writeFileSync(path.join(gameDir, 'mods', 'mine.jar'), 'mine');
        fs.mkdirSync(path.join(gameDir, 'config'));
        fs.writeFileSync(path.join(gameDir, 'config', 'sodium.json'), 'mine');
    });

    it('replaces other versions of the same mods, keeps the rest and backs up first', async () => {
        const pack = buildPack({ files: { 'overrides/config/sodium.json': 'pack' } });

        const result = await mrpack.importMrpack(pack, { into: profile.id });

        expect(result).toMatchObject({ profile: { id: profile.id }, replaced: ['Sodium'] });
        expect(profileFiles(profile, 'mods')).toEqual(['fabric-api-0.100.0.jar', 'mine.jar', 'sodium-0.6.0.jar']);
        expect(fs.readFileSync(path.join(gameDir, 'config', 'sodium.json'), 'utf-8')).toBe('pack');
        expect(
            mods
                .readModList(gameDir)
                .mods.map(mod => `${mod.projectId}@${mod.versionId}`)
                .sort(),
        ).toEqual(['fabric-api@0.100.0', 'sodium@0.6.0']);
        expect(mrpack.listPackBackups(gameDir)).toEqual([
            { id: result.backupId, createdAt: expect.any(String), pack: 'Friends Pack' },
        ]);
        expect(profiles.listProfiles()).toHaveLength(2);
    });

    it('can be undone from its backup', async () => {
        const { backupId } = await mrpack.importMrpack(
            buildPack({ files: { 'overrides/config/sodium.json': 'pack', 'overrides/options.txt': 'fov:90' } }),
            { into: profile.id },
        );

        mrpack.restorePackBackup(gameDir, backupId);

        expect(profileFiles(profile, 'mods')).toEqual(['mine.jar', 'sodium-old.jar']);
        expect(fs.readFileSync(path.join(gameDir, 'config', 'sodium.json'), 'utf-8')).toBe('mine');
        expect(fs.existsSync(path.join(gameDir, 'options.txt'))).toBe(false);
        expect(mrpack.listPackBackups(gameDir)).toEqual([]);
    });

    it('remembers which channel pack version the profile has, and undo puts the old one back', async () => {
        const empty = () => buildPack({ index: { files: [] }, files: { 'overrides/a.txt': 'a' } });
        expect(mrpack.readInstalledPack(gameDir)).toBeNull();

        await mrpack.importMrpack(empty(), { into: profile.id, channelVersion: '1.0.0' });
        expect(mrpack.readInstalledPack(gameDir)).toBe('1.0.0');
        const { backupId } = await mrpack.importMrpack(empty(), { into: profile.id, channelVersion: '1.1.0' });
        expect(mrpack.readInstalledPack(gameDir)).toBe('1.1.0');

        // A pack from a file isn't the channel's, so it leaves the record alone.
        await mrpack.importMrpack(empty(), { into: profile.id });
        expect(mrpack.readInstalledPack(gameDir)).toBe('1.1.0');

        mrpack.restorePackBackup(gameDir, mrpack.listPackBackups(gameDir)[0].id);
        mrpack.restorePackBackup(gameDir, backupId);
        expect(mrpack.readInstalledPack(gameDir)).toBe('1.0.0');
    });

    it('changes nothing when a download fails', async () => {
        const broken = { ...fileEntry(sodium), hashes: { sha1: 'bad' } };

        await expect(
            mrpack.importMrpack(buildPack({ index: { files: [broken] } }), { into: profile.id }),
        ).rejects.toThrow('checksum');

        expect(profileFiles(profile, 'mods')).toEqual(['mine.jar', 'sodium-old.jar']);
        expect(mrpack.listPackBackups(gameDir)).toEqual([]);
        expect(fs.existsSync(path.join(gameDir, '.tmods_loader', 'pack-import'))).toBe(false);
    });

    it('still installs, replacing only same-named files, when Modrinth lookups fail', async () => {
        axios.post.mockRejectedValue(new Error('offline'));
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const { replaced } = await mrpack.importMrpack(buildPack(), { into: profile.id });

        expect(replaced).toEqual([]);
        expect(profileFiles(profile, 'mods')).toEqual([
            'fabric-api-0.100.0.jar',
            'mine.jar',
            'sodium-0.6.0.jar',
            'sodium-old.jar',
        ]);
    });

    it('keeps the last five backups', async () => {
        for (let i = 0; i < 6; i++) {
            await mrpack.importMrpack(buildPack({ index: { files: [] }, files: { 'overrides/a.txt': `${i}` } }), {
                into: profile.id,
            });
        }
        expect(mrpack.listPackBackups(gameDir)).toHaveLength(5);
    });

    it('says when the pack is for another game version or loader', () => {
        const pack = mrpack.readPack(buildPack({ index: { dependencies: { minecraft: '1.20.1', forge: '47.2.0' } } }));
        expect(mrpack.packWarnings(pack, profile)).toEqual([
            'The pack is for Minecraft 1.20.1, but Survival plays 1.21.1.',
            'The pack needs Forge, but Survival uses Fabric.',
        ]);
        expect(mrpack.packWarnings(mrpack.readPack(buildPack()), profile)).toEqual([]);
    });
});

describe('exportMrpack', () => {
    const target = {
        versionId: 'fabric-loader-0.16.5-1.21.1',
        gameVersion: '1.21.1',
        loader: 'fabric',
        loaderVersion: '0.16.5',
    };

    function exported(gameDir, ids, options = {}) {
        const items = scan.scanProfile(gameDir).filter(item => (ids ? ids.includes(item.id) : item.ticked));
        const chosen = 'target' in options ? options.target : target;
        return mrpack.exportMrpack(gameDir, chosen, { name: 'Shared', items });
    }

    it('lists picked Modrinth files as downloads and copies everything else into overrides', async () => {
        serve();
        const gameDir = path.join(home, 'game');
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        mods.setModEnabled(gameDir, 'fabric-api', false);
        fs.writeFileSync(path.join(gameDir, 'mods', 'mine.jar'), 'mine');
        fs.mkdirSync(path.join(gameDir, 'config', 'xaero'), { recursive: true });
        fs.writeFileSync(path.join(gameDir, 'config', 'a.toml'), 'a=1');
        fs.writeFileSync(path.join(gameDir, 'config', 'xaero', 'map.txt'), 'map');
        fs.mkdirSync(path.join(gameDir, 'shaderpacks'));
        fs.writeFileSync(path.join(gameDir, 'shaderpacks', 'Mine.zip'), 'shader');
        fs.writeFileSync(path.join(gameDir, 'shaderpacks', 'Mine.zip.txt'), 'shadow=on');
        fs.writeFileSync(path.join(gameDir, 'options.txt'), 'fov:90');

        const result = exported(gameDir, [
            'mods/sodium-0.6.0.jar',
            'mods/mine.jar',
            'config/a.toml',
            'config/xaero',
            'shaderpacks/Mine.zip',
            'shaderpacks/Mine.zip.txt',
            'options.txt',
        ]);

        expect(result).toMatchObject({ links: 1, copies: 6 });
        const zip = new AdmZip(Buffer.from(result.data));
        const index = mrpack.readIndex(window.tmods.zip.read(result.data));
        expect(index).toMatchObject({
            name: 'Shared',
            versionId: '1.0.0',
            dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
        });
        expect(index.files).toEqual([fileEntry(sodium)]);
        expect(zip.readAsText('overrides/mods/mine.jar')).toBe('mine');
        expect(zip.readAsText('overrides/config/a.toml')).toBe('a=1');
        expect(zip.readAsText('overrides/config/xaero/map.txt')).toBe('map');
        expect(zip.readAsText('overrides/shaderpacks/Mine.zip')).toBe('shader');
        expect(zip.readAsText('overrides/shaderpacks/Mine.zip.txt')).toBe('shadow=on');
        expect(zip.readAsText('overrides/options.txt')).toBe('fov:90');
        expect(zip.getEntry('overrides/mods/fabric-api-0.100.0.jar.disabled')).toBeNull();
    });

    it('lists Modrinth resource packs and shaders under their folders', async () => {
        const pack = makeVersion('faithful', '1.0', { ext: 'zip', loaders: ['minecraft'] });
        serveModrinth(axios, { faithful: { title: 'Faithful', versions: [pack] } });
        const gameDir = path.join(home, 'game');
        await mods.installMod(gameDir, { loader: 'minecraft', gameVersion: '1.21.1' }, 'faithful', 'F', {
            kind: 'resourcepack',
        });

        const index = mrpack.readIndex(window.tmods.zip.read(exported(gameDir).data));

        expect(index.files.map(file => file.path)).toEqual(['resourcepacks/faithful-1.0.zip']);
    });

    it('exports packs and settings without a mod loader, but not mods', () => {
        const gameDir = path.join(home, 'game');
        fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
        fs.writeFileSync(path.join(gameDir, 'mods', 'mine.jar'), 'mine');
        fs.writeFileSync(path.join(gameDir, 'options.txt'), 'fov:90');
        const vanilla = { gameVersion: '1.21.1' };

        const index = mrpack.readIndex(
            window.tmods.zip.read(exported(gameDir, ['options.txt'], { target: vanilla }).data),
        );
        expect(index.dependencies).toEqual({ minecraft: '1.21.1' });
        expect(() => exported(gameDir, ['mods/mine.jar'], { target: vanilla })).toThrow('loader version');
        expect(() => exported(gameDir, ['options.txt'], { target: null })).toThrow('which Minecraft version');
    });

    it('round-trips: an exported pack imports into a new profile', async () => {
        serve();
        installVersion(target.versionId, '1.21.1');
        const gameDir = path.join(home, 'game');
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        fs.mkdirSync(path.join(gameDir, 'schematics'));
        fs.writeFileSync(path.join(gameDir, 'schematics', 'house.litematic'), 'house');

        const { data } = exported(gameDir, [
            'mods/sodium-0.6.0.jar',
            'mods/fabric-api-0.100.0.jar',
            'schematics/house.litematic',
        ]);
        const { profile } = await mrpack.importMrpack(data);

        expect(profile.gameVersion).toBe(target.versionId);
        expect(profileFiles(profile, 'mods')).toEqual(['fabric-api-0.100.0.jar', 'sodium-0.6.0.jar']);
        expect(profileFiles(profile, 'schematics')).toEqual(['house.litematic']);
    });
});

describe('downloading packs', () => {
    it('downloads the newest modpack file from Modrinth', async () => {
        const packData = buildPack();
        const packVersion = makeVersion('friends-pack', '2.0', { content: packData });
        serveModrinth(axios, { 'friends-pack': { title: 'Friends Pack', versions: [packVersion] } });

        const data = await mrpack.downloadModrinthModpack('friends-pack', 'Friends Pack');

        expect(Buffer.compare(Buffer.from(data), packData)).toBe(0);
    });

    it("downloads a pack from the channel and checks the manifest's checksum", async () => {
        const packData = buildPack();
        const url = 'https://github.com/a/b/releases/download/x/packs-1.0.0.mrpack';
        serveModrinth(axios, {}, { [url]: packData });
        const sha256 = require('crypto').createHash('sha256').update(packData).digest('hex');

        const data = await mrpack.downloadPublishedPack({ id: '1.0.0', url, sha256 });
        expect(Buffer.compare(Buffer.from(data), packData)).toBe(0);
        await expect(mrpack.downloadPublishedPack({ id: '1.0.0', url, sha256: 'f'.repeat(64) })).rejects.toThrow(
            'corrupt',
        );
    });
});

describe('profileTarget', () => {
    it('reads the profile version, or the one picked for the default profile', () => {
        installVersion('fabric-loader-0.16.5-1.21.1', '1.21.1');
        const profile = profiles.createProfile({ name: 'P', gameVersion: 'fabric-loader-0.16.5-1.21.1' });
        expect(mrpack.profileTarget(profile)).toMatchObject({ gameVersion: '1.21.1', target: { loader: 'fabric' } });

        const fallback = profiles.listProfiles().find(item => item.id === profiles.DEFAULT_PROFILE_ID);
        expect(mrpack.profileTarget(fallback)).toEqual({ versionId: '', target: null, gameVersion: '' });
        mods.setTargetVersion(profiles.profileGameDir(fallback), '1.20.1');
        expect(mrpack.profileTarget(fallback)).toEqual({ versionId: '1.20.1', target: null, gameVersion: '1.20.1' });
    });
});

describe('filterMrpack', () => {
    const files = {
        'overrides/config/sodium.json': '{}',
        'overrides/shaderpacks/BSL.zip': 'shader',
        'client-overrides/options.txt': 'fov:90',
    };

    it('keeps only the links and overrides of the given kinds', () => {
        const part = mrpack.filterMrpack(buildPack({ files }), ['config', 'shader']);
        const zip = new AdmZip(Buffer.from(part));
        expect(zip.getEntries().map(entry => entry.entryName)).toEqual([
            'modrinth.index.json',
            'overrides/config/sodium.json',
            'overrides/shaderpacks/BSL.zip',
        ]);
        const index = JSON.parse(zip.readAsText('modrinth.index.json'));
        expect(index.files).toEqual([]);
        expect(index.dependencies).toEqual({ minecraft: '1.21.1', 'fabric-loader': '0.16.5' });
    });

    it('keeps mod links, server-only ones included, for mods', () => {
        const part = mrpack.filterMrpack(buildPack({ files }), ['mod']);
        const index = JSON.parse(new AdmZip(Buffer.from(part)).readAsText('modrinth.index.json'));
        expect(index.files.map(file => file.path)).toEqual([
            fileEntry(sodium).path,
            fileEntry(fabricApi).path,
            fileEntry(serverOnly).path,
        ]);
        expect(mrpack.readPack(part).items.map(item => item.kind)).toEqual(['mod', 'mod']);
    });

    it('is null when the pack has nothing of those kinds', () => {
        expect(mrpack.filterMrpack(buildPack({ files }), ['schematic'])).toBeNull();
    });
});
