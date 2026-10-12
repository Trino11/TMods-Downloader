import { installBridge, removeBridge } from '../__fixtures__/bridge';

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

describe('publishPack', () => {
    const pack = new Uint8Array([1, 2, 3]);

    beforeEach(() => {
        bridge.github.publish.mockResolvedValue({ commitUrl: 'c', actionsUrl: 'a' });
    });

    it('commits the pack and its text as a new version of the packs category by default', async () => {
        const result = await service.publishPack({
            repo: 'a/b',
            version: '1.2.0',
            data: pack,
            description: ' Faster ',
            changelog: '- Added Sodium\n',
        });

        expect(bridge.github.publish).toHaveBeenCalledWith({
            repo: 'a/b',
            category: 'packs',
            version: '1.2.0',
            files: [
                { name: 'pack.mrpack', data: pack },
                { name: 'bundle.json', data: '{\n  "description": "Faster",\n  "changelog": "- Added Sodium"\n}\n' },
            ],
            message: 'Add packs 1.2.0 from TMods',
        });
        expect(result).toEqual({ commitUrl: 'c', actionsUrl: 'a' });
    });

    it('can publish into another category and leaves bundle.json out when there is no text', async () => {
        await service.publishPack({ repo: 'a/b', category: 'mods', version: '1', data: pack });
        const request = bridge.github.publish.mock.calls[0][0];
        expect(request.category).toBe('mods');
        expect(request.files.map(file => file.name)).toEqual(['pack.mrpack']);
    });

    it('refuses packs over the 100 MB GitHub takes', async () => {
        const big = { length: service.MAX_PACK_BYTES + 1 };
        await expect(service.publishPack({ repo: 'a/b', version: '1', data: big })).rejects.toThrow(
            /101 MB, and GitHub takes files up to 100 MB/,
        );
        expect(bridge.github.publish).not.toHaveBeenCalled();
    });

    it('offers whole packs first, then every category the main process accepts', () => {
        const { CATEGORIES } = require('../../../../public/bundlePublisher');
        expect(service.PUBLISH_CATEGORIES.map(category => category.id)).toEqual([
            'packs',
            ...CATEGORIES.filter(id => id !== 'packs'),
        ]);
    });

    it("shows the main process's message without Electron's wrapping", async () => {
        bridge.github.publish.mockRejectedValue(
            new Error(
                "Error invoking remote method 'github:publish': Error: packs 1 is already in a/b. Pick a new version.",
            ),
        );
        await expect(service.publishPack({ repo: 'a/b', version: '1', data: pack })).rejects.toThrow(
            /^packs 1 is already in a\/b. Pick a new version.$/,
        );
    });
});
