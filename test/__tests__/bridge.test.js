/**
 * @jest-environment node
 */
// Node, not jsdom: this is main-process code, and adm-zip needs Node's own Buffer.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { createBridge, createHttp, defaultMinecraftDir } = require('../../public/bridge');

let home;
let minecraftDir;
let bridge;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-bridge-'));
    minecraftDir = path.join(home, '.minecraft');
    fs.mkdirSync(minecraftDir);
    bridge = createBridge({ fs, path, crypto, AdmZip, platform: process.platform, minecraftDir });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
});

const call = (method, ...args) => bridge.call(method, args);
const inGame = (...parts) => path.join(minecraftDir, ...parts);

describe('defaultMinecraftDir', () => {
    it("is the launcher's folder on each OS", () => {
        expect(defaultMinecraftDir(path.win32, 'win32', 'C:\\Users\\me')).toBe(
            'C:\\Users\\me\\AppData\\Roaming\\.minecraft',
        );
        expect(defaultMinecraftDir(path.posix, 'darwin', '/Users/me')).toBe(
            '/Users/me/Library/Application Support/minecraft',
        );
        expect(defaultMinecraftDir(path.posix, 'linux', '/home/me')).toBe('/home/me/.minecraft');
    });
});

describe('createBridge', () => {
    it('tells the page where the game lives and which calls exist', () => {
        expect(bridge.info).toMatchObject({ minecraftDir, sep: path.sep, platform: process.platform });
        expect(bridge.info.methods).toEqual(expect.arrayContaining(['fs.readFile', 'zip.extract', 'crypto.hash']));
    });

    it('reads and writes files in the Minecraft folder', () => {
        expect(call('fs.mkdir', inGame('mods'), { recursive: true })).toEqual({ value: undefined });
        call('fs.writeFile', inGame('mods', 'a.txt'), 'hello');
        call('fs.writeFile', inGame('mods', 'b.bin'), new Uint8Array([1, 2, 3]));

        expect(call('fs.readFile', inGame('mods', 'a.txt'), 'utf-8')).toEqual({ value: 'hello' });
        expect([...call('fs.readFile', inGame('mods', 'b.bin')).value]).toEqual([1, 2, 3]);
        expect(call('fs.exists', inGame('mods', 'a.txt'))).toEqual({ value: true });
        expect(call('fs.readdir', inGame()).value).toEqual([{ name: 'mods', isDirectory: true }]);

        call('fs.rename', inGame('mods', 'a.txt'), inGame('mods', 'c.txt'));
        call('fs.copy', inGame('mods'), inGame('backup'));
        expect(fs.readFileSync(inGame('backup', 'c.txt'), 'utf-8')).toBe('hello');
        call('fs.rm', inGame('mods'), { recursive: true, force: true });
        expect(fs.existsSync(inGame('mods'))).toBe(false);
    });

    it.each([
        ['a file next to the Minecraft folder', () => path.join(home, 'secret.txt')],
        ['a path that climbs out with ..', () => path.join(minecraftDir, '..', 'secret.txt')],
        ['a folder whose name only starts the same', () => `${minecraftDir}-evil${path.sep}x`],
        ['a relative path', () => 'secret.txt'],
        ['something that is not a path', () => ({ toString: () => minecraftDir })],
    ])('refuses %s', (label, target) => {
        fs.writeFileSync(path.join(home, 'secret.txt'), 'secret');

        for (const method of ['fs.exists', 'fs.readFile', 'fs.readdir', 'fs.rm']) {
            expect(call(method, target())).toEqual({ error: expect.any(String) });
        }
        expect(call('fs.writeFile', target(), 'x')).toEqual({ error: expect.any(String) });
        expect(fs.readFileSync(path.join(home, 'secret.txt'), 'utf-8')).toBe('secret');
    });

    it('refuses to copy or move files out of the Minecraft folder', () => {
        fs.writeFileSync(inGame('options.txt'), 'x');
        const outside = path.join(home, 'stolen.txt');

        expect(call('fs.copy', inGame('options.txt'), outside).error).toMatch(/may not access/);
        expect(call('fs.rename', inGame('options.txt'), outside).error).toMatch(/may not access/);
        expect(fs.existsSync(outside)).toBe(false);
    });

    it('refuses calls it does not know', () => {
        expect(call('child_process.exec', 'calc')).toEqual({ error: 'Unknown call: child_process.exec' });
        expect(call('toString')).toEqual({ error: 'Unknown call: toString' });
    });

    it('hashes with the algorithms the app uses, and only those', () => {
        const expected = crypto.createHash('sha1').update('abc').digest('hex');
        expect(call('crypto.hash', 'sha1', new TextEncoder().encode('abc'))).toEqual({ value: expected });
        expect(call('crypto.hash', 'md5', 'abc').error).toMatch(/Unsupported/);
    });

    it('reads, extracts and creates zips', () => {
        const zip = new AdmZip();
        zip.addFile('config/a.toml', Buffer.from('a=1'));
        const data = new Uint8Array(zip.toBuffer());

        expect(call('zip.read', data).value).toEqual([
            { name: 'config/a.toml', isDirectory: false, data: Buffer.from('a=1') },
        ]);
        call('zip.extract', data.buffer, inGame('staging'));
        expect(fs.readFileSync(inGame('staging', 'config', 'a.toml'), 'utf-8')).toBe('a=1');

        const created = call('zip.create', [
            { name: 'index.json', data: '{}' },
            { file: inGame('staging', 'config', 'a.toml'), into: 'overrides' },
            { folder: inGame('staging', 'config'), into: 'overrides/config' },
        ]).value;
        const names = new AdmZip(created).getEntries().map(entry => entry.entryName);
        expect(names).toEqual(expect.arrayContaining(['index.json', 'overrides/a.toml', 'overrides/config/a.toml']));
    });

    it('says when data is not a zip', () => {
        expect(call('zip.read', new Uint8Array([1, 2, 3]))).toEqual({ error: 'Not a valid zip file.' });
    });

    it('never extracts or packs files outside the Minecraft folder', () => {
        const zip = new AdmZip();
        zip.addFile('a.txt', Buffer.from('a'));
        fs.writeFileSync(path.join(home, 'secret.txt'), 'secret');

        expect(call('zip.extract', zip.toBuffer(), path.join(home, 'out')).error).toMatch(/may not access/);
        expect(call('zip.create', [{ file: path.join(home, 'secret.txt') }]).error).toMatch(/may not access/);
    });
});

