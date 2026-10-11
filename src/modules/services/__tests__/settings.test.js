import { getManifestUrl, setManifestUrl } from '../settings';

describe('settings', () => {
    it('returns an empty string when no manifest URL was saved', () => {
        expect(getManifestUrl()).toBe('');
    });

    it('saves the manifest URL under tmods.manifestUrl', () => {
        setManifestUrl('https://example.com/manifest.json');
        expect(localStorage.getItem('tmods.manifestUrl')).toBe('https://example.com/manifest.json');
        expect(getManifestUrl()).toBe('https://example.com/manifest.json');
    });

    it('overwrites a previously saved URL', () => {
        setManifestUrl('https://old.example.com/manifest.json');
        setManifestUrl('https://new.example.com/manifest.json');
        expect(getManifestUrl()).toBe('https://new.example.com/manifest.json');
    });
});
