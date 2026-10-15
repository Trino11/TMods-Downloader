import axios from 'axios';
import {
    changelogEntries,
    fetchChannelUpdates,
    fetchPackUpdates,
    fetchLatestVersions,
    fetchVersions,
    isPackSet,
    latestVersion,
    RETRY_DELAYS_MS,
    validateManifestUrl,
    versionsSince,
} from '../manifest';
import { addManifest } from '../manifests';
import { setProfileManifest } from '../profiles';

jest.mock('axios', () => ({ get: jest.fn() }));

// No waiting between retries in tests.
RETRY_DELAYS_MS.fill(0);

const httpError = status =>
    Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });

const manifest = {
    versions: {
        mods: [{ id: '1.0', url: 'https://example.com/mods.zip' }],
    },
};

describe('validateManifestUrl', () => {
    beforeEach(() => {
        axios.get.mockReset();
    });

    it('accepts a URL that serves a manifest with versions', async () => {
        axios.get.mockResolvedValue({ data: manifest });
        await expect(validateManifestUrl('https://example.com/manifest.json')).resolves.toBeUndefined();
        expect(axios.get).toHaveBeenCalledWith('https://example.com/manifest.json');
    });

    it('rejects text that is not a URL without fetching it', async () => {
        await expect(validateManifestUrl('not a url')).rejects.toThrow('That is not a valid URL.');
        expect(axios.get).not.toHaveBeenCalled();
    });

    it.each(['ftp://example.com/manifest.json', 'file:///C:/manifest.json'])(
        'rejects the non-http URL %s',
        async url => {
            await expect(validateManifestUrl(url)).rejects.toThrow('The URL must start with http:// or https://.');
            expect(axios.get).not.toHaveBeenCalled();
        },
    );

    it('reports a failed download after trying again', async () => {
        axios.get.mockRejectedValue(new Error('Network Error'));
        await expect(validateManifestUrl('https://example.com/manifest.json')).rejects.toThrow(
            'Could not load the manifest: Network Error',
        );
        expect(axios.get).toHaveBeenCalledTimes(3);
    });

    it('tries again when the server has a hiccup', async () => {
        axios.get.mockRejectedValueOnce(httpError(504)).mockResolvedValueOnce({ data: manifest });
        await expect(validateManifestUrl('https://example.com/manifest.json')).resolves.toBeUndefined();
        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it('explains a server error that does not go away', async () => {
        axios.get.mockRejectedValue(httpError(504));
        await expect(validateManifestUrl('https://example.com/manifest.json')).rejects.toThrow(
            'Could not load the manifest: The server did not answer properly (status 504). This is usually temporary',
        );
    });

    it('explains a missing manifest without trying again', async () => {
        axios.get.mockRejectedValue(httpError(404));
        await expect(validateManifestUrl('https://example.com/manifest.json')).rejects.toThrow(
            'Could not load the manifest: Nothing was found at that address (404).',
        );
        expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['an HTML page', '<html></html>'],
        ['an empty body', ''],
        ['JSON without versions', { name: 'something else' }],
        ['versions that is not an object', { versions: 'mods' }],
    ])('rejects %s', async (_, data) => {
        axios.get.mockResolvedValue({ data });
        await expect(validateManifestUrl('https://example.com/manifest.json')).rejects.toThrow('not a TMods manifest');
    });
});

describe('fetchVersions', () => {
    beforeEach(() => {
        axios.get.mockReset();
        addManifest({ url: 'https://example.com/manifest.json' });
    });

    it('fetches the saved manifest URL and returns the category versions', async () => {
        axios.get.mockResolvedValue({ data: manifest });
        await expect(fetchVersions('mods')).resolves.toEqual(manifest.versions.mods);
        expect(axios.get).toHaveBeenCalledWith('https://example.com/manifest.json');
    });

    it('fetches the manifest the current profile follows', async () => {
        const second = addManifest({ name: 'Server', url: 'https://other.example.com/manifest.json' });
        setProfileManifest('default', second.id);
        axios.get.mockResolvedValue({ data: manifest });
        await fetchVersions('mods');
        expect(axios.get).toHaveBeenCalledWith('https://other.example.com/manifest.json');
    });

    it('returns an empty list for a category the manifest does not have', async () => {
        axios.get.mockResolvedValue({ data: manifest });
        await expect(fetchVersions('shaderpacks')).resolves.toEqual([]);
    });
});

describe('latestVersion', () => {
    const versions = { mods: [{ id: '1.9.0' }, { id: '1.10.0' }, { id: '1.2.0' }] };

    it('picks the highest version number, whatever order the manifest lists them in', () => {
        expect(latestVersion({ versions }, 'mods')).toEqual({ id: '1.10.0' });
    });

    it('ignores a latest key some old manifests still carry', () => {
        expect(latestVersion({ versions, latest: { mods: '1.2.0' } }, 'mods')).toEqual({ id: '1.10.0' });
    });

    it('is null for a category with no versions', () => {
        expect(latestVersion({ versions }, 'shaderpacks')).toBeNull();
    });
});

it('fetchLatestVersions reads the manifest once for every category', async () => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: { versions: { mods: [{ id: '1.0' }] } } });
    addManifest({ url: 'https://example.com/manifest.json' });

    await expect(fetchLatestVersions(['mods', 'configs'])).resolves.toEqual({ mods: { id: '1.0' }, configs: null });
    expect(axios.get).toHaveBeenCalledTimes(1);
});

