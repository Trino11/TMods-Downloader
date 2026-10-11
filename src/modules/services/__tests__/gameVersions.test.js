import axios from 'axios';
import {
    VERSION_MANIFEST_URL,
    buildVersionOptions,
    fetchMojangVersions,
    filterVersionOptions,
    readCachedVersions,
    versionLabel,
} from '../gameVersions';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../profiles', () => ({
    LATEST_RELEASE: 'latest-release',
    LATEST_SNAPSHOT: 'latest-snapshot',
    listGameVersions: jest.fn(() => ['latest-release', 'latest-snapshot']),
}));

const mojang = [
    { id: '24w14a', type: 'snapshot' },
    { id: '1.21', type: 'release' },
    { id: '1.20.1', type: 'release' },
    { id: 'b1.7.3', type: 'old_beta' },
    { id: 'a1.0.4', type: 'old_alpha' },
];

beforeEach(() => {
    localStorage.clear();
});

describe('fetchMojangVersions', () => {
    it("reads Mojang's list and caches it for offline use", async () => {
        axios.get.mockResolvedValue({
            data: { latest: {}, versions: mojang.map(v => ({ ...v, url: 'x', sha1: 'y' })) },
        });

        await expect(fetchMojangVersions()).resolves.toEqual(mojang);

        expect(axios.get).toHaveBeenCalledWith(VERSION_MANIFEST_URL);
        expect(readCachedVersions()).toEqual(mojang);
    });

    it('rejects an unexpected response and keeps the old cache', async () => {
        localStorage.setItem('tmods.versionManifest', JSON.stringify(mojang));
        axios.get.mockResolvedValue({ data: '<html>' });

        await expect(fetchMojangVersions()).rejects.toThrow('unexpected format');
        expect(readCachedVersions()).toEqual(mojang);
    });

    it('has no cache before the first fetch or when it is corrupt', () => {
        expect(readCachedVersions()).toEqual([]);
        localStorage.setItem('tmods.versionManifest', '{bad');
        expect(readCachedVersions()).toEqual([]);
    });
});

describe('buildVersionOptions', () => {
    it('lists aliases, then installed loaders, then every Mojang version newest first', () => {
        const installed = ['latest-release', 'latest-snapshot', 'fabric-loader-0.16.5-1.21', '1.20.1'];

        const options = buildVersionOptions(mojang, installed);

        expect(options.map(o => o.id)).toEqual([
            'latest-release',
            'latest-snapshot',
            'fabric-loader-0.16.5-1.21',
            '24w14a',
            '1.21',
            '1.20.1',
            'b1.7.3',
            'a1.0.4',
        ]);
        expect(options.find(o => o.id === '1.20.1')).toEqual({ id: '1.20.1', type: 'release', installed: true });
        expect(options.find(o => o.id === '1.21').installed).toBe(false);
    });

    it("falls back to installed versions when Mojang's list is unavailable", () => {
        const options = buildVersionOptions([], ['latest-release', 'latest-snapshot', '1.20.1']);

        expect(options.map(o => o.id)).toEqual(['latest-release', 'latest-snapshot', '1.20.1']);
    });
});

describe('filterVersionOptions', () => {
    const options = buildVersionOptions(mojang, ['latest-release', 'latest-snapshot', 'fabric-loader-0.16.5-1.21']);

    it('shows releases, aliases and installed versions by default', () => {
        expect(filterVersionOptions(options).map(o => o.id)).toEqual([
            'latest-release',
            'latest-snapshot',
            'fabric-loader-0.16.5-1.21',
            '1.21',
            '1.20.1',
        ]);
    });

    it('adds snapshots and old versions on request', () => {
        expect(filterVersionOptions(options, { showAll: true })).toHaveLength(options.length);
    });

    it('searches anywhere in the id', () => {
        expect(filterVersionOptions(options, { query: ' 1.21 ' }).map(o => o.id)).toEqual([
            'fabric-loader-0.16.5-1.21',
            '1.21',
        ]);
        expect(filterVersionOptions(options, { query: 'B1', showAll: true }).map(o => o.id)).toEqual(['b1.7.3']);
    });

    it('never hides the version already picked', () => {
        expect(filterVersionOptions(options, { query: '1.20', keep: '24w14a' }).map(o => o.id)).toEqual([
            '24w14a',
            '1.20.1',
        ]);
    });
});

it('labels versions readably', () => {
    expect(versionLabel({ id: 'latest-release', type: 'alias' })).toBe('Latest release');
    expect(versionLabel({ id: 'latest-snapshot', type: 'alias' })).toBe('Latest snapshot');
    expect(versionLabel({ id: '1.21', type: 'release', installed: false })).toBe('1.21');
    expect(versionLabel({ id: '1.21', type: 'release', installed: true })).toBe('1.21 (installed)');
    expect(versionLabel({ id: '24w14a', type: 'snapshot', installed: false })).toBe('24w14a (snapshot)');
    expect(versionLabel({ id: 'b1.7.3', type: 'old_beta', installed: true })).toBe('b1.7.3 (beta, installed)');
});
