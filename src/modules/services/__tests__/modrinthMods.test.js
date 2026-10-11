import axios from 'axios';
import categories from '../../categories';
import { makeVersion, realmSafeAdmZip, required, serveModrinth, hash } from '../__fixtures__/modrinthFake';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

let home;
let gameDir;
let mods;
let installBundle;

const target = { loader: 'fabric', gameVersion: '1.21.1' };

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-modrinth-'));
    gameDir = path.join(home, 'game');
    fs.mkdirSync(gameDir, { recursive: true });
    const SafeAdmZip = realmSafeAdmZip(fs.mkdtempSync(path.join(home, 'zips-')));
    window.require = name => {
        if (name === 'os') {
            return { ...os, homedir: () => home };
        }
        return name === 'adm-zip' ? SafeAdmZip : require(name);
    };
    jest.isolateModules(() => {
        mods = require('../modrinthMods');
        ({ installBundle } = require('../bundleInstaller'));
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    delete window.require;
});

function modFiles() {
    const dir = path.join(gameDir, 'mods');
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

const fabricApi = makeVersion('fabric-api', '0.100.0');
const sodium = makeVersion('sodium', '0.6.0', { deps: [required('fabric-api')] });

function serveBasic(extra = {}) {
    serveModrinth(axios, {
        'fabric-api': { title: 'Fabric API', versions: [fabricApi] },
        sodium: { title: 'Sodium', versions: [sodium] },
        ...extra,
    });
}

describe('installMod', () => {
    it('installs the mod with its required dependencies and tracks them', async () => {
        serveBasic();

        const titles = await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        expect(titles).toEqual(['Sodium', 'Fabric API']);
        expect(modFiles()).toEqual(['fabric-api-0.100.0.jar', 'sodium-0.6.0.jar']);
        const list = mods.readModList(gameDir);
        expect(list.mods.map(m => [m.projectId, m.asDependency, m.enabled])).toEqual([
            ['sodium', false, true],
            ['fabric-api', true, true],
        ]);
        expect(list.mods[0].sha1).toBe(sodium.files[0].hashes.sha1);
    });

    it('asks Modrinth only for versions matching the loader and game version', async () => {
        serveBasic();

        await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        expect(axios.get).toHaveBeenCalledWith('https://api.modrinth.com/v2/project/sodium/version', {
            params: { loaders: '["fabric"]', game_versions: '["1.21.1"]' },
        });
    });

    it('prefers a release over a newer beta', async () => {
        const beta = makeVersion('fabric-api', '0.101.0-beta', { type: 'beta' });
        serveBasic({ 'fabric-api': { title: 'Fabric API', versions: [beta, fabricApi] } });

        await mods.installMod(gameDir, target, 'fabric-api', 'Fabric API');

        expect(modFiles()).toEqual(['fabric-api-0.100.0.jar']);
    });

    it('does not reinstall a dependency that is already there', async () => {
        serveBasic();
        await mods.installMod(gameDir, target, 'fabric-api', 'Fabric API');

        const titles = await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        expect(titles).toEqual(['Sodium']);
        expect(mods.readModList(gameDir).mods.find(m => m.projectId === 'fabric-api').asDependency).toBe(false);
    });

    it('refuses a mod with no version for the loader', async () => {
        serveBasic({ sodium: { title: 'Sodium', versions: [] } });

        await expect(mods.installMod(gameDir, target, 'sodium', 'Sodium')).rejects.toThrow(
            'Sodium has no version for fabric 1.21.1',
        );
        expect(modFiles()).toEqual([]);
    });

    it('refuses when a required dependency has no matching version, and writes nothing', async () => {
        serveBasic({ 'fabric-api': { title: 'Fabric API', versions: [] } });

        await expect(mods.installMod(gameDir, target, 'sodium', 'Sodium')).rejects.toThrow('It needs Fabric API');
        expect(modFiles()).toEqual([]);
        expect(mods.readModList(gameDir).mods).toEqual([]);
    });

    it('refuses a mod that is incompatible with an installed one', async () => {
        const optifabric = makeVersion('optifabric', '1.0', {
            deps: [{ project_id: 'sodium', dependency_type: 'incompatible' }],
        });
        serveBasic({ optifabric: { title: 'OptiFabric', versions: [optifabric] } });
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        await expect(mods.installMod(gameDir, target, 'optifabric', 'OptiFabric')).rejects.toThrow(
            "doesn't work together with Sodium",
        );
    });

    it('refuses a file that does not match its checksum', async () => {
        const broken = makeVersion('fabric-api', '0.100.0');
        broken.files[0].hashes.sha1 = 'nope';
        serveBasic({ 'fabric-api': { title: 'Fabric API', versions: [broken] } });

        await expect(mods.installMod(gameDir, target, 'fabric-api', 'Fabric API')).rejects.toThrow('checksum');
        expect(modFiles()).toEqual([]);
    });

    it('writes nothing when one of several downloads fails', async () => {
        const broken = makeVersion('fabric-api', '0.100.0');
        broken.files[0].hashes.sha1 = 'nope';
        serveBasic({ 'fabric-api': { title: 'Fabric API', versions: [broken] } });

        await expect(mods.installMod(gameDir, target, 'sodium', 'Sodium')).rejects.toThrow('checksum');
        expect(modFiles()).toEqual([]);
    });

    it('refuses to install the same mod twice', async () => {
        serveBasic();
        await mods.installMod(gameDir, target, 'fabric-api', 'Fabric API');

        await expect(mods.installMod(gameDir, target, 'fabric-api', 'Fabric API')).rejects.toThrow('already installed');
    });

    it('refuses file names that would escape the mods folder', async () => {
        const evil = makeVersion('evil', '1');
        evil.files[0].filename = '../evil.jar';
        serveBasic({ evil: { title: 'Evil', versions: [evil] } });

        await expect(mods.installMod(gameDir, target, 'evil', 'Evil')).rejects.toThrow('Refusing');
        expect(fs.existsSync(path.join(gameDir, 'evil.jar'))).toBe(false);
    });
});

describe('updates', () => {
    it('finds and applies a newer version, replacing the old jar', async () => {
        serveBasic();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        const newer = makeVersion('sodium', '0.6.1', { deps: [required('fabric-api')] });
        serveBasic({ sodium: { title: 'Sodium', versions: [newer, sodium] } });

        const updates = await mods.checkUpdates(gameDir, target);
        expect(updates.map(u => [u.mod.projectId, u.version.id])).toEqual([['sodium', '0.6.1']]);
        expect(axios.post).toHaveBeenCalledWith(
            'https://api.modrinth.com/v2/version_files/update',
            expect.objectContaining({
                loaders: ['fabric'],
                game_versions: ['1.21.1'],
                algorithm: 'sha1',
            }),
        );

        await mods.updateMod(gameDir, 'sodium', updates[0].version);

        expect(modFiles()).toEqual(['fabric-api-0.100.0.jar', 'sodium-0.6.1.jar']);
        expect(mods.readModList(gameDir).mods.find(m => m.projectId === 'sodium').versionNumber).toBe('0.6.1');
    });

    it('keeps a disabled mod disabled when updating it', async () => {
        serveBasic();
        await mods.installMod(gameDir, target, 'fabric-api', 'Fabric API');
        mods.setModEnabled(gameDir, 'fabric-api', false);
        const newer = makeVersion('fabric-api', '0.101.0');
        serveBasic({ 'fabric-api': { title: 'Fabric API', versions: [newer, fabricApi] } });

        await mods.updateMod(gameDir, 'fabric-api', newer);

        expect(modFiles()).toEqual(['fabric-api-0.101.0.jar.disabled']);
    });
});

describe('updateChangelog', () => {
    const installed = { projectId: 'sodium', versionId: '0.6.0' };
    const withLog = (id, changelog, options) => ({
        ...makeVersion('sodium', id, options),
        changelog,
        date_published: '2026-10-01T00:00:00Z',
    });

    it('lists every version between the installed one and the update, newest first', async () => {
        const beta = withLog('0.8.0-beta', 'Experimental', { type: 'beta' });
        const v071 = withLog('0.7.1', '  Fixes a crash\n');
        const v070 = withLog('0.7.0', null);
        serveBasic({ sodium: { title: 'Sodium', versions: [beta, v071, v070, sodium] } });

        const entries = await mods.updateChangelog(installed, v071, target);

        expect(entries).toEqual([
            { id: '0.7.1', label: '0.7.1', text: 'Fixes a crash', date: '2026-10-01T00:00:00Z' },
            { id: '0.7.0', label: '0.7.0', text: '', date: '2026-10-01T00:00:00Z' },
        ]);
        expect(axios.get).toHaveBeenCalledWith('https://api.modrinth.com/v2/project/sodium/version', {
            params: { loaders: '["fabric"]', game_versions: '["1.21.1"]' },
        });
    });

    it('shows only the update when the installed version is not listed', async () => {
        const v071 = withLog('0.7.1', 'Fixes a crash');
        serveBasic({ sodium: { title: 'Sodium', versions: [v071] } });

        const entries = await mods.updateChangelog(installed, v071, target);

        expect(entries.map(entry => entry.text)).toEqual(['Fixes a crash']);
    });
});

describe('enable, disable and remove', () => {
    it('disables by renaming the jar and enables it again', async () => {
        serveBasic();
        await mods.installMod(gameDir, target, 'fabric-api', 'Fabric API');

        mods.setModEnabled(gameDir, 'fabric-api', false);
        expect(modFiles()).toEqual(['fabric-api-0.100.0.jar.disabled']);
        expect(mods.readModList(gameDir).mods[0].enabled).toBe(false);

        mods.setModEnabled(gameDir, 'fabric-api', true);
        expect(modFiles()).toEqual(['fabric-api-0.100.0.jar']);
    });

    it('removes a mod with the dependencies nothing else needs', async () => {
        serveBasic();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        expect(mods.removeMod(gameDir, 'sodium')).toEqual(['Sodium', 'Fabric API']);
        expect(modFiles()).toEqual([]);
        expect(mods.readModList(gameDir).mods).toEqual([]);
    });

    it('keeps a dependency another mod still needs', async () => {
        const lithium = makeVersion('lithium', '0.13', { deps: [required('fabric-api')] });
        serveBasic({ lithium: { title: 'Lithium', versions: [lithium] } });
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        await mods.installMod(gameDir, target, 'lithium', 'Lithium');

        expect(mods.removeMod(gameDir, 'sodium')).toEqual(['Sodium']);
        expect(modFiles()).toEqual(['fabric-api-0.100.0.jar', 'lithium-0.13.jar']);
    });

    it('forgets mods whose jar was deleted by hand', async () => {
        serveBasic();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        fs.rmSync(path.join(gameDir, 'mods', 'sodium-0.6.0.jar'));

        expect(mods.readModList(gameDir).mods.map(m => m.projectId)).toEqual(['fabric-api']);
    });
});

describe('jars added by hand', () => {
    it('lists them and recognises the ones Modrinth knows by checksum', async () => {
        serveBasic();
        fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
        fs.writeFileSync(path.join(gameDir, 'mods', 'renamed-sodium.jar'), sodium.data);
        fs.writeFileSync(path.join(gameDir, 'mods', 'private.jar.disabled'), 'my own mod');
        fs.writeFileSync(path.join(gameDir, 'mods', 'notes.txt'), 'not a mod');

        expect(mods.listUnmanaged(gameDir)).toEqual(['private.jar.disabled', 'renamed-sodium.jar']);

        expect(await mods.adoptUnmanaged(gameDir)).toBe(1);
        const [adopted] = mods.readModList(gameDir).mods;
        expect(adopted).toMatchObject({
            projectId: 'sodium',
            title: 'Sodium',
            fileName: 'renamed-sodium.jar',
            enabled: true,
            sha1: hash('sha1', sodium.data),
        });
        expect(mods.listUnmanaged(gameDir)).toEqual(['private.jar.disabled']);
    });
});

describe('bundles and Modrinth mods together', () => {
    const modsCategory = categories.find(c => c.id === 'mods');

    function serveBundle(files) {
        const zip = new AdmZip();
        for (const [name, content] of Object.entries(files)) {
            zip.addFile(name, Buffer.from(content));
        }
        const buffer = zip.toBuffer();
        axios.get.mockResolvedValue({
            data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        });
    }

    it('keeps Modrinth mods, enabled or not, when a bundle replaces the mods folder', async () => {
        serveBasic();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        mods.setModEnabled(gameDir, 'fabric-api', false);
        fs.writeFileSync(path.join(gameDir, 'mods', 'hand.jar'), 'hand');
        serveBundle({ 'mods/bundle.jar': 'bundle' });

        await installBundle(modsCategory, { id: '1.0', url: 'https://example.com/b.zip' }, gameDir);

        expect(modFiles()).toEqual(['bundle.jar', 'fabric-api-0.100.0.jar.disabled', 'sodium-0.6.0.jar']);
    });
});

describe('setTargetVersion', () => {
    it('remembers the launcher version for the folder', () => {
        mods.setTargetVersion(gameDir, 'fabric-loader-0.16.5-1.21.1');
        expect(mods.readModList(gameDir).target).toEqual({ versionId: 'fabric-loader-0.16.5-1.21.1' });
    });
});