describe('fetchPackUpdates', () => {
    const packs = [
        { id: '1.0.0', changelog: 'First' },
        { id: '1.2.0', changelog: 'Adds shaders' },
        { id: '1.1.0', changelog: 'Fixes' },
    ];

    beforeEach(() => {
        axios.get.mockReset();
        axios.get.mockResolvedValue({ data: { versions: { packs } } });
        addManifest({ url: 'https://example.com/manifest.json' });
    });

    it('lists the packs newest first and picks the highest version number', async () => {
        const result = await fetchPackUpdates();
        expect(result.packs.map(pack => pack.id)).toEqual(['1.2.0', '1.1.0', '1.0.0']);
        expect(result.latest).toEqual(packs[1]);
        expect(result.outdated).toBe(false);
        expect(result.changes).toEqual([{ id: '1.2.0', label: '1.2.0', text: 'Adds shaders' }]);
    });

    it('lists packs that are sets of category versions with the older .mrpack ones', async () => {
        const sets = [
            { id: '2.0.0', versions: { mods: '2.1.1' }, changelog: 'Now a set' },
            { id: 'broken', url: 'not a set' },
        ];
        axios.get.mockResolvedValue({ data: { versions: { packs }, packSets: sets } });
        const result = await fetchPackUpdates('1.1.0');
        expect(result.packs.map(pack => pack.id)).toEqual(['2.0.0', '1.2.0', '1.1.0', '1.0.0']);
        expect(isPackSet(result.latest)).toBe(true);
        expect(isPackSet(packs[0])).toBe(false);
        expect(result.changes.map(entry => entry.id)).toEqual(['2.0.0', '1.2.0']);
    });

    it('says an older installed pack is outdated, with the changelogs of what updating brings', async () => {
        const result = await fetchPackUpdates('1.0.0');
        expect(result.installed).toBe('1.0.0');
        expect(result.outdated).toBe(true);
        expect(result.changes.map(entry => entry.id)).toEqual(['1.2.0', '1.1.0']);
    });

    it('says the latest installed pack is up to date', async () => {
        const result = await fetchPackUpdates('1.2.0');
        expect(result.outdated).toBe(false);
        expect(result.changes.map(entry => entry.id)).toEqual(['1.2.0']);
    });

    it('is empty when the channel has no packs', async () => {
        axios.get.mockResolvedValue({ data: { versions: { mods: [{ id: '1.0' }] } } });
        await expect(fetchPackUpdates('1.0.0')).resolves.toEqual({
            packs: [],
            latest: null,
            installed: '1.0.0',
            pinned: false,
            newer: false,
            outdated: false,
            changes: [],
        });
    });

    it("doesn't offer a newer pack to a profile that keeps its version, but says one is out", async () => {
        const result = await fetchPackUpdates('1.0.0', true);
        expect(result.pinned).toBe(true);
        expect(result.newer).toBe(true);
        expect(result.outdated).toBe(false);
        expect(result.changes.map(entry => entry.id)).toEqual(['1.2.0', '1.1.0']);
    });

    it('keeps nothing when the profile has no pack', async () => {
        const result = await fetchPackUpdates(null, true);
        expect(result.pinned).toBe(false);
    });
});

describe('changelogs', () => {
    const v3 = { id: '3.0', changelog: 'Adds shaders' };
    const v2 = { id: '2.0', changelog: '  ' };
    const v1 = { id: '1.0', changelog: 'First' };
    const manifest = { versions: { mods: [v3, v2, v1] } };

    it('lists the versions newer than the installed one, newest first', () => {
        expect(versionsSince(manifest, 'mods', '1.0')).toEqual([v3, v2]);
        expect(versionsSince(manifest, 'mods', '2.0')).toEqual([v3]);
    });

    it('works on manifests listed oldest first', () => {
        expect(versionsSince({ versions: { mods: [v1, v2, v3] } }, 'mods', '1.0')).toEqual([v3, v2]);
    });

    it('falls back to the latest version when the installed one is not listed', () => {
        expect(versionsSince(manifest, 'mods', '')).toEqual([v3]);
        expect(versionsSince(manifest, 'mods', 'gone')).toEqual([v3]);
        expect(versionsSince(manifest, 'shaderpacks', '1.0')).toEqual([]);
    });

    it('keeps only versions with a text changelog', () => {
        expect(changelogEntries([v3, v2, { id: '0.9', changelog: { html: '<b>x</b>' } }, { id: '0.8' }])).toEqual([
            { id: '3.0', label: '3.0', text: 'Adds shaders' },
        ]);
    });

    it('fetchChannelUpdates returns the latest version and the changelogs since the installed one', async () => {
        axios.get.mockReset();
        axios.get.mockResolvedValue({ data: manifest });
        addManifest({ url: 'https://example.com/manifest.json' });

        await expect(fetchChannelUpdates({ mods: '1.0', configs: '' })).resolves.toEqual({
            mods: { latest: v3, changes: [{ id: '3.0', label: '3.0', text: 'Adds shaders' }] },
            configs: { latest: null, changes: [] },
        });
        await expect(fetchChannelUpdates({ mods: '3.0' })).resolves.toEqual({ mods: { latest: v3, changes: [] } });
    });
});