describe('createHttp', () => {
    function fakeFetch(body = 'ok') {
        return jest.fn(async () => ({
            status: 200,
            statusText: 'OK',
            headers: new Map([['content-type', 'application/json']]),
            text: async () => body,
            arrayBuffer: async () => new TextEncoder().encode(body).buffer,
        }));
    }

    it('makes the request with the TMods User-Agent and returns the body', async () => {
        const fetch = fakeFetch('{"a":1}');
        const http = createHttp(fetch, 'TMods/1.0');

        const response = await http({ url: 'https://api.modrinth.com/v2/search', headers: { Accept: 'json' } });

        expect(fetch).toHaveBeenCalledWith('https://api.modrinth.com/v2/search', {
            method: 'GET',
            headers: { Accept: 'json', 'User-Agent': 'TMods/1.0' },
            body: undefined,
        });
        expect(response).toEqual({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            data: '{"a":1}',
        });
    });

    it('sends POST bodies and returns binary downloads as bytes', async () => {
        const fetch = fakeFetch('zip');
        const http = createHttp(fetch, 'TMods/1.0');

        const response = await http({
            method: 'post',
            url: 'https://example.com/x',
            data: '{}',
            responseType: 'arraybuffer',
        });

        expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{}' });
        expect(new TextDecoder().decode(response.data)).toBe('zip');
    });

    it.each(['file:///C:/Windows/win.ini', 'ftp://example.com/x', 'not a url'])('refuses %s', async url => {
        const fetch = fakeFetch();
        await expect(createHttp(fetch, 'TMods')({ url })).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('refuses methods that change things on the server', async () => {
        const fetch = fakeFetch();
        await expect(createHttp(fetch, 'TMods')({ method: 'DELETE', url: 'https://example.com' })).rejects.toThrow(
            /Unsupported/,
        );
    });
});
