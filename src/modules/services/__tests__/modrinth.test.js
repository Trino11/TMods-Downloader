import axios from 'axios';
import { search, pickVersion } from '../modrinth';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

describe('search', () => {
    beforeEach(() => {
        axios.get.mockResolvedValue({ data: { hits: [{ project_id: 'a' }], total_hits: 1 } });
    });

    it('filters mods to the loader, game version and client-side mods', async () => {
        const result = await search({ query: 'sodium', loader: 'fabric', gameVersion: '1.21.1' });

        expect(result).toEqual({ hits: [{ project_id: 'a' }], total: 1 });
        const [url, { params }] = axios.get.mock.calls[0];
        expect(url).toBe('https://api.modrinth.com/v2/search');
        expect(JSON.parse(params.facets)).toEqual([
            ['project_type:mod'],
            ['categories:fabric'],
            ['versions:1.21.1'],
            ['client_side:required', 'client_side:optional'],
        ]);
        expect(params).toMatchObject({ query: 'sodium', index: 'relevance', offset: 0 });
    });

    it('lists the most downloaded modpacks when nothing is typed', async () => {
        await search({ projectType: 'modpack' });

        const { params } = axios.get.mock.calls[0][1];
        expect(JSON.parse(params.facets)).toEqual([['project_type:modpack']]);
        expect(params.index).toBe('downloads');
    });
});

describe('pickVersion', () => {
    it('takes the newest release, else the newest version', () => {
        expect(pickVersion([{ id: 'b', version_type: 'beta' }, { id: 'r', version_type: 'release' }]).id).toBe('r');
        expect(pickVersion([{ id: 'b', version_type: 'beta' }]).id).toBe('b');
        expect(pickVersion([])).toBeUndefined();
    });
});
