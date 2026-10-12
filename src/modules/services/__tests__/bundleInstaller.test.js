import axios from 'axios';
import categories from '../../categories';
import { installBridge, removeBridge } from '../__fixtures__/bridge';
import { serversDat } from '../__fixtures__/serversDat';
import { parseServers } from '../serversDat';

jest.mock('axios', () => ({ get: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

// The installer loads Node modules through the main-process bridge and installs
// into ~/AppData/Roaming/.minecraft, so point the home folder at a temp dir.
let home;
let minecraftDir;
let installBundle;
let readInstalledVersion;
let listBackups;
let restoreBackup;
let MAX_BACKUPS;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-test-'));
    minecraftDir = path.join(home, 'AppData', 'Roaming', '.minecraft');
    fs.mkdirSync(minecraftDir, { recursive: true });

    installBridge(home);
    jest.isolateModules(() => {
        ({
            installBundle,
            readInstalledVersion,
            listBackups,
            restoreBackup,
            MAX_BACKUPS,
        } = require('../bundleInstaller'));
    });
    axios.get.mockReset();
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

function category(id) {
    return categories.find(c => c.id === id);
}

function serveZip(files) {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) {
        zip.addFile(name, Buffer.from(content));
    }
    const buffer = zip.toBuffer();
    axios.get.mockResolvedValue({
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    });
    return buffer;
}

function write(relative, content) {
    const file = path.join(minecraftDir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

function read(relative) {
    return fs.readFileSync(path.join(minecraftDir, relative), 'utf-8');
}

function exists(relative) {
    return fs.existsSync(path.join(minecraftDir, relative));
}

const version = { id: '2.0', url: 'https://example.com/bundle.zip' };

// Reads a file from the newest backup of a category.
function readBackup(id, relative, index = 0) {
    const backup = listBackups(category(id))[index];
    return fs.readFileSync(
        path.join(minecraftDir, '.tmods_loader', id, 'backups', backup.id, 'files', relative),
        'utf-8',
    );
}

describe('installBundle', () => {
    it('downloads the version zip as binary', async () => {
        serveZip({ 'mods/a.jar': 'a' });
        await installBundle(category('mods'), version);
        expect(axios.get).toHaveBeenCalledWith(version.url, { responseType: 'arraybuffer' });
    });

    it.each(['mods', 'schematics'])('backs up and wipes %s before extracting', async id => {
        const folder = category(id).backupFolder;
        write(`${folder}/old.file`, 'old');
        serveZip({ [`${folder}/new.file`]: 'new' });

        await installBundle(category(id), version);

        expect(readBackup(id, 'old.file')).toBe('old');
        expect(exists(`${folder}/old.file`)).toBe(false);
        expect(read(`${folder}/new.file`)).toBe('new');
    });

    it("adds the bundle's servers to the player's list instead of replacing it", async () => {
        write('servers.dat', serversDat([{ name: 'Mine', ip: 'mine.example.com' }]));
        serveZip({ 'servers.dat': serversDat([{ name: 'Bundle', ip: 'bundle.example.com' }]) });

        await installBundle(category('configs'), version);

        const list = parseServers(fs.readFileSync(path.join(minecraftDir, 'servers.dat')));
        expect(list.map(server => server.name)).toEqual(['Bundle', 'Mine']);
    });

    it.each(['configs', 'resourcepacks', 'shaderpacks'])('backs up and replaces %s too', async id => {
        const folder = category(id).backupFolder;
        write(`${folder}/mine.file`, 'mine');
        serveZip({ [`${folder}/new.file`]: 'new' });

        await installBundle(category(id), version);

        expect(readBackup(id, 'mine.file')).toBe('mine');
        expect(exists(`${folder}/mine.file`)).toBe(false);
        expect(read(`${folder}/new.file`)).toBe('new');
    });

    it.each(categories.map(c => c.id))('adds %s to what is there when told not to replace', async id => {
        const folder = category(id).backupFolder;
        write(`${folder}/mine.file`, 'mine');
        write(`${folder}/shared.file`, 'old');
        serveZip({ [`${folder}/shared.file`]: 'new', [`${folder}/pack.file`]: 'pack' });

        await installBundle(category(id), version, undefined, { replace: false });

        expect(read(`${folder}/mine.file`)).toBe('mine');
        expect(read(`${folder}/shared.file`)).toBe('new');
        expect(read(`${folder}/pack.file`)).toBe('pack');
        expect(readBackup(id, 'mine.file')).toBe('mine');
        expect(readBackup(id, 'shared.file')).toBe('old');
    });

    it('keeps earlier backups instead of overwriting them', async () => {
        write('mods/first.jar', 'first');
        write('.tmods_loader/mods/downloaded.txt', '1.0');
        serveZip({ 'mods/second.jar': 'second' });
        await installBundle(category('mods'), version);

        serveZip({ 'mods/third.jar': 'third' });
        await installBundle(category('mods'), { ...version, id: '3.0' });

        const backups = listBackups(category('mods'));
        expect(backups.map(b => b.version)).toEqual(['2.0', '1.0']);
        expect(readBackup('mods', 'second.jar', 0)).toBe('second');
        expect(readBackup('mods', 'first.jar', 1)).toBe('first');
        expect(new Date(backups[0].createdAt).getTime()).not.toBeNaN();
    });

    it(`keeps only the newest backups`, async () => {
        write('mods/a.jar', 'a');
        for (let i = 1; i <= MAX_BACKUPS + 2; i++) {
            serveZip({ [`mods/v${i}.jar`]: `${i}` });
            await installBundle(category('mods'), { ...version, id: `${i}` });
        }

        const backups = listBackups(category('mods'));
        expect(backups).toHaveLength(MAX_BACKUPS);
        // The install of version i backs up version i-1; the oldest ones were pruned.
        expect(backups.map(b => b.version)).toEqual(['6', '5', '4', '3', '2']);
        expect(fs.readdirSync(path.join(minecraftDir, '.tmods_loader/mods/backups'))).toHaveLength(MAX_BACKUPS);
    });

    it('no longer creates the old _back folder', async () => {
        write('mods/current.jar', 'current');
        serveZip({ 'mods/new.jar': 'new' });

        await installBundle(category('mods'), version);

        expect(exists('mods_back')).toBe(false);
    });

    it('installs when the backup folder does not exist yet', async () => {
        serveZip({ 'mods/new.jar': 'new' });

        await installBundle(category('mods'), version);

        expect(listBackups(category('mods'))).toEqual([]);
        expect(read('mods/new.jar')).toBe('new');
    });

    it('records the installed version and removes the staging folder', async () => {
        serveZip({ 'mods/new.jar': 'new' });

        await installBundle(category('mods'), version);

        expect(readInstalledVersion(category('mods'))).toBe('2.0');
        expect(exists('.tmods_loader/mods/staging')).toBe(false);
    });

    it('leaves files and the installed version alone when the download fails', async () => {
        write('mods/current.jar', 'current');
        write('.tmods_loader/mods/downloaded.txt', '1.0');
        axios.get.mockRejectedValue(new Error('Network Error'));

        await expect(installBundle(category('mods'), version)).rejects.toThrow('Network Error');

        expect(read('mods/current.jar')).toBe('current');
        expect(listBackups(category('mods'))).toEqual([]);
        expect(readInstalledVersion(category('mods'))).toBe('1.0');
    });

    it('leaves files, backups and the installed version alone when the zip is broken', async () => {
        write('mods/current.jar', 'current');
        write('.tmods_loader/mods/downloaded.txt', '1.0');
        const garbage = Buffer.from('this is not a zip');
        axios.get.mockResolvedValue({ data: garbage });

        await expect(installBundle(category('mods'), version)).rejects.toThrow(
            'The download of 2.0 is not a valid zip.',
        );

        expect(read('mods/current.jar')).toBe('current');
        expect(listBackups(category('mods'))).toEqual([]);
        expect(exists('.tmods_loader/mods/staging')).toBe(false);
        expect(readInstalledVersion(category('mods'))).toBe('1.0');
    });

    it('installs when the download matches the manifest checksum', async () => {
        const buffer = serveZip({ 'mods/new.jar': 'new' });
        const sha256 = require('crypto').createHash('sha256').update(buffer).digest('hex');

        await installBundle(category('mods'), { ...version, sha256: sha256.toUpperCase() });

        expect(read('mods/new.jar')).toBe('new');
    });

    it('refuses a download that does not match the manifest checksum', async () => {
        write('mods/current.jar', 'current');
        serveZip({ 'mods/evil.jar': 'evil' });

        await expect(installBundle(category('mods'), { ...version, sha256: 'ab'.repeat(32) })).rejects.toThrow(
            'The download of 2.0 is corrupt',
        );

        expect(read('mods/current.jar')).toBe('current');
        expect(exists('mods/evil.jar')).toBe(false);
        expect(listBackups(category('mods'))).toEqual([]);
    });
});

describe('readInstalledVersion', () => {
    it('returns an empty string when nothing was installed', () => {
        expect(readInstalledVersion(category('mods'))).toBe('');
    });

    it('tracks each category separately', async () => {
        serveZip({ 'config/a.toml': 'a' });
        await installBundle(category('configs'), version);

        expect(readInstalledVersion(category('configs'))).toBe('2.0');
        expect(readInstalledVersion(category('mods'))).toBe('');
    });

    it("doesn't count a version installed from another manifest", async () => {
        const a = { id: 'manifest-1', name: 'A', url: 'https://a.example.com/m.json' };
        const b = { id: 'manifest-2', name: 'B', url: 'https://b.example.com/m.json' };
        localStorage.setItem('tmods.manifests', JSON.stringify([a, b]));
        serveZip({ 'config/a.toml': 'a' });
        await installBundle(category('configs'), version);

        expect(readInstalledVersion(category('configs'))).toBe('2.0');
        expect(readInstalledVersion(category('configs'), minecraftDir, b.url)).toBe('');
        localStorage.setItem('tmods.defaultProfileManifest', b.id);
        expect(readInstalledVersion(category('configs'))).toBe('');
    });

    it('counts installs made before the manifest was recorded as the current manifest', () => {
        write('.tmods_loader/mods/downloaded.txt', '1.0');
        expect(readInstalledVersion(category('mods'), minecraftDir, 'https://b.example.com/m.json')).toBe('1.0');
    });
});

describe('restoreBackup', () => {
    async function installTwice() {
        write('mods/one.jar', 'one');
        write('.tmods_loader/mods/downloaded.txt', '1.0');
        serveZip({ 'mods/two.jar': 'two' });
        await installBundle(category('mods'), version);
    }

    it('puts the backed-up files back and records their version', async () => {
        await installTwice();
        const [backup] = listBackups(category('mods'));

        restoreBackup(category('mods'), backup.id);

        expect(read('mods/one.jar')).toBe('one');
        expect(exists('mods/two.jar')).toBe(false);
        expect(readInstalledVersion(category('mods'))).toBe('1.0');
    });

    it('backs up the current files first so a restore can be undone', async () => {
        await installTwice();
        const [backup] = listBackups(category('mods'));

        restoreBackup(category('mods'), backup.id);

        const backups = listBackups(category('mods'));
        expect(backups.map(b => b.version)).toEqual(['2.0', '1.0']);
        restoreBackup(category('mods'), backups[0].id);
        expect(read('mods/two.jar')).toBe('two');
        expect(exists('mods/one.jar')).toBe(false);
        expect(readInstalledVersion(category('mods'))).toBe('2.0');
    });

    it('restores which manifest the backed-up version came from', async () => {
        const urls = ['https://a.example.com/m.json', 'https://b.example.com/m.json'];
        localStorage.setItem(
            'tmods.manifests',
            JSON.stringify(urls.map((url, n) => ({ id: `manifest-${n + 1}`, name: url, url }))),
        );
        serveZip({ 'mods/one.jar': 'one' });
        await installBundle(category('mods'), version);
        localStorage.setItem('tmods.defaultProfileManifest', 'manifest-2');
        serveZip({ 'mods/two.jar': 'two' });
        await installBundle(category('mods'), { ...version, id: '3.0' });

        const [backup] = listBackups(category('mods'));
        expect(backup).toMatchObject({ version: '2.0', manifest: urls[0] });
        restoreBackup(category('mods'), backup.id);
        expect(readInstalledVersion(category('mods'), minecraftDir, urls[0])).toBe('2.0');
        expect(readInstalledVersion(category('mods'), minecraftDir, urls[1])).toBe('');
    });

    it('replaces config entirely, dropping files added since the backup', async () => {
        write('config/a.toml', 'old');
        serveZip({ 'config/a.toml': 'new', 'config/b.toml': 'added' });
        await installBundle(category('configs'), version);
        const [backup] = listBackups(category('configs'));

        restoreBackup(category('configs'), backup.id);

        expect(read('config/a.toml')).toBe('old');
        expect(exists('config/b.toml')).toBe(false);
        expect(readInstalledVersion(category('configs'))).toBe('');
    });

    it('can restore the oldest backup when the history is full', async () => {
        write('mods/a.jar', 'oldest');
        for (let i = 1; i <= MAX_BACKUPS; i++) {
            serveZip({ [`mods/v${i}.jar`]: `${i}` });
            await installBundle(category('mods'), { ...version, id: `${i}` });
        }
        const backups = listBackups(category('mods'));
        const oldest = backups[backups.length - 1];

        restoreBackup(category('mods'), oldest.id);

        expect(read('mods/a.jar')).toBe('oldest');
        expect(listBackups(category('mods'))).toHaveLength(MAX_BACKUPS);
    });

    it('throws for an unknown backup and leaves files alone', async () => {
        await installTwice();

        expect(() => restoreBackup(category('mods'), 'nope')).toThrow('not found');
        expect(read('mods/two.jar')).toBe('two');
    });
});

describe('custom game folder', () => {
    it('installs, backs up and restores inside the given folder only', async () => {
        const profileDir = path.join(home, 'profiles', 'fabric-1.21');
        const mods = category('mods');
        fs.mkdirSync(path.join(profileDir, 'mods'), { recursive: true });
        fs.writeFileSync(path.join(profileDir, 'mods', 'old.jar'), 'old');
        serveZip({ 'mods/new.jar': 'new' });

        await installBundle(mods, version, profileDir);

        expect(fs.readFileSync(path.join(profileDir, 'mods', 'new.jar'), 'utf-8')).toBe('new');
        expect(readInstalledVersion(mods, profileDir)).toBe('2.0');
        expect(readInstalledVersion(mods)).toBe('');
        expect(listBackups(mods)).toEqual([]);

        const [backup] = listBackups(mods, profileDir);
        restoreBackup(mods, backup.id, profileDir);

        expect(fs.readFileSync(path.join(profileDir, 'mods', 'old.jar'), 'utf-8')).toBe('old');
        expect(exists('mods')).toBe(false);
    });
});
