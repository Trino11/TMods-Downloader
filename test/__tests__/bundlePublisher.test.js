const fs = require('fs');
const os = require('os');
const path = require('path');
const categories = require('../../src/modules/categories').default;
const {
    CATEGORIES,
    GITHUB_CHANNELS,
    createBundlePublisher,
    registerGitHubHandlers,
} = require('../../public/bundlePublisher');

const TOKEN = 'github_pat_0123456789abcdefghij';
const REPO = 'someone/bundles';
const API = 'https://api.github.com';

let temp;
let tokenFile;

beforeEach(() => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-publisher-'));
    tokenFile = path.join(temp, 'github-token.bin');
});

afterEach(() => {
    fs.rmSync(temp, { recursive: true, force: true });
});

// Reversible "encryption", so tests can see the token never lands in plain text.
const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.from(`enc:${Buffer.from(text).toString('base64')}`),
    decryptString: data => Buffer.from(data.toString().slice(4), 'base64').toString(),
};

// A fake GitHub: `routes` maps "METHOD /path" to a response body, a status, or a function
// of the request body returning either. Unknown routes are 404s.
function fakeGitHub(routes) {
    const calls = [];
    const fetch = async (url, init) => {
        const key = `${init.method} ${url.slice(API.length)}`;
        const body = init.body === undefined ? undefined : JSON.parse(init.body);
        calls.push({ key, body, headers: init.headers });
        let route = routes[key];
        if (typeof route === 'function') {
            route = route(body);
        }
        const status = typeof route === 'number' ? route : route === undefined ? 404 : 200;
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: String(status),
            text: async () => (typeof route === 'object' ? JSON.stringify(route) : ''),
        };
    };
    return { fetch, calls };
}

function makePublisher(routes, options = {}) {
    const github = fakeGitHub(routes);
    const publisher = createBundlePublisher({
        fetch: github.fetch,
        safeStorage: options.safeStorage || safeStorage,
        fs,
        tokenFile,
        userAgent: 'TMods test',
    });
    return { publisher, calls: github.calls };
}

const repoInfo = {
    full_name: REPO,
    html_url: `https://github.com/${REPO}`,
    default_branch: 'main',
    permissions: { push: true },
};

function publishRoutes(overrides = {}) {
    let blobs = 0;
    return {
        'GET /user': { login: 'someone' },
        [`GET /repos/${REPO}`]: repoInfo,
        [`GET /repos/${REPO}/contents/bundles/mods/1.1.0?ref=main`]: 404,
        [`POST /repos/${REPO}/git/blobs`]: () => ({ sha: `blob${++blobs}` }),
        [`GET /repos/${REPO}/git/ref/heads/main`]: { object: { sha: 'head1' } },
        [`GET /repos/${REPO}/git/commits/head1`]: { tree: { sha: 'tree1' } },
        [`POST /repos/${REPO}/git/trees`]: { sha: 'tree2' },
        [`POST /repos/${REPO}/git/commits`]: { sha: 'commit2', html_url: `https://github.com/${REPO}/commit/commit2` },
        [`PATCH /repos/${REPO}/git/refs/heads/main`]: { object: { sha: 'commit2' } },
        ...overrides,
    };
}

const request = {
    repo: REPO,
    category: 'mods',
    version: '1.1.0',
    files: [
        { name: 'pack.mrpack', data: new Uint8Array([1, 2, 3]) },
        { name: 'bundle.json', data: '{"changelog":"x"}' },
    ],
};

