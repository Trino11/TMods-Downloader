import {
    activeManifest,
    activeManifestUrl,
    addManifest,
    listManifests,
    profileManifest,
    removeManifest,
    suggestedName,
    updateManifest,
} from '../manifests';
import { setProfileManifest } from '../profiles';

describe('saved manifests', () => {
    it('is empty when nothing was saved', () => {
        expect(listManifests()).toEqual([]);
        expect(activeManifest()).toBeNull();
        expect(activeManifestUrl()).toBe('');
    });

    it('moves the single URL older versions saved into the list', () => {
        localStorage.setItem(
            'tmods.manifestUrl',
            'https://github.com/Trino11/TMods-bundles/releases/latest/download/manifest.json',
        );
        expect(listManifests()).toEqual([
            {
                id: 'manifest-1',
                name: 'Trino11/TMods-bundles',
                url: 'https://github.com/Trino11/TMods-bundles/releases/latest/download/manifest.json',
            },
        ]);
        expect(JSON.parse(localStorage.getItem('tmods.manifests'))).toHaveLength(1);
    });

    it('adds manifests with a name, suggesting one when left empty', () => {
        const first = addManifest({ name: '', url: '  https://cdn.example.com/manifest.json ' });
        const second = addManifest({ name: ' Survival ', url: 'https://other.example.com/m.json' });
        expect(first).toEqual({
            id: 'manifest-1',
            name: 'cdn.example.com',
            url: 'https://cdn.example.com/manifest.json',
        });
        expect(second).toEqual({ id: 'manifest-2', name: 'Survival', url: 'https://other.example.com/m.json' });
        expect(listManifests()).toEqual([first, second]);
    });

    it('refuses a manifest without a URL', () => {
        expect(() => addManifest({ name: 'x', url: ' ' })).toThrow('Enter the manifest URL.');
    });

    it('edits a manifest in place', () => {
        const { id } = addManifest({ url: 'https://a.example.com/m.json' });
        updateManifest(id, { name: 'A', url: 'https://b.example.com/m.json' });
        expect(listManifests()).toEqual([{ id, name: 'A', url: 'https://b.example.com/m.json' }]);
    });

    it('never removes the last manifest', () => {
        const { id } = addManifest({ url: 'https://a.example.com/m.json' });
        expect(() => removeManifest(id)).toThrow('TMods needs at least one');
        expect(listManifests()).toHaveLength(1);
    });

    it('gives new ids that never clash with a removed one', () => {
        addManifest({ url: 'https://a.example.com/m.json' });
        const b = addManifest({ url: 'https://b.example.com/m.json' });
        removeManifest('manifest-1');
        expect(addManifest({ url: 'https://c.example.com/m.json' }).id).not.toBe(b.id);
    });
});

describe('the manifest a profile follows', () => {
    let first;
    let second;
    beforeEach(() => {
        first = addManifest({ url: 'https://a.example.com/m.json' });
        second = addManifest({ url: 'https://b.example.com/m.json' });
    });

    it('is the first one when the profile never picked', () => {
        expect(profileManifest({ id: 'x' })).toEqual(first);
        expect(activeManifestUrl()).toBe(first.url);
    });

    it('is the one the profile picked', () => {
        expect(profileManifest({ id: 'x', manifestId: second.id })).toEqual(second);
        setProfileManifest('default', second.id);
        expect(activeManifest()).toEqual(second);
    });

    it('goes back to the first one when the picked manifest is removed', () => {
        setProfileManifest('default', second.id);
        removeManifest(second.id);
        expect(activeManifest()).toEqual(first);
    });
});

it('names GitHub release manifests after their repository', () => {
    expect(suggestedName('https://github.com/a/b/releases/latest/download/manifest.json')).toBe('a/b');
    expect(suggestedName('https://cdn.trinohost.com/tmods/manifest.json')).toBe('cdn.trinohost.com');
});
