import axios from 'axios';
import { installBridge, removeBridge } from '../__fixtures__/bridge';
import { named, nbtString, serversDat } from '../__fixtures__/serversDat';
import { parseServers, serializeServers } from '../serversDat';

jest.mock('axios', () => ({ get: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');

const ICON = 'iVBORw0KGgo=';

describe('servers.dat', () => {
    it('reads what the game writes', () => {
        const data = serversDat([
            { name: 'Hypixel', ip: 'mc.hypixel.net', icon: ICON },
            { name: 'Friends', ip: 'friends.example.com:25570', acceptTextures: 1 },
            { name: 'No packs', ip: 'nopacks.example.com', acceptTextures: 0 },
        ]);

        expect(parseServers(data)).toEqual([
            {
                name: 'Hypixel',
                address: 'mc.hypixel.net',
                resourcePack: 'prompt',
                hidden: false,
                extra: [['icon', { type: 8, value: ICON }]],
            },
            {
                name: 'Friends',
                address: 'friends.example.com:25570',
                resourcePack: 'enabled',
                hidden: false,
                extra: [],
            },
            { name: 'No packs', address: 'nopacks.example.com', resourcePack: 'disabled', hidden: false, extra: [] },
        ]);
    });

    it('writes back what it read, keeping tags it does not know', () => {
        const long = Buffer.alloc(8);
        long.writeBigInt64BE(-5n);
        const extra = Buffer.concat([
            named(4, 'lastSeen', long),
            named(9, 'tags', Buffer.concat([Buffer.from([8, 0, 0, 0, 1]), nbtString('ünï ✓ 🎮')])),
        ]);
        const data = serversDat([{ name: 'Modded', ip: 'mod.example.com', icon: ICON, extra }]);

        const servers = parseServers(data);
        const again = parseServers(serializeServers(servers));

        expect(again).toEqual(servers);
        expect(again[0].extra.map(([name]) => name)).toEqual(['icon', 'lastSeen', 'tags']);
        expect(again[0].extra[1][1].value).toBe(-5n);
    });

    it('reads accented and emoji names the way Java writes them', () => {
        // Java's modified UTF-8 writes characters outside the BMP as two 3-byte surrogates.
        const name = Buffer.from([0x4d, 0xc3, 0xa1, 0xed, 0xa0, 0xbc, 0xed, 0xbe, 0xae]);
        const length = Buffer.from([0, name.length]);
        const entry = Buffer.concat([
            named(8, 'ip', nbtString('a.example.com')),
            Buffer.from([8]),
            nbtString('name'),
            length,
            name,
            Buffer.from([0]),
        ]);
        const list = Buffer.concat([Buffer.from([10, 0, 0, 0, 1]), entry]);
        const data = named(10, '', Buffer.concat([named(9, 'servers', list), Buffer.from([0])]));

        const [server] = parseServers(data);

        expect(server.name).toBe('Má🎮');
        expect(Buffer.from(serializeServers([server]))).toEqual(
            Buffer.from(serializeServers(parseServers(serializeServers([server])))),
        );
        expect(Buffer.from(serializeServers([server])).includes(name)).toBe(true);
    });

    it('reads an empty list and an empty file', () => {
        expect(parseServers(serversDat([]))).toEqual([]);
        expect(parseServers(new Uint8Array(0))).toEqual([]);
    });

    it('refuses files that are not a server list', () => {
        expect(() => parseServers(Buffer.from('hello'))).toThrow();
        expect(() => parseServers(serversDat([{ name: 'a', ip: 'b' }]).subarray(0, 20))).toThrow('ends too early');
        expect(() => parseServers(Buffer.from([0x1f, 0x8b, 8, 0]))).toThrow('compressed');
    });
});

describe('server lists in game folders', () => {
    let home;
    let gameDir;
    let servers;
    let profiles;

    beforeEach(() => {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-servers-'));
        gameDir = path.join(home, 'AppData', 'Roaming', '.minecraft');
        fs.mkdirSync(gameDir, { recursive: true });
        localStorage.setItem('tmods.manifestUrl', 'https://example.com/manifest.json');
        installBridge(home);
        jest.isolateModules(() => {
            servers = require('../servers');
            profiles = require('../profiles');
        });
    });

    afterEach(() => {
        fs.rmSync(home, { recursive: true, force: true });
        removeBridge();
    });

    function writeGame(list, dir = gameDir) {
        fs.writeFileSync(path.join(dir, 'servers.dat'), serversDat(list));
    }

    function listed(dir = gameDir) {
        return servers.readServers(dir).map(server => `${server.name}=${server.address}:${server.resourcePack}`);
    }

    const own = { name: 'Mine', ip: 'mine.example.com', icon: ICON };
    const lobby = { name: 'TMods Lobby', address: 'lobby.example.com', resourcePack: 'enabled' };
    const survival = { name: 'Survival', address: 'survival.example.com' };

    it('saves an edited list and keeps the old one like the game does', () => {
        writeGame([own]);
        const [mine] = servers.readServers(gameDir);

        expect(
            servers.writeServers(gameDir, [
                { ...mine, name: 'Mine!' },
                { name: '', address: ' b.example.com ' },
            ]),
        ).toBe(true);

        expect(listed()).toEqual(['Mine!=mine.example.com:prompt', 'Minecraft Server=b.example.com:prompt']);
        // The icon the game saved is kept.
        expect(servers.readServers(gameDir)[0].extra).toEqual([['icon', { type: 8, value: ICON }]]);
        expect(parseServers(fs.readFileSync(path.join(gameDir, 'servers.dat_old')))[0].name).toBe('Mine');
        expect(servers.writeServers(gameDir, servers.readServers(gameDir))).toBe(false);
    });

    it('refuses servers without a usable address', () => {
        expect(() => servers.writeServers(gameDir, [{ name: 'x', address: '  ' }])).toThrow('needs an address');
        expect(() => servers.writeServers(gameDir, [{ name: 'x', address: 'a b' }])).toThrow('has spaces');
        expect(fs.existsSync(path.join(gameDir, 'servers.dat'))).toBe(false);
    });

    it("merges a pack's list into the player's instead of replacing it", () => {
        writeGame([own, { name: 'Shared', ip: 'shared.example.com' }]);
        const staged = path.join(home, 'staged');
        fs.mkdirSync(staged);
        writeGame(
            [
                { name: 'New', ip: 'new.example.com' },
                { name: 'Shared (pack)', ip: 'SHARED.example.com:25565' },
            ],
            staged,
        );

        servers.mergeStagedServers(staged, gameDir);

        expect(listed(staged)).toEqual([
            'New=new.example.com:prompt',
            'Mine=mine.example.com:prompt',
            'Shared=shared.example.com:prompt',
        ]);
    });

    it("keeps the player's list when the pack's can't be read", () => {
        writeGame([own]);
        const staged = path.join(home, 'staged');
        fs.mkdirSync(staged);
        fs.writeFileSync(path.join(staged, 'servers.dat'), 'garbage');
        jest.spyOn(console, 'error').mockImplementation(() => {});

        servers.mergeStagedServers(staged, gameDir);

        expect(fs.existsSync(path.join(staged, 'servers.dat'))).toBe(false);
    });

    it('reads the servers a manifest lists, skipping broken entries', () => {
        expect(
            servers.manifestServers({
                servers: [
                    lobby,
                    { address: 'noname.example.com', resourcePack: 'sometimes' },
                    { name: 'Copy', address: 'LOBBY.example.com' },
                    { name: 'Spaces', address: 'a b' },
                    { name: 'Nothing' },
                    null,
                ],
            }),
        ).toEqual([lobby, { name: 'noname.example.com', address: 'noname.example.com', resourcePack: 'prompt' }]);
        expect(servers.manifestServers({ versions: {} })).toEqual([]);
    });

    it("adds the manifest's servers on top and leaves the player's alone", () => {
        writeGame([own]);

        expect(servers.applyManifestServers(gameDir, servers.manifestServers({ servers: [lobby, survival] }))).toBe(
            true,
        );

        expect(listed()).toEqual([
            'TMods Lobby=lobby.example.com:enabled',
            'Survival=survival.example.com:prompt',
            'Mine=mine.example.com:prompt',
        ]);
        expect(servers.readManaged(gameDir)).toEqual(['lobby.example.com', 'survival.example.com']);
        expect(servers.applyManifestServers(gameDir, servers.manifestServers({ servers: [lobby, survival] }))).toBe(
            false,
        );
    });

    it('follows manifest changes, but respects what the player did', () => {
        writeGame([own]);
        servers.applyManifestServers(gameDir, servers.manifestServers({ servers: [lobby, survival] }));
        // The player moves the lobby down and deletes Survival.
        const [lobbyEntry, , mine] = servers.readServers(gameDir);
        servers.writeServers(gameDir, [mine, lobbyEntry]);

        const renamed = { ...lobby, name: 'Lobby 2', resourcePack: 'disabled' };
        const creative = { name: 'Creative', address: 'creative.example.com' };
        servers.applyManifestServers(gameDir, servers.manifestServers({ servers: [renamed, survival, creative] }));

        expect(listed()).toEqual([
            'Creative=creative.example.com:prompt',
            'Mine=mine.example.com:prompt',
            'Lobby 2=lobby.example.com:disabled',
        ]);

        // Dropped from the manifest: removed, but only the ones TMods added.
        servers.applyManifestServers(gameDir, []);
        expect(listed()).toEqual(['Mine=mine.example.com:prompt']);
        expect(servers.readManaged(gameDir)).toEqual([]);
    });

    it('never takes over a server the player already had', () => {
        writeGame([{ name: 'My lobby', ip: 'lobby.example.com' }]);

        servers.applyManifestServers(gameDir, servers.manifestServers({ servers: [lobby] }));
        servers.applyManifestServers(gameDir, []);

        expect(listed()).toEqual(['My lobby=lobby.example.com:prompt']);
    });

    it("puts the manifest's servers in every profile", async () => {
        const profile = profiles.createProfile({ name: 'Survival', gameVersion: '1.21.1' });
        writeGame([own]);
        axios.get.mockResolvedValue({ data: { versions: {}, servers: [lobby] } });

        expect(await servers.syncManifestServers()).toEqual(['Default (.minecraft)', 'Survival']);

        expect(listed()).toEqual(['TMods Lobby=lobby.example.com:enabled', 'Mine=mine.example.com:prompt']);
        expect(listed(profiles.profileGameDir(profile))).toEqual(['TMods Lobby=lobby.example.com:enabled']);
        expect(await servers.syncManifestServers()).toEqual([]);
    });
});
