import axios from 'axios';
import { bridgeAdapter } from '../httpAdapter';

function clientWith(http) {
    const client = axios.create();
    client.defaults.adapter = bridgeAdapter(client, http);
    return client;
}

const ok = (data, headers = {}) => Promise.resolve({ status: 200, statusText: 'OK', headers, data });

describe('bridgeAdapter', () => {
    it('sends the full URL with its query, and parses JSON answers', async () => {
        const http = jest.fn(() => ok('{"hits":[1]}', { 'content-type': 'application/json' }));

        const { data } = await clientWith(http).get('https://api.modrinth.com/v2/search', {
            params: { query: 'sodium', limit: 20 },
        });

        expect(data).toEqual({ hits: [1] });
        expect(http).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: 'https://api.modrinth.com/v2/search?query=sodium&limit=20',
            }),
        );
    });

    it('sends POST bodies as JSON', async () => {
        const http = jest.fn(() => ok('{}'));

        await clientWith(http).post('https://api.modrinth.com/v2/version_files', { hashes: ['a'] });

        const request = http.mock.calls[0][0];
        expect(request.method).toBe('POST');
        expect(JSON.parse(request.data)).toEqual({ hashes: ['a'] });
        expect(request.headers['Content-Type']).toMatch(/application\/json/);
    });

    it('hands binary downloads back untouched', async () => {
        const bytes = new Uint8Array([80, 75, 3, 4]).buffer;
        const http = jest.fn(() => ok(bytes));

        const { data } = await clientWith(http).get('https://example.com/a.zip', { responseType: 'arraybuffer' });

        expect(data).toBe(bytes);
        expect(http.mock.calls[0][0].responseType).toBe('arraybuffer');
    });

    it('fails on error statuses, like axios does', async () => {
        const http = jest.fn(() => Promise.resolve({ status: 404, statusText: 'Not Found', headers: {}, data: '' }));

        const error = await clientWith(http)
            .get('https://example.com/missing.json')
            .catch(e => e);

        expect(error.message).toBe('Request failed with status code 404');
        expect(error.response.status).toBe(404);
    });

    it('reports a failed connection as a network error', async () => {
        const http = jest.fn(() => Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED')));

        const error = await clientWith(http)
            .get('https://nowhere.invalid/')
            .catch(e => e);

        expect(error.code).toBe('ERR_NETWORK');
        expect(error.message).toMatch(/ERR_NAME_NOT_RESOLVED/);
    });
});