describe('the GitHub token', () => {
    it('is checked, then saved encrypted, and never comes back out', async () => {
        const { publisher, calls } = makePublisher(publishRoutes());
        await expect(publisher.status()).resolves.toEqual({ hasToken: false, canEncrypt: true });

        await publisher.saveToken(`  ${TOKEN} `);

        expect(calls[0]).toMatchObject({ key: 'GET /user', headers: { Authorization: `Bearer ${TOKEN}` } });
        expect(fs.readFileSync(tokenFile, 'utf-8')).not.toContain(TOKEN);
        await expect(publisher.status()).resolves.toEqual({ hasToken: true });
        await expect(publisher.status(REPO)).resolves.toEqual({
            hasToken: true,
            repo: REPO,
            url: `https://github.com/${REPO}`,
        });

        publisher.forgetToken();
        await expect(publisher.status()).resolves.toEqual({ hasToken: false, canEncrypt: true });
    });

    it('is not saved when GitHub refuses it', async () => {
        const { publisher } = makePublisher({ 'GET /user': 401 });
        await expect(publisher.saveToken(TOKEN)).rejects.toThrow('GitHub refused the token');
        expect(fs.existsSync(tokenFile)).toBe(false);
    });

    it.each([['nope'], ['has spaces in it but is long enough'], [42]])('refuses %p', async token => {
        const { publisher } = makePublisher(publishRoutes());
        await expect(publisher.saveToken(token)).rejects.toThrow("doesn't look like a GitHub token");
    });

    it('is not saved when the OS cannot encrypt it', async () => {
        const { publisher } = makePublisher(publishRoutes(), {
            safeStorage: { ...safeStorage, isEncryptionAvailable: () => false },
        });
        await expect(publisher.saveToken(TOKEN)).rejects.toThrow("can't store the token encrypted");
        expect(fs.existsSync(tokenFile)).toBe(false);
    });

    it('must be able to write to the repository', async () => {
        const { publisher } = makePublisher(
            publishRoutes({ [`GET /repos/${REPO}`]: { ...repoInfo, permissions: { push: false } } }),
        );
        await publisher.saveToken(TOKEN);
        await expect(publisher.status(REPO)).rejects.toThrow('can read someone/bundles but not write to it');
    });
});

