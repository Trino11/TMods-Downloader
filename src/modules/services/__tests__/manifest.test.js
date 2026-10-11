import axios from 'axios';
import { fetchLatestVersions, fetchVersions, latestVersion, validateManifestUrl } from '../manifest';
import { setManifestUrl } from '../settings';

jest.mock('axios', () => ({ get: jest.fn() }));

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

    it('reports a failed download', async () => {
        axios.get.mockRejectedValue(new Error('Network Error'));
        await expect(validateManifestUrl('https://example.com/manifest.json')).rejects.toThrow(
            'Could not load the manifest: Network Error',
        );
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
    const versions = { mods: [{ id: '1.0' }, { id: '2.0' }] };

    it('uses the version the manifest names as latest', () => {
        expect(latestVersion({ versions, latest: { mods: '2.0' } }, 'mods')).toEqual({ id: '2.0' });
        expect(latestVersion({ versions, latest: { mods: { id: '2.0' } } }, 'mods')).toEqual({ id: '2.0' });
    });

    it('falls back to the first version listed', () => {
        expect(latestVersion({ versions }, 'mods')).toEqual({ id: '1.0' });
        expect(latestVersion({ versions, latest: { mods: 'gone' } }, 'mods')).toEqual({ id: '1.0' });
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
