import axios from 'axios';
import {
    changelogEntries,
    fetchChannelUpdates,
    fetchLatestPack,
    fetchLatestVersions,
    fetchVersions,
    latestVersion,
    RETRY_DELAYS_MS,
    validateManifestUrl,
    versionsSince,
} from '../manifest';
import { setManifestUrl } from '../settings';

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
        setManifestUrl('https://example.com/manifest.json');
    });

    it('fetches the saved manifest URL and returns the category versions', async () => {
        axios.get.mockResolvedValue({ data: manifest });
        await expect(fetchVersions('mods')).resolves.toEqual(manifest.versions.mods);
        expect(axios.get).toHaveBeenCalledWith('https://example.com/manifest.json');
    });

    it('returns an empty list for a category the manifest does not have', async () => {
        axios.get.mockResolvedValue({ data: manifest });
        await expect(fetchVersions('shaderpacks')).resolves.toEqual([]);
    });
});

describe('latestVersion', () => {
    const versions = { mods: [{ id: '1.9.0' }, { id: '1.10.0' }, { id: '1.2.0' }] };
    const published = { mods: versions.mods.map(version => ({ ...version, source: 'x' })) };

    it('picks the highest version number, whatever order the manifest lists them in', () => {
        expect(latestVersion({ versions }, 'mods')).toEqual({ id: '1.10.0' });
    });

    it('ignores a stale latest key in a hand-made manifest', () => {
        expect(latestVersion({ versions, latest: { mods: '1.2.0' } }, 'mods')).toEqual({ id: '1.10.0' });
    });

    it('uses the version a published manifest names as latest', () => {
        expect(latestVersion({ versions: published, latest: { mods: '1.9.0' } }, 'mods').id).toBe('1.9.0');
        expect(latestVersion({ versions: published, latest: { mods: { id: '1.9.0' } } }, 'mods').id).toBe('1.9.0');
        expect(latestVersion({ versions: published, latest: { mods: 'gone' } }, 'mods').id).toBe('1.10.0');
    });

    it('is null for a category with no versions', () => {
        expect(latestVersion({ versions }, 'shaderpacks')).toBeNull();
    });
});

it('fetchLatestVersions reads the manifest once for every category', async () => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: { versions: { mods: [{ id: '1.0' }] } } });
    setManifestUrl('https://example.com/manifest.json');

    await expect(fetchLatestVersions(['mods', 'configs'])).resolves.toEqual({ mods: { id: '1.0' }, configs: null });
    expect(axios.get).toHaveBeenCalledTimes(1);
});

it('fetchLatestPack picks the pack the manifest names as latest', async () => {
    axios.get.mockReset();
    // Only manifests the publish action wrote (versions carry a `source`) are trusted to name `latest`.
    const packs = [
        { id: '1.1.0-beta', source: 'packs/1.1.0-beta.mrpack' },
        { id: '1.0.0', source: 'packs/1.0.0.mrpack' },
    ];
    axios.get.mockResolvedValue({ data: { latest: { packs: '1.0.0' }, versions: { packs } } });
    setManifestUrl('https://example.com/manifest.json');

    await expect(fetchLatestPack()).resolves.toEqual(packs[1]);
});

it('fetchLatestPack is null when the channel has no packs', async () => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: { versions: { mods: [{ id: '1.0' }] } } });
    setManifestUrl('https://example.com/manifest.json');

    await expect(fetchLatestPack()).resolves.toBeNull();
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

    it('stops at the version a published manifest names as latest', () => {
        const published = { versions: { mods: [v3, v2, v1].map(version => ({ ...version, source: 'x' })) } };
        expect(versionsSince({ ...published, latest: { mods: '2.0' } }, 'mods', '1.0').map(v => v.id)).toEqual(['2.0']);
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
        setManifestUrl('https://example.com/manifest.json');

        await expect(fetchChannelUpdates({ mods: '1.0', configs: '' })).resolves.toEqual({
            mods: { latest: v3, changes: [{ id: '3.0', label: '3.0', text: 'Adds shaders' }] },
            configs: { latest: null, changes: [] },
        });
        await expect(fetchChannelUpdates({ mods: '3.0' })).resolves.toEqual({ mods: { latest: v3, changes: [] } });
    });
});