describe('publishing a version', () => {
    async function ready(routes = publishRoutes()) {
        const made = makePublisher(routes);
        await made.publisher.saveToken(TOKEN);
        made.calls.length = 0;
        return made;
    }

    it('commits the files under bundles/<category>/<version> on the default branch', async () => {
        const { publisher, calls } = await ready();

        const result = await publisher.publish(request);

        expect(result).toEqual({
            commitUrl: `https://github.com/${REPO}/commit/commit2`,
            actionsUrl: `https://github.com/${REPO}/actions`,
        });
        const body = key => calls.filter(call => call.key === key).map(call => call.body);
        expect(body(`POST /repos/${REPO}/git/blobs`)).toEqual([
            { content: Buffer.from([1, 2, 3]).toString('base64'), encoding: 'base64' },
            { content: Buffer.from('{"changelog":"x"}').toString('base64'), encoding: 'base64' },
        ]);
        expect(body(`POST /repos/${REPO}/git/trees`)).toEqual([
            {
                base_tree: 'tree1',
                tree: [
                    { path: 'bundles/mods/1.1.0/pack.mrpack', mode: '100644', type: 'blob', sha: 'blob1' },
                    { path: 'bundles/mods/1.1.0/bundle.json', mode: '100644', type: 'blob', sha: 'blob2' },
                ],
            },
        ]);
        expect(body(`POST /repos/${REPO}/git/commits`)).toEqual([
            { message: 'Add mods 1.1.0', tree: 'tree2', parents: ['head1'] },
        ]);
        expect(body(`PATCH /repos/${REPO}/git/refs/heads/main`)).toEqual([{ sha: 'commit2', force: false }]);
    });

    it('commits several categories in one commit', async () => {
        const { publisher, calls } = await ready(
            publishRoutes({ [`GET /repos/${REPO}/contents/bundles/packs/2.0.0?ref=main`]: 404 }),
        );

        await publisher.publish({
            repo: REPO,
            versions: [
                { category: 'packs', version: '2.0.0', files: [{ name: 'pack.mrpack', data: 'whole' }] },
                { category: 'mods', version: '1.1.0', files: [{ name: 'pack.mrpack', data: 'mods' }] },
            ],
        });

        const body = key => calls.filter(call => call.key === key).map(call => call.body);
        expect(body(`POST /repos/${REPO}/git/trees`)).toEqual([
            {
                base_tree: 'tree1',
                tree: [
                    { path: 'bundles/packs/2.0.0/pack.mrpack', mode: '100644', type: 'blob', sha: 'blob1' },
                    { path: 'bundles/mods/1.1.0/pack.mrpack', mode: '100644', type: 'blob', sha: 'blob2' },
                ],
            },
        ]);
        expect(body(`POST /repos/${REPO}/git/commits`)).toEqual([
            { message: 'Add packs 2.0.0, mods 1.1.0', tree: 'tree2', parents: ['head1'] },
        ]);
    });

    it("replaces the channel's server list, alone or with versions", async () => {
        const { publisher, calls } = await ready();
        const servers = [
            { name: ' Lobby ', address: 'lobby.example.com', resourcePack: 'enabled' },
            { address: 'mine.example.com:25570' },
        ];

        await publisher.publish({ repo: REPO, servers });

        const body = key => calls.filter(call => call.key === key).map(call => call.body);
        const [blob] = body(`POST /repos/${REPO}/git/blobs`);
        expect(JSON.parse(Buffer.from(blob.content, 'base64').toString())).toEqual({
            servers: [
                { name: 'Lobby', address: 'lobby.example.com', resourcePack: 'enabled' },
                { name: 'mine.example.com:25570', address: 'mine.example.com:25570' },
            ],
        });
        expect(body(`POST /repos/${REPO}/git/trees`)[0].tree).toEqual([
            { path: 'bundles/servers.json', mode: '100644', type: 'blob', sha: 'blob1' },
        ]);
        expect(body(`POST /repos/${REPO}/git/commits`)[0].message).toBe('Update the server list');

        calls.length = 0;
        await publisher.publish({ ...request, servers });
        expect(body(`POST /repos/${REPO}/git/trees`)[0].tree.map(entry => entry.path)).toEqual([
            'bundles/mods/1.1.0/pack.mrpack',
            'bundles/mods/1.1.0/bundle.json',
            'bundles/servers.json',
        ]);
        expect(body(`POST /repos/${REPO}/git/commits`)[0].message).toBe('Add mods 1.1.0, the server list');
    });

    it.each([
        ['not a list', { servers: 'x' }, 'must be a list'],
        ['a bad address', { servers: [{ name: 'a', address: 'a b' }] }, 'server address "a b"'],
        ['a repeat', { servers: [{ address: 'a.com' }, { address: 'A.com:25565' }] }, 'A.com:25565 twice'],
        ['an unknown choice', { servers: [{ address: 'a.com', resourcePack: 'maybe' }] }, 'Unknown resource pack'],
        ['nothing at all', {}, 'nothing to publish'],
    ])('refuses a server list with %s before writing anything', async (what, extra, message) => {
        const { publisher, calls } = await ready();
        await expect(publisher.publish({ repo: REPO, ...extra })).rejects.toThrow(message);
        expect(calls.some(call => call.key.startsWith('POST'))).toBe(false);
    });

    it('writes nothing when one of several versions already exists', async () => {
        const { publisher, calls } = await ready(
            publishRoutes({ [`GET /repos/${REPO}/contents/bundles/packs/2.0.0?ref=main`]: [] }),
        );
        const files = [{ name: 'pack.mrpack', data: 'x' }];
        await expect(
            publisher.publish({
                repo: REPO,
                versions: [
                    { category: 'mods', version: '1.1.0', files },
                    { category: 'packs', version: '2.0.0', files },
                ],
            }),
        ).rejects.toThrow('packs 2.0.0 is already in someone/bundles');
        expect(calls.some(call => call.key.startsWith('POST'))).toBe(false);
    });

    it('refuses a version that is already in the repository', async () => {
        const { publisher, calls } = await ready(
            publishRoutes({ [`GET /repos/${REPO}/contents/bundles/mods/1.1.0?ref=main`]: [] }),
        );
        await expect(publisher.publish(request)).rejects.toThrow('mods 1.1.0 is already in someone/bundles');
        expect(calls.some(call => call.key.startsWith('POST'))).toBe(false);
    });

    it('commits again on top of a push that landed in between', async () => {
        let updates = 0;
        const { publisher, calls } = await ready(
            publishRoutes({ [`PATCH /repos/${REPO}/git/refs/heads/main`]: () => (++updates === 1 ? 422 : {}) }),
        );
        await publisher.publish(request);
        expect(calls.filter(call => call.key === `POST /repos/${REPO}/git/commits`)).toHaveLength(2);
    });

    it('gives up after a second push race', async () => {
        const { publisher } = await ready(publishRoutes({ [`PATCH /repos/${REPO}/git/refs/heads/main`]: 422 }));
        await expect(publisher.publish(request)).rejects.toThrow('GitHub answered 422');
    });

    it('needs a saved token', async () => {
        const { publisher } = makePublisher(publishRoutes());
        await expect(publisher.publish(request)).rejects.toThrow('Add a GitHub token in Settings first');
    });

    it.each([
        [{ repo: 'not a repo' }, /must look like owner\/name/],
        [{ repo: '../x/y' }, /must look like owner\/name/],
        [{ category: 'saves' }, /Unknown category saves/],
        [{ version: '../1' }, /A version may only use/],
        [{ version: '1/2' }, /A version may only use/],
        [{ files: [] }, /nothing to publish/],
        [{ versions: [] }, /nothing to publish/],
        [{ versions: [request, request] }, /one new version at a time/],
        [{ versions: [{ ...request, category: 'saves' }] }, /Unknown category saves/],
        [{ files: [{ name: 'mods/a.jar', data: 'a' }] }, /Can't publish a file called mods\/a.jar/],
        [{ files: [{ name: '.github', data: 'a' }] }, /Can't publish a file called .github/],
    ])('refuses a bad request (%#)', async (change, message) => {
        const { publisher } = await ready();
        await expect(publisher.publish({ ...request, ...change })).rejects.toThrow(message);
    });

    it('lists the versions already published in a category', async () => {
        const { publisher } = await ready(
            publishRoutes({
                [`GET /repos/${REPO}/contents/bundles/mods`]: [
                    { name: '1.0.0', type: 'dir' },
                    { name: '.gitkeep', type: 'file' },
                ],
            }),
        );
        await expect(publisher.versions(REPO, 'mods')).resolves.toEqual(['1.0.0']);
        await expect(publisher.versions(REPO, 'configs')).resolves.toEqual([]);
    });
});

describe('registerGitHubHandlers', () => {
    it('answers only the app page', async () => {
        const handlers = {};
        const ipcMain = { handle: (channel, handler) => (handlers[channel] = handler) };
        const publisher = { status: jest.fn(async () => ({ hasToken: true })) };
        registerGitHubHandlers(ipcMain, publisher, event => event.fromApp);

        await expect(handlers[GITHUB_CHANNELS.status]({ fromApp: true }, REPO)).resolves.toEqual({ hasToken: true });
        expect(publisher.status).toHaveBeenCalledWith(REPO);
        expect(() => handlers[GITHUB_CHANNELS.status]({ fromApp: false })).toThrow('Not allowed.');
        expect(Object.keys(handlers).sort()).toEqual(Object.values(GITHUB_CHANNELS).sort());
    });

    it('knows the same categories as the app', () => {
        expect(CATEGORIES).toEqual([...categories.map(category => category.id), 'packs']);
    });

    it('uses the channels preload.js exposes', () => {
        const preload = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'preload.js'), 'utf-8');
        for (const channel of Object.values(GITHUB_CHANNELS)) {
            expect(preload).toContain(`'${channel}'`);
        }
    });
});
