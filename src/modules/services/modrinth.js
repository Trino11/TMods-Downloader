// Thin client for the public Modrinth API (https://docs.modrinth.com/api/). Reading
// needs no account or key. Modrinth asks apps to identify themselves; the main
// process adds a TMods User-Agent to these requests, since a page can't set it.
import axios from 'axios';

export const API_URL = 'https://api.modrinth.com/v2';

export const PAGE_SIZE = 20;

// Modrinth's loader ids, as used in search facets and version filters.
export const LOADERS = {
    fabric: 'Fabric',
    forge: 'Forge',
    neoforge: 'NeoForge',
    quilt: 'Quilt',
};

async function get(route, params) {
    const { data } = await axios.get(`${API_URL}${route}`, { params });
    return data;
}

async function post(route, body) {
    const { data } = await axios.post(`${API_URL}${route}`, body);
    return data;
}

// Searches mods (or modpacks) on Modrinth. Mods are filtered to the given game version
// and loader and to ones that run on the client, so everything listed can be installed.
export async function search({ query = '', projectType = 'mod', gameVersion, loader, offset = 0 }) {
    const facets = [[`project_type:${projectType}`]];
    if (loader) {
        facets.push([`categories:${loader}`]);
    }
    if (gameVersion) {
        facets.push([`versions:${gameVersion}`]);
    }
    if (projectType === 'mod') {
        facets.push(['client_side:required', 'client_side:optional']);
    }
    const data = await get('/search', {
        query,
        facets: JSON.stringify(facets),
        index: query ? 'relevance' : 'downloads',
        limit: PAGE_SIZE,
        offset,
    });
    return { hits: data.hits, total: data.total_hits };
}

// A project's versions, newest first, optionally only those for a loader and game version.
export function getProjectVersions(projectId, { loader, gameVersion } = {}) {
    const params = {};
    if (loader) {
        params.loaders = JSON.stringify([loader]);
    }
    if (gameVersion) {
        params.game_versions = JSON.stringify([gameVersion]);
    }
    return get(`/project/${encodeURIComponent(projectId)}/version`, params);
}

export function getVersion(versionId) {
    return get(`/version/${encodeURIComponent(versionId)}`);
}

export async function getProjects(projectIds) {
    if (projectIds.length === 0) {
        return [];
    }
    return get('/projects', { ids: JSON.stringify(projectIds) });
}

// Maps each SHA1 to the Modrinth version that file belongs to. Unknown files are left out.
export async function versionsFromHashes(sha1s) {
    if (sha1s.length === 0) {
        return {};
    }
    return post('/version_files', { hashes: sha1s, algorithm: 'sha1' });
}

// Maps each SHA1 to the newest version of the same project for this loader and game
// version: one request checks a whole mods folder for updates.
export async function latestVersionsFromHashes(sha1s, { loader, gameVersion }) {
    if (sha1s.length === 0) {
        return {};
    }
    return post('/version_files/update', {
        hashes: sha1s,
        algorithm: 'sha1',
        loaders: [loader],
        game_versions: [gameVersion],
    });
}

// The file a version installs: the one marked primary, else the first.
export function primaryFile(version) {
    return version.files.find(file => file.primary) || version.files[0];
}

// The newest version, preferring stable releases over betas and alphas.
export function pickVersion(versions) {
    return versions.find(version => version.version_type === 'release') || versions[0];
}
