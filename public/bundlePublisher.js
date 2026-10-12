// Publishes a bundle version to the player's bundles repository on GitHub, from the main
// process. The page hands over the files; the GitHub token never reaches the page: it is
// saved encrypted by the OS (Electron's safeStorage) and only used here, and only for
// api.github.com. The repository's own workflow (publish-bundles) then builds and
// releases the new version.
//
// Kept apart from Electron, with its pieces passed in, so Jest can test it.

const API = 'https://api.github.com';
const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
// The app's categories (src/modules/categories.js; a test keeps them in sync), plus
// packs: whole packs, imported into a profile from the Packs page.
const CATEGORIES = ['mods', 'schematics', 'resourcepacks', 'configs', 'shaderpacks', 'packs'];
// What a version folder may be called, so it stays one safe path segment.
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
// Files inside a version folder: plain names, no subfolders, nothing hidden.
const FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ +-]{0,127}$/;

// IPC channels the page uses (exposed by preload.js as window.tmods.github).
const GITHUB_CHANNELS = {
    status: 'github:status',
    saveToken: 'github:save-token',
    forgetToken: 'github:forget-token',
    versions: 'github:versions',
    publish: 'github:publish',
};

function checkRepo(repo) {
    if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) {
        throw new Error('The bundles repository must look like owner/name, e.g. Trino11/TMods-bundles.');
    }
    return repo;
}

function checkCategory(category) {
    if (!CATEGORIES.includes(category)) {
        throw new Error(`Unknown category ${category}.`);
    }
    return category;
}

function checkVersion(version) {
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version) || version.includes('..')) {
        throw new Error('A version may only use letters, digits, dots, dashes, underscores and +.');
    }
    return version;
}

function toBase64(data) {
    if (typeof data === 'string') {
        return Buffer.from(data, 'utf-8').toString('base64');
    }
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
    }
    return Buffer.from(data).toString('base64');
}

