import axios from 'axios';
import { incompatible, makeVersion, required, serveModrinth } from '../__fixtures__/modrinthFake';
import { installBridge, removeBridge } from '../__fixtures__/bridge';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');

let home;
let gameDir;
let mods;
let compat;

const target = { loader: 'fabric', gameVersion: '1.21.1' };

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-compat-'));
    gameDir = path.join(home, 'game');
    fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
    installBridge(home);
    jest.isolateModules(() => {
        mods = require('../modrinthMods');
        compat = require('../modCompat');
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

function modFiles() {
    return fs.readdirSync(path.join(gameDir, 'mods')).sort();
}

// Drops a version's jar into mods/ as if the player copied it there.
function addByHand(version, name = version.files[0].filename) {
    fs.writeFileSync(path.join(gameDir, 'mods', name), version.data);
}

const fabricApi = makeVersion('fabric-api', '0.100.0');
const sodium = makeVersion('sodium', '0.6.0', { deps: [required('fabric-api')] });
const iris = makeVersion('iris', '1.8.0', { gameVersions: ['1.21.1'] });
const oldIris = makeVersion('iris', '1.6.0', { gameVersions: ['1.20', '1.20.1'] });
const forgeOnly = makeVersion('create', '0.5.1', { loaders: ['forge'], gameVersions: ['1.21.1'] });
const optifabric = makeVersion('optifabric', '1.0.0', { deps: [incompatible('sodium')] });

function serve() {
    serveModrinth(axios, {
        'fabric-api': { title: 'Fabric API', versions: [fabricApi] },
        sodium: { title: 'Sodium', versions: [sodium] },
        iris: { title: 'Iris', versions: [iris, oldIris] },
        create: { title: 'Create', versions: [forgeOnly] },
        optifabric: { title: 'OptiFabric', versions: [optifabric] },
    });
}

describe('checkCompatibility', () => {
    it('finds nothing wrong with mods installed for the profile', async () => {
        serve();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        expect(await compat.checkCompatibility(gameDir, target)).toEqual([]);
    });

    it('flags a mod built for another Minecraft version and switches it to one that fits', async () => {
        serve();
        addByHand(oldIris);
        await mods.adoptUnmanaged(gameDir);

        const [problem, ...rest] = await compat.checkCompatibility(gameDir, target);

        expect(rest).toEqual([]);
        expect(problem.kind).toBe('mismatch');
        expect(problem.mod.title).toBe('Iris');
        expect(problem.message).toBe('Made for Minecraft 1.20, 1.20.1, but this profile plays 1.21.1.');
        expect(problem.fix.label).toBe('Switch to 1.8.0');

        expect(await compat.applyFix(gameDir, target, problem)).toBe('Switched Iris to 1.8.0.');
        expect(modFiles()).toEqual(['iris-1.8.0.jar']);
        expect(await compat.checkCompatibility(gameDir, target)).toEqual([]);
    });

    it('flags a hand-added jar for another loader and can disable it', async () => {
        serve();
        addByHand(forgeOnly);

        const [problem] = await compat.checkCompatibility(gameDir, target);

        expect(problem.mod).toEqual({
            projectId: 'create',
            fileName: 'create-0.5.1.jar',
            tracked: false,
            title: 'Create',
        });
        expect(problem.message).toBe('Made for Forge, but this profile uses Fabric.');
        expect(problem.fix.label).toBe('Disable');

        await compat.applyFix(gameDir, target, problem);
        expect(modFiles()).toEqual(['create-0.5.1.jar.disabled']);
        expect(await compat.checkCompatibility(gameDir, target)).toEqual([]);
    });

    it('lets Quilt profiles use Fabric mods', async () => {
        serve();
        addByHand(iris);

        expect(await compat.checkCompatibility(gameDir, { loader: 'quilt', gameVersion: '1.21.1' })).toEqual([]);
    });

    it('offers to install a missing required mod as a dependency', async () => {
        serve();
        addByHand(sodium);
        await mods.adoptUnmanaged(gameDir);

        const [problem] = await compat.checkCompatibility(gameDir, target);

        expect(problem.kind).toBe('missing');
        expect(problem.message).toBe("Needs Fabric API, which isn't installed.");
        expect(problem.fix.label).toBe('Install Fabric API');

        expect(await compat.applyFix(gameDir, target, problem)).toBe('Installed Fabric API.');
        const api = mods.readModList(gameDir).mods.find(mod => mod.projectId === 'fabric-api');
        expect(api.asDependency).toBe(true);
        expect(await compat.checkCompatibility(gameDir, target)).toEqual([]);
    });

    it('mentions unknown hand-added jars when a required mod seems missing', async () => {
        serve();
        addByHand(sodium);
        fs.writeFileSync(path.join(gameDir, 'mods', 'fabric-api-from-curseforge.jar'), 'not on modrinth');

        const [problem] = await compat.checkCompatibility(gameDir, target);

        expect(problem.message).toMatch(/If you added it by hand from another site, you can ignore this\.$/);
    });

    it('offers to enable a required mod that is disabled', async () => {
        serve();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        mods.setModEnabled(gameDir, 'fabric-api', false);

        const [problem] = await compat.checkCompatibility(gameDir, target);

        expect(problem.kind).toBe('disabled');
        expect(problem.mod.projectId).toBe('sodium');
        expect(problem.fix.label).toBe('Enable Fabric API');
        expect(await compat.applyFix(gameDir, target, problem)).toBe('Enabled Fabric API.');
        expect(mods.readModList(gameDir).mods.every(mod => mod.enabled)).toBe(true);
    });

    it('ignores problems of mods that are turned off', async () => {
        serve();
        addByHand(oldIris, 'iris-1.6.0.jar.disabled');

        expect(await compat.checkCompatibility(gameDir, target)).toEqual([]);
    });

    it('flags mods that say they do not work together', async () => {
        serve();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');
        addByHand(optifabric);

        const [problem] = await compat.checkCompatibility(gameDir, target);

        expect(problem.kind).toBe('incompatible');
        expect(problem.mod.title).toBe('OptiFabric');
        expect(problem.message).toBe("Doesn't work together with Sodium.");
        expect(problem.fix.type).toBe('disableFile');
    });
});

describe('checkBeforeInstall', () => {
    it('has nothing to say about a mod that fits', async () => {
        serve();

        expect(await compat.checkBeforeInstall(gameDir, target, 'sodium')).toEqual([]);
    });

    it('warns when the new mod clashes with an installed one, in either direction', async () => {
        serve();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        expect(await compat.checkBeforeInstall(gameDir, target, 'optifabric')).toEqual([
            "It says it doesn't work together with Sodium, which is installed.",
        ]);

        mods.removeMod(gameDir, 'sodium');
        await mods.installMod(gameDir, target, 'optifabric', 'OptiFabric');
        expect(await compat.checkBeforeInstall(gameDir, target, 'sodium')).toEqual([
            "OptiFabric, which is installed, says it doesn't work together with this mod.",
        ]);
    });

    it('lets the player install a clashing mod after the warning', async () => {
        serve();
        await mods.installMod(gameDir, target, 'sodium', 'Sodium');

        await expect(mods.installMod(gameDir, target, 'optifabric', 'OptiFabric')).rejects.toThrow(
            "It doesn't work together with Sodium.",
        );
        await mods.installMod(gameDir, target, 'optifabric', 'OptiFabric', { allowIncompatible: true });
        expect(modFiles()).toContain('optifabric-1.0.0.jar');
    });
});
