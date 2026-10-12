// The default game folder comes from the installer, which imports axios.
jest.mock('axios', () => ({ get: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { installBridge, removeBridge } = require('../__fixtures__/bridge');

// Profiles reach Node through the main-process bridge and use ~/AppData/Roaming/.minecraft,
// so point the home folder at a temp dir and load a fresh copy per test.
let home;
let minecraftDir;
let profiles;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-profiles-'));
    minecraftDir = path.join(home, 'AppData', 'Roaming', '.minecraft');
    localStorage.clear();

    installBridge(home);
    jest.isolateModules(() => {
        profiles = require('../profiles');
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

function writeLauncherFile(data, name = 'launcher_profiles.json') {
    fs.mkdirSync(minecraftDir, { recursive: true });
    fs.writeFileSync(path.join(minecraftDir, name), JSON.stringify(data));
}

function readLauncherFile(name = 'launcher_profiles.json') {
    return JSON.parse(fs.readFileSync(path.join(minecraftDir, name), 'utf-8'));
}

function installVersion(id) {
    const dir = path.join(minecraftDir, 'versions', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), '{}');
}

describe('default profile', () => {
    it('is active out of the box and installs into .minecraft', () => {
        expect(profiles.listProfiles().map(p => p.id)).toEqual(['default']);
        expect(profiles.getActiveProfile().id).toBe('default');
        expect(profiles.activeGameDir()).toBe(minecraftDir);
    });

    it('cannot be edited or deleted', () => {
        expect(() => profiles.updateProfile('default', { name: 'x' })).toThrow('cannot be changed');
        expect(() => profiles.deleteProfile('default')).toThrow('cannot be deleted');
    });

    it('falls back when the saved active profile no longer exists', () => {
        profiles.setActiveProfile('gone');
        expect(profiles.getActiveProfile().id).toBe('default');
    });
});

describe('createProfile', () => {
    it('creates its game folder and a launcher entry pointing at it', () => {
        writeLauncherFile({ profiles: { mine: { name: 'Mine', type: 'custom' } }, settings: { keep: true } });

        const profile = profiles.createProfile({ name: 'Fabric 1.21!', gameVersion: '1.21' });

        expect(profile.id).toBe('fabric-1-21');
        const gameDir = path.join(minecraftDir, 'tmods_profiles', 'fabric-1-21');
        expect(fs.existsSync(gameDir)).toBe(true);
        const data = readLauncherFile();
        expect(data.settings).toEqual({ keep: true });
        expect(data.profiles.mine).toEqual({ name: 'Mine', type: 'custom' });
        expect(data.profiles['tmods-fabric-1-21']).toMatchObject({
            name: 'Fabric 1.21!',
            type: 'custom',
            lastVersionId: '1.21',
            gameDir,
        });
    });

    it('gives profiles with the same name different ids', () => {
        const a = profiles.createProfile({ name: 'Pack' });
        const b = profiles.createProfile({ name: 'Pack' });
        expect([a.id, b.id]).toEqual(['pack', 'pack-2']);
    });

    it('never reuses the default id', () => {
        expect(profiles.createProfile({ name: 'Default' }).id).toBe('default-2');
    });

    it('defaults to the latest release and requires a name', () => {
        expect(profiles.createProfile({ name: 'A' }).gameVersion).toBe('latest-release');
        expect(() => profiles.createProfile({ name: '   ' })).toThrow('Give the profile a name');
    });

    it('creates the launcher file when the launcher never ran', () => {
        profiles.createProfile({ name: 'First' });
        expect(Object.keys(readLauncherFile().profiles)).toEqual(['tmods-first']);
    });

    it('also writes the Microsoft Store launcher file when it exists', () => {
        writeLauncherFile({ profiles: {} });
        writeLauncherFile({ profiles: {} }, 'launcher_profiles_microsoft_store.json');

        profiles.createProfile({ name: 'Both' });

        expect(readLauncherFile().profiles['tmods-both']).toBeDefined();
        expect(readLauncherFile('launcher_profiles_microsoft_store.json').profiles['tmods-both']).toBeDefined();
    });

    it('refuses to touch a launcher file it cannot parse', () => {
        fs.mkdirSync(minecraftDir, { recursive: true });
        fs.writeFileSync(path.join(minecraftDir, 'launcher_profiles.json'), '{ broken');

        expect(() => profiles.createProfile({ name: 'X' })).toThrow('Could not read launcher_profiles.json');
        expect(fs.readFileSync(path.join(minecraftDir, 'launcher_profiles.json'), 'utf-8')).toBe('{ broken');
    });
});

describe('active profile', () => {
    it('switches where installs go', () => {
        const profile = profiles.createProfile({ name: 'Modded' });
        profiles.setActiveProfile(profile.id);
        expect(profiles.activeGameDir()).toBe(path.join(minecraftDir, 'tmods_profiles', 'modded'));
    });
});

describe('updateProfile', () => {
    it('renames and changes the version in the launcher, keeping its icon and dates', () => {
        const profile = profiles.createProfile({ name: 'Old', gameVersion: '1.20.1' });
        const data = readLauncherFile();
        data.profiles['tmods-old'].icon = 'Furnace';
        data.profiles['tmods-old'].lastUsed = '2026-01-01T00:00:00.000Z';
        fs.writeFileSync(path.join(minecraftDir, 'launcher_profiles.json'), JSON.stringify(data));

        profiles.updateProfile(profile.id, { name: 'New', gameVersion: '1.21' });

        expect(readLauncherFile().profiles['tmods-old']).toMatchObject({
            name: 'New',
            lastVersionId: '1.21',
            icon: 'Furnace',
            lastUsed: '2026-01-01T00:00:00.000Z',
        });
        expect(profiles.listProfiles()[1].name).toBe('New');
    });
});

describe('setProfileManifest', () => {
    it('saves the manifest a profile follows and keeps it when the profile is edited', () => {
        const profile = profiles.createProfile({ name: 'Pack', gameVersion: '1.21', manifestId: 'manifest-1' });
        profiles.setProfileManifest(profile.id, 'manifest-2');
        profiles.updateProfile(profile.id, { name: 'Renamed', gameVersion: '1.21' });
        expect(profiles.listProfiles().find(item => item.id === profile.id).manifestId).toBe('manifest-2');
    });

    it('saves the default profile pick apart, since that profile is built in', () => {
        expect(profiles.getActiveProfile().manifestId).toBe('');
        profiles.setProfileManifest('default', 'manifest-2');
        expect(profiles.getActiveProfile().manifestId).toBe('manifest-2');
    });
});

describe('deleteProfile', () => {
    it('removes it from the app and launcher but keeps its files', () => {
        const profile = profiles.createProfile({ name: 'Gone' });
        const gameDir = profiles.profileGameDir(profile);
        fs.writeFileSync(path.join(gameDir, 'options.txt'), 'keep me');
        profiles.setActiveProfile(profile.id);

        profiles.deleteProfile(profile.id);

        expect(profiles.listProfiles().map(p => p.id)).toEqual(['default']);
        expect(profiles.getActiveProfile().id).toBe('default');
        expect(readLauncherFile().profiles['tmods-gone']).toBeUndefined();
        expect(fs.readFileSync(path.join(gameDir, 'options.txt'), 'utf-8')).toBe('keep me');
    });
});

describe('ensureTModsProfile', () => {
    it('creates an active TMods profile on the latest release when there are none', () => {
        const profile = profiles.ensureTModsProfile();

        expect(profile).toEqual({ id: 'tmods', name: 'TMods', gameVersion: 'latest-release' });
        expect(profiles.listProfiles().map(p => p.id)).toEqual(['default', 'tmods']);
        expect(profiles.getActiveProfile().id).toBe('tmods');
        expect(fs.existsSync(profiles.profileGameDir(profile))).toBe(true);
        expect(readLauncherFile().profiles['tmods-tmods']).toMatchObject({
            name: 'TMods',
            lastVersionId: 'latest-release',
        });
    });

    it('does nothing when a profile already exists', () => {
        profiles.createProfile({ name: 'Fabric' });

        expect(profiles.ensureTModsProfile()).toBeNull();
        expect(profiles.listProfiles().map(p => p.id)).toEqual(['default', 'fabric']);
        expect(profiles.getActiveProfile().id).toBe('default');
    });

    it('runs once, so a second start keeps the player on their chosen profile', () => {
        profiles.ensureTModsProfile();
        profiles.setActiveProfile('default');

        expect(profiles.ensureTModsProfile()).toBeNull();
        expect(profiles.getActiveProfile().id).toBe('default');
    });

    it('comes back after the last profile is deleted, reusing its old folder', () => {
        const first = profiles.ensureTModsProfile();
        fs.writeFileSync(path.join(profiles.profileGameDir(first), 'options.txt'), 'keep me');
        profiles.setActiveProfile('default');

        profiles.deleteProfile(first.id);
        expect(profiles.ensureTModsProfile()).not.toBeNull();

        expect(profiles.listProfiles().map(p => p.name)).toEqual(['Default (.minecraft)', 'TMods']);
        expect(profiles.getActiveProfile().id).toBe('tmods');
        expect(fs.readFileSync(path.join(profiles.activeGameDir(), 'options.txt'), 'utf-8')).toBe('keep me');
        expect(Object.keys(readLauncherFile().profiles)).toEqual(['tmods-tmods']);
    });
});

describe('syncLauncherProfiles', () => {
    it('restores an entry removed in the launcher and drops stale tmods entries only', () => {
        profiles.createProfile({ name: 'Keep' });
        writeLauncherFile({ profiles: { 'tmods-stale': { name: 'Stale' }, mine: { name: 'Mine' } } });

        profiles.syncLauncherProfiles();

        expect(Object.keys(readLauncherFile().profiles).sort()).toEqual(['mine', 'tmods-keep']);
    });

    it('creates nothing when there are no profiles and no launcher file', () => {
        expect(profiles.syncLauncherProfiles()).toEqual([]);
        expect(fs.existsSync(minecraftDir)).toBe(false);
    });

    it('does not rewrite the file when nothing changed', () => {
        profiles.createProfile({ name: 'Same' });
        expect(profiles.syncLauncherProfiles()).toEqual([]);
    });
});

describe('listGameVersions', () => {
    it('lists the latest aliases then installed versions, newest first', () => {
        installVersion('1.20.1');
        installVersion('1.21');
        installVersion('fabric-loader-0.16.5-1.21');
        fs.mkdirSync(path.join(minecraftDir, 'versions', 'broken'), { recursive: true });

        expect(profiles.listGameVersions()).toEqual([
            'latest-release',
            'latest-snapshot',
            'fabric-loader-0.16.5-1.21',
            '1.21',
            '1.20.1',
        ]);
    });

    it('works when .minecraft does not exist', () => {
        expect(profiles.listGameVersions()).toEqual(['latest-release', 'latest-snapshot']);
    });
});
