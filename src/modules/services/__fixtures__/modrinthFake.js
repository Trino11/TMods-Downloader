// A pretend Modrinth for tests: projects with versions, served through a mocked axios.
// Lives outside __tests__ so Jest doesn't run it as a test.
const crypto = require('crypto');

const hash = (algorithm, data) => crypto.createHash(algorithm).update(data).digest('hex');

// Builds a Modrinth version whose single jar has `content` as its bytes.
function makeVersion(
    projectId,
    id,
    { deps = [], type = 'release', content, loaders = ['fabric'], gameVersions = ['1.21.1'] } = {},
) {
    const data = Buffer.from(content ?? `${projectId}@${id}`);
    return {
        id,
        project_id: projectId,
        name: `${projectId} ${id}`,
        version_number: id,
        version_type: type,
        loaders,
        game_versions: gameVersions,
        dependencies: deps,
        files: [
            {
                url: `https://cdn.modrinth.com/data/${projectId}/versions/${id}/${projectId}-${id}.jar`,
                filename: `${projectId}-${id}.jar`,
                primary: true,
                size: data.length,
                hashes: { sha1: hash('sha1', data), sha512: hash('sha512', data) },
            },
        ],
        data,
    };
}

function required(projectId) {
    return { project_id: projectId, version_id: null, dependency_type: 'required' };
}

function incompatible(projectId) {
    return { project_id: projectId, version_id: null, dependency_type: 'incompatible' };
}

function asArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// `projects` maps project id to { title, versions: [newest first] }. `files` maps extra
// download URLs to their bytes. Wires axios.get/post to answer like the API would.
function serveModrinth(axios, projects, files = {}) {
    const allVersions = () => Object.values(projects).flatMap(project => project.versions);
    const byHash = sha1 => allVersions().find(v => v.files.some(f => f.hashes.sha1 === sha1));
    const api = 'https://api.modrinth.com/v2';

    axios.get.mockImplementation(async (url, config = {}) => {
        const params = config.params || {};
        if (files[url]) {
            return { data: asArrayBuffer(files[url]) };
        }
        const download = allVersions().find(v => v.files[0].url === url);
        if (download) {
            return { data: asArrayBuffer(download.data) };
        }
        let match = url.match(/\/project\/([^/]+)\/version$/);
        if (match) {
            const project = projects[decodeURIComponent(match[1])];
            if (!project) {
                throw new Error('404');
            }
            // Filters like the API does, for versions that say what they're for.
            const loaders = params.loaders && JSON.parse(params.loaders);
            const gameVersions = params.game_versions && JSON.parse(params.game_versions);
            return {
                data: project.versions.filter(
                    v =>
                        (!loaders || v.loaders.some(l => loaders.includes(l))) &&
                        (!gameVersions || v.game_versions.some(g => gameVersions.includes(g))),
                ),
            };
        }
        match = url.match(/\/version\/([^/]+)$/);
        if (match) {
            return { data: allVersions().find(v => v.id === decodeURIComponent(match[1])) };
        }
        if (url === `${api}/projects`) {
            const ids = JSON.parse(params.ids);
            return { data: ids.filter(id => projects[id]).map(id => ({ id, title: projects[id].title })) };
        }
        if (url === `${api}/search`) {
            return { data: { hits: [], total_hits: 0 } };
        }
        throw new Error(`Unexpected GET ${url}`);
    });

    axios.post.mockImplementation(async (url, body) => {
        if (url === `${api}/version_files`) {
            const result = {};
            for (const sha1 of body.hashes) {
                if (byHash(sha1)) {
                    result[sha1] = byHash(sha1);
                }
            }
            return { data: result };
        }
        if (url === `${api}/version_files/update`) {
            const result = {};
            for (const sha1 of body.hashes) {
                const version = byHash(sha1);
                if (version) {
                    result[sha1] = projects[version.project_id].versions[0];
                }
            }
            return { data: result };
        }
        throw new Error(`Unexpected POST ${url}`);
    });
}

module.exports = { makeVersion, required, incompatible, serveModrinth, hash, asArrayBuffer };

// adm-zip spots buffers with `instanceof Uint8Array`, which fails under jsdom because
// Node's Buffer comes from another realm (in Electron there is only one). This version
// reads buffers through a temporary file instead, for tests only.
function realmSafeAdmZip(tempDir) {
    const fs = require('fs');
    const path = require('path');
    const AdmZip = require('adm-zip');
    let count = 0;
    return class extends AdmZip {
        constructor(input, options) {
            if (Buffer.isBuffer(input)) {
                const file = path.join(tempDir, `zip-${count++}.zip`);
                fs.writeFileSync(file, input);
                input = file;
            }
            super(input, options);
        }
    };
}

module.exports.realmSafeAdmZip = realmSafeAdmZip;
