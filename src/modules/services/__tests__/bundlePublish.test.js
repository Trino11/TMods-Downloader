import { installBridge, removeBridge } from '../__fixtures__/bridge';
import { exportMrpack } from '../mrpack';

jest.mock('../mrpack', () => ({ exportMrpack: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');

let home;
let bridge;
let service;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-publish-'));
    localStorage.clear();
    bridge = installBridge(home);
    jest.isolateModules(() => {
        service = require('../bundlePublish');
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

describe('nextVersion', () => {
    it.each([
        [[], '1.0.0'],
        [['1.9.0', '1.10.0'], '1.10.1'],
        [['2024-06'], '2024-07'],
        [['1.0.0-beta'], '1.0.1-beta'],
        [['first'], '1.0.0'],
    ])('after %p suggests %p', (existing, next) => {
        expect(service.nextVersion(existing)).toBe(next);
    });
});

describe('bundlesRepo', () => {
    it('defaults to the repository the manifest is published from', () => {
        localStorage.setItem(
            'tmods.manifestUrl',
            'https://github.com/Trino11/TMods-bundles/releases/latest/download/manifest.json',
        );
        expect(service.bundlesRepo()).toBe('Trino11/TMods-bundles');
    });

    it('prefers the one saved in Settings', () => {
        localStorage.setItem('tmods.manifestUrl', 'https://github.com/a/b/releases/latest/download/manifest.json');
        localStorage.setItem('tmods.bundlesRepo', 'c/d');
        expect(service.bundlesRepo()).toBe('c/d');
    });

    it('is empty for a manifest hosted elsewhere', () => {
        localStorage.setItem('tmods.manifestUrl', 'https://cdn.example.com/manifest.json');
        expect(service.bundlesRepo()).toBe('');
    });
});

describe('publishProfile', () => {
    const target = { loader: 'fabric', gameVersion: '1.21.1', loaderVersion: '0.16.5' };

    beforeEach(() => {
        exportMrpack.mockReturnValue({ data: new Uint8Array([1]), mods: 3, extraFiles: ['mine.jar'] });
        bridge.github.publish.mockResolvedValue({ commitUrl: 'c', actionsUrl: 'a' });
    });

    it('commits the exported pack and its text as a new version', async () => {
        const result = await service.publishProfile({
            repo: 'a/b',
            category: 'mods',
            version: '1.2.0',
            gameDir: '/game',
            target,
            name: 'Survival',
            description: ' Faster ',
            changelog: '- Added Sodium\n',
            includeConfig: false,
        });

        expect(exportMrpack).toHaveBeenCalledWith('/game', target, {
            name: 'Survival',
            version: '1.2.0',
            includeConfig: false,
        });
        expect(bridge.github.publish).toHaveBeenCalledWith({
            repo: 'a/b',
            category: 'mods',
            version: '1.2.0',
            files: [
                { name: 'pack.mrpack', data: new Uint8Array([1]) },
                { name: 'bundle.json', data: '{\n  "description": "Faster",\n  "changelog": "- Added Sodium"\n}\n' },
            ],
            message: 'Add mods 1.2.0 from TMods',
        });
        expect(result).toEqual({ commitUrl: 'c', actionsUrl: 'a', mods: 3, extraFiles: ['mine.jar'] });
    });

    it('leaves bundle.json out when there is no text', async () => {
        await service.publishProfile({ repo: 'a/b', category: 'mods', version: '1', gameDir: '/g', target, name: 'x' });
        expect(bridge.github.publish.mock.calls[0][0].files.map(file => file.name)).toEqual(['pack.mrpack']);
    });

    it("shows the main process's message without Electron's wrapping", async () => {
        bridge.github.publish.mockRejectedValue(
            new Error(
                "Error invoking remote method 'github:publish': Error: mods 1 is already in a/b. Pick a new version.",
            ),
        );
        await expect(
            service.publishProfile({ repo: 'a/b', category: 'mods', version: '1', gameDir: '/g', target, name: 'x' }),
        ).rejects.toThrow(/^mods 1 is already in a\/b. Pick a new version.$/);
    });
});
