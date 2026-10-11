// The page calls these services straight from the window. Today the window runs with
// web security off, so CORS doesn't apply; once it's turned back on, every service must
// allow pages from any origin (the packaged app loads from file://, origin "null").
import axios from 'axios';
import { VERSION_MANIFEST_URL } from '../gameVersions';
import { META_URL } from '../fabric';
import { API_URL, primaryFile } from '../modrinth';
import { GAME_VERSION } from './constants';

const ORIGIN = 'null';

const GETS = [
    ['Mojang version manifest', VERSION_MANIFEST_URL],
    ['Fabric game versions', `${META_URL}/versions/game`],
    ['Fabric loader versions', `${META_URL}/versions/loader/${GAME_VERSION}`],
    ['Modrinth search', `${API_URL}/search?limit=1`],
    ['Modrinth project versions', `${API_URL}/project/fabric-api/version`],
];

describe('CORS for requests made from the app window', () => {
    test.each(GETS)('%s allows any origin', async (_name, url) => {
        const { headers } = await axios.get(url, { headers: { Origin: ORIGIN } });
        expect(headers['access-control-allow-origin']).toMatch(/^(\*|null)$/);
    });

    test('Modrinth file downloads allow any origin', async () => {
        const { data: versions } = await axios.get(`${API_URL}/project/fabric-api/version`);
        const { headers } = await axios.head(primaryFile(versions[0]).url, { headers: { Origin: ORIGIN } });
        expect(headers['access-control-allow-origin']).toMatch(/^(\*|null)$/);
    });

    // Lookups by hash are JSON POSTs, which browsers check with a preflight first.
    test.each([`${API_URL}/version_files`, `${API_URL}/version_files/update`])(
        'Modrinth %s passes the preflight for a JSON POST',
        async url => {
            const { headers } = await axios.options(url, {
                headers: {
                    Origin: ORIGIN,
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'content-type',
                },
                validateStatus: status => status < 400,
            });
            expect(headers['access-control-allow-origin']).toMatch(/^(\*|null)$/);
            expect(headers['access-control-allow-methods'] || '*').toMatch(/POST|\*/);
            expect((headers['access-control-allow-headers'] || '*').toLowerCase()).toMatch(/content-type|\*/);
        },
    );
});
