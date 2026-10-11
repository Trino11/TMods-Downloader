import axios from 'axios';
import categories from '../../categories';

jest.mock('axios', () => ({ get: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

// The installer loads Node modules through Electron's window.require and installs
// into ~/AppData/Roaming/.minecraft, so point the home folder at a temp dir.
let home;
let minecraftDir;
let installBundle;
let readInstalledVersion;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-test-'));
    minecraftDir = path.join(home, 'AppData', 'Roaming', '.minecraft');
    fs.mkdirSync(minecraftDir, { recursive: true });

    window.require = name => (name === 'os' ? { ...os, homedir: () => home } : require(name));
    jest.isolateModules(() => {
        ({ installBundle, readInstalledVersion } = require('../bundleInstaller'));
    });
    axios.get.mockReset();
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    delete window.require;
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

        expect(read(`${folder}_back/old.file`)).toBe('old');
        expect(exists(`${folder}/old.file`)).toBe(false);
        expect(read(`${folder}/new.file`)).toBe('new');
    });

    it('backs up config without wiping it', async () => {
        write('config/keep.toml', 'mine');
        write('config/shared.toml', 'old');
        serveZip({ 'config/shared.toml': 'new' });

        await installBundle(category('configs'), version);

        expect(read('config_back/keep.toml')).toBe('mine');
        expect(read('config_back/shared.toml')).toBe('old');
        expect(read('config/keep.toml')).toBe('mine');
        expect(read('config/shared.toml')).toBe('new');
    });

    it.each(['resourcepacks', 'shaderpacks'])('extracts %s over existing files without a backup', async id => {
        write(`${id}/mine.zip`, 'mine');
        serveZip({ [`${id}/pack.zip`]: 'pack' });

        await installBundle(category(id), version);

        expect(read(`${id}/mine.zip`)).toBe('mine');
        expect(read(`${id}/pack.zip`)).toBe('pack');
        expect(exists(`${id}_back`)).toBe(false);
    });

    it('replaces an older backup with the current folder', async () => {
        write('mods_back/ancient.jar', 'ancient');
        write('mods/current.jar', 'current');
        serveZip({ 'mods/new.jar': 'new' });

        await installBundle(category('mods'), version);

        expect(exists('mods_back/ancient.jar')).toBe(false);
        expect(read('mods_back/current.jar')).toBe('current');
    });

    it('installs when the backup folder does not exist yet', async () => {
        serveZip({ 'mods/new.jar': 'new' });

        await installBundle(category('mods'), version);

        expect(exists('mods_back')).toBe(false);
        expect(read('mods/new.jar')).toBe('new');
    });

    it('records the installed version and removes the downloaded zip', async () => {
        serveZip({ 'mods/new.jar': 'new' });

        await installBundle(category('mods'), version);

        expect(readInstalledVersion(category('mods'))).toBe('2.0');
        expect(exists('.tmods_loader/mods/mods.zip')).toBe(false);
    });

    it('leaves files and the installed version alone when the download fails', async () => {
        write('mods/current.jar', 'current');
        write('.tmods_loader/mods/downloaded.txt', '1.0');
        axios.get.mockRejectedValue(new Error('Network Error'));

        await expect(installBundle(category('mods'), version)).rejects.toThrow('Network Error');

        expect(read('mods/current.jar')).toBe('current');
        expect(exists('mods_back')).toBe(false);
        expect(readInstalledVersion(category('mods'))).toBe('1.0');
    });

    it('removes the zip and keeps the old version recorded when extraction fails', async () => {
        write('.tmods_loader/mods/downloaded.txt', '1.0');
        const garbage = Buffer.from('this is not a zip');
        axios.get.mockResolvedValue({ data: garbage });

        await expect(installBundle(category('mods'), version)).rejects.toThrow();

        expect(exists('.tmods_loader/mods/mods.zip')).toBe(false);
        expect(readInstalledVersion(category('mods'))).toBe('1.0');
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
});
