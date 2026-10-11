import { buildVersionOptions, fetchMojangVersions, readCachedVersions } from '../gameVersions';

describe('Mojang version manifest', () => {
    let versions;

    beforeAll(async () => {
        versions = await fetchMojangVersions();
    });

    test('lists versions newest first with the types the picker knows', () => {
        expect(versions.length).toBeGreaterThan(500);
        const types = new Set(versions.map(version => version.type));
        expect([...types].sort()).toEqual(['old_alpha', 'old_beta', 'release', 'snapshot']);
        expect(versions[versions.length - 1].type).toBe('old_alpha');
    });

    test('includes the versions the other checks use', () => {
        expect(versions).toContainEqual({ id: '1.21.1', type: 'release' });
        expect(versions).toContainEqual({ id: '1.7.10', type: 'release' });
    });

    test('is cached for offline use and turns into picker options', () => {
        expect(readCachedVersions()).toEqual(versions);
        const options = buildVersionOptions(versions, []);
        expect(options.slice(0, 2).map(option => option.type)).toEqual(['alias', 'alias']);
        expect(options).toHaveLength(versions.length + 2);
    });
});
