import {
    getProjects,
    getProjectVersions,
    latestVersionsFromHashes,
    pickVersion,
    primaryFile,
    search,
    versionsFromHashes,
    PAGE_SIZE,
} from '../modrinth';
import { checkUpdates, downloadVerified, installMod, readModList, sha1 } from '../modrinthMods';
import { readIndex } from '../mrpack';
import { zip } from '../node';
import { FABRIC_API, GAME_VERSION } from './constants';

const fs = require('fs');
const os = require('os');
const path = require('path');

const target = { loader: 'fabric', gameVersion: GAME_VERSION };

describe('Modrinth API', () => {
    let fabricApi;
    let version;

    beforeAll(async () => {
        const { hits } = await search({ query: 'fabric api', ...target });
        fabricApi = hits.find(hit => hit.slug === FABRIC_API);
        const versions = await getProjectVersions(fabricApi.project_id, target);
        version = pickVersion(versions);
    });

    test('search finds client mods for a loader and game version', async () => {
        const { hits, total } = await search({ ...target });
        expect(total).toBeGreaterThan(1000);
        expect(hits).toHaveLength(PAGE_SIZE);
        for (const hit of hits) {
            expect(hit.project_type).toBe('mod');
            expect(hit.categories).toContain('fabric');
            expect(hit.versions).toContain(GAME_VERSION);
            expect(hit.client_side).not.toBe('unsupported');
        }
        expect(fabricApi).toBeDefined();
    });

    test('search pages through results', async () => {
        const first = await search({ ...target });
        const second = await search({ ...target, offset: PAGE_SIZE });
        const firstIds = new Set(first.hits.map(hit => hit.project_id));
        expect(second.hits.some(hit => firstIds.has(hit.project_id))).toBe(false);
    });

    test('project versions are filtered to the loader and game version', async () => {
        const versions = await getProjectVersions(fabricApi.project_id, target);
        expect(versions.length).toBeGreaterThan(0);
        for (const v of versions) {
            expect(v.loaders).toContain('fabric');
            expect(v.game_versions).toContain(GAME_VERSION);
        }
        expect(version.version_type).toBe('release');
        const file = primaryFile(version);
        expect(file.filename).toMatch(/\.jar$/);
        expect(file.hashes).toEqual(expect.objectContaining({ sha1: expect.any(String), sha512: expect.any(String) }));
    });

    test('projects can be looked up by id', async () => {
        const [project] = await getProjects([fabricApi.project_id]);
        expect(project).toMatchObject({ id: fabricApi.project_id, slug: FABRIC_API, title: fabricApi.title });
    });

    test('files are found by hash, and updates by hash', async () => {
        const file = primaryFile(version);
        const data = await downloadVerified([file.url], file.hashes);
        expect(sha1(data)).toBe(file.hashes.sha1);

        const byHash = await versionsFromHashes([file.hashes.sha1]);
        expect(byHash[file.hashes.sha1]).toMatchObject({ id: version.id, project_id: fabricApi.project_id });

        const latest = await latestVersionsFromHashes([file.hashes.sha1], target);
        expect(latest[file.hashes.sha1].project_id).toBe(fabricApi.project_id);
        expect(latest[file.hashes.sha1].game_versions).toContain(GAME_VERSION);
    });

    describe('installing into a game folder', () => {
        let gameDir;

        beforeEach(() => {
            gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-live-modrinth-'));
        });

        afterEach(() => {
            if (gameDir) {
                fs.rmSync(gameDir, { recursive: true, force: true });
            }
        });

        test('installs a mod with its required dependencies and finds no update for it', async () => {
            // Mod Menu needs Fabric API on Modrinth, so this also resolves a dependency.
            const { hits } = await search({ query: 'mod menu', ...target });
            const modMenu = hits.find(hit => hit.slug === 'modmenu');
            const titles = await installMod(gameDir, target, modMenu.project_id, modMenu.title);
            expect(titles[0]).toBe(modMenu.title);

            const { mods } = readModList(gameDir);
            expect(mods.map(mod => mod.projectId)).toEqual(
                expect.arrayContaining([modMenu.project_id, fabricApi.project_id]),
            );
            for (const mod of mods) {
                const jar = fs.readFileSync(path.join(gameDir, 'mods', mod.fileName));
                expect(sha1(jar)).toBe(mod.sha1);
            }
            expect(await checkUpdates(gameDir, target)).toEqual([]);
        });
    });

    test('modpacks download and read as .mrpack files', async () => {
        const { hits } = await search({ projectType: 'modpack', ...target });
        expect(hits.length).toBeGreaterThan(0);
        const pack = hits[0];
        const packVersion = pickVersion(await getProjectVersions(pack.project_id));
        const file = primaryFile(packVersion);
        expect(file.filename).toMatch(/\.mrpack$/);
        const data = await downloadVerified([file.url], file.hashes);
        const index = readIndex(zip.read(data));
        expect(index.dependencies.minecraft).toEqual(expect.any(String));
        for (const entry of index.files) {
            expect(entry.hashes.sha1).toEqual(expect.any(String));
            expect(entry.downloads.length).toBeGreaterThan(0);
        }
    });
});
