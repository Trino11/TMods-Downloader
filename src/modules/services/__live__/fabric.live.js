import { fabricVersionId, installFabric, latestLoaderVersion, listFabricGameVersions } from '../fabric';
import { GAME_VERSION } from './constants';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Fabric writes into the launcher's folder; point it at a temp dir.
let mockMinecraftDir;
jest.mock('../paths', () => ({
    ...jest.requireActual('../paths'),
    minecraftDir: () => mockMinecraftDir,
}));

beforeEach(() => {
    mockMinecraftDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-live-fabric-'));
});

afterEach(() => {
    fs.rmSync(mockMinecraftDir, { recursive: true, force: true });
});

describe('Fabric meta service', () => {
    test('lists stable Minecraft versions, snapshots only when asked', async () => {
        const stable = await listFabricGameVersions();
        const all = await listFabricGameVersions({ snapshots: true });
        expect(stable).toContain(GAME_VERSION);
        expect(stable.every(version => typeof version === 'string')).toBe(true);
        expect(all.length).toBeGreaterThan(stable.length);
    });

    test('has a stable loader for the test version', async () => {
        expect(await latestLoaderVersion(GAME_VERSION)).toMatch(/^\d+\.\d+\.\d+/);
    });

    test('installs the launcher version json', async () => {
        const id = await installFabric(GAME_VERSION);
        const loader = await latestLoaderVersion(GAME_VERSION);
        expect(id).toBe(fabricVersionId(GAME_VERSION, loader));

        const file = path.join(mockMinecraftDir, 'versions', id, `${id}.json`);
        const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
        expect(json.id).toBe(id);
        expect(json.inheritsFrom).toBe(GAME_VERSION);
        expect(json.mainClass).toMatch(/fabricmc/);
        const loaderLib = json.libraries.find(lib => lib.name.startsWith('net.fabricmc:fabric-loader:'));
        expect(loaderLib).toMatchObject({ name: `net.fabricmc:fabric-loader:${loader}` });
        expect(json.libraries.every(lib => /^https:\/\//.test(lib.url || 'https://'))).toBe(true);
    });
});