// `safeStorage` is Electron's, `fs` Node's, `tokenFile` where the encrypted token lives.
function createBundlePublisher({ fetch, safeStorage, fs, tokenFile, userAgent }) {
    function readToken() {
        if (!fs.existsSync(tokenFile)) {
            return null;
        }
        try {
            return safeStorage.decryptString(fs.readFileSync(tokenFile));
        } catch {
            return null;
        }
    }

    function requireToken() {
        const token = readToken();
        if (!token) {
            throw new Error('Add a GitHub token in Settings first.');
        }
        return token;
    }

    // A GitHub API call. Resolves to { status, body }; throws on errors other than the
    // statuses the caller says it expects.
    async function api(token, method, route, body, expected = []) {
        const response = await fetch(`${API}${route}`, {
            method,
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': userAgent,
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        let parsed = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            // Not JSON (an outage page); the status says enough.
        }
        if (response.ok || expected.includes(response.status)) {
            return { status: response.status, body: parsed };
        }
        if (response.status === 401) {
            throw new Error('GitHub refused the token. It may have expired; add a new one in Settings.');
        }
        if (response.status === 403 || response.status === 404) {
            throw new Error(
                "GitHub didn't let the token reach that repository. Check its name, and that the token " +
                    'can read and write its contents.',
            );
        }
        throw new Error(`GitHub answered ${response.status}: ${parsed?.message || response.statusText}`);
    }

    async function repository(token, repo) {
        const { body } = await api(token, 'GET', `/repos/${checkRepo(repo)}`);
        if (body.permissions && !body.permissions.push) {
            throw new Error(`The token can read ${repo} but not write to it.`);
        }
        return body;
    }

    // Whether a token is saved, and when a repository is given, whether it can publish there.
    async function status(repo) {
        const token = readToken();
        if (!token) {
            return { hasToken: false };
        }
        if (!repo) {
            return { hasToken: true };
        }
        const { full_name: fullName, html_url: url } = await repository(token, repo);
        return { hasToken: true, repo: fullName, url };
    }

    async function saveToken(token) {
        if (typeof token !== 'string' || !/^[\w-]{20,255}$/.test(token.trim())) {
            throw new Error("That doesn't look like a GitHub token.");
        }
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error("This computer can't store the token encrypted, so TMods won't save it.");
        }
        // Checks the token works before keeping it.
        await api(token.trim(), 'GET', '/user');
        fs.writeFileSync(tokenFile, safeStorage.encryptString(token.trim()));
    }

    function forgetToken() {
        fs.rmSync(tokenFile, { force: true });
    }

    // The version folders already in the repository for a category.
    async function versions(repo, category) {
        const token = requireToken();
        const route = `/repos/${checkRepo(repo)}/contents/bundles/${checkCategory(category)}`;
        const { status: code, body } = await api(token, 'GET', route, undefined, [404]);
        return code === 404 ? [] : body.filter(entry => entry.type === 'dir').map(entry => entry.name);
    }

    // Adds bundles/<category>/<version>/<files> to the default branch in one commit.
    // `files` are [{ name, data }]. Refuses a version that already exists.
    async function publish({ repo, category, version, files, message }) {
        const token = requireToken();
        checkRepo(repo);
        checkCategory(category);
        checkVersion(version);
        if (!Array.isArray(files) || files.length === 0) {
            throw new Error('There is nothing to publish.');
        }
        for (const file of files) {
            if (typeof file?.name !== 'string' || !FILE_PATTERN.test(file.name)) {
                throw new Error(`Can't publish a file called ${file?.name}.`);
            }
        }

        const folder = `bundles/${category}/${version}`;
        const { default_branch: branch, html_url: repoUrl } = await repository(token, repo);
        const existing = await api(token, 'GET', `/repos/${repo}/contents/${folder}?ref=${branch}`, undefined, [404]);
        if (existing.status !== 404) {
            throw new Error(`${category} ${version} is already in ${repo}. Pick a new version.`);
        }

        const tree = [];
        for (const file of files) {
            const { body } = await api(token, 'POST', `/repos/${repo}/git/blobs`, {
                content: toBase64(file.data),
                encoding: 'base64',
            });
            tree.push({ path: `${folder}/${file.name}`, mode: '100644', type: 'blob', sha: body.sha });
        }

        // Someone may push in between; try again on top of the new head once.
        for (let attempt = 1; ; attempt++) {
            const { body: ref } = await api(token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`);
            const head = ref.object.sha;
            const { body: headCommit } = await api(token, 'GET', `/repos/${repo}/git/commits/${head}`);
            const { body: newTree } = await api(token, 'POST', `/repos/${repo}/git/trees`, {
                base_tree: headCommit.tree.sha,
                tree,
            });
            const { body: commit } = await api(token, 'POST', `/repos/${repo}/git/commits`, {
                message: message || `Add ${category} ${version}`,
                tree: newTree.sha,
                parents: [head],
            });
            const update = await api(
                token,
                'PATCH',
                `/repos/${repo}/git/refs/heads/${branch}`,
                { sha: commit.sha, force: false },
                attempt === 1 ? [422] : [],
            );
            if (update.status !== 422) {
                return { commitUrl: commit.html_url, actionsUrl: `${repoUrl}/actions` };
            }
        }
    }

    return { status, saveToken, forgetToken, versions, publish };
}

// Wires the publisher to IPC. `fromApp(event)` says whether a call comes from the app's
// own page; anything else is refused, since these calls use the token.
function registerGitHubHandlers(ipcMain, publisher, fromApp) {
    const handle = (channel, work) =>
        ipcMain.handle(channel, (event, ...args) => {
            if (!fromApp(event)) {
                throw new Error('Not allowed.');
            }
            return work(...args);
        });
    handle(GITHUB_CHANNELS.status, repo => publisher.status(repo));
    handle(GITHUB_CHANNELS.saveToken, token => publisher.saveToken(token));
    handle(GITHUB_CHANNELS.forgetToken, () => publisher.forgetToken());
    handle(GITHUB_CHANNELS.versions, (repo, category) => publisher.versions(repo, category));
    handle(GITHUB_CHANNELS.publish, request => publisher.publish(request));
}

module.exports = { CATEGORIES, GITHUB_CHANNELS, createBundlePublisher, registerGitHubHandlers };
