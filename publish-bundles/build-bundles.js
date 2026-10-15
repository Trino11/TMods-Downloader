#!/usr/bin/env node
// Builds TMods bundle zips and the manifest the app reads from a folder laid out as
//
//   <source>/<category>/<version id>/...files, as they land in the game folder
//   <source>/<category>/<version id>/<name>.mrpack   optional: a Modrinth modpack to bundle
//   <source>/<category>/<version id>/bundle.json     optional: text, Modrinth versions, links
//   <source>/<category>/<version id>/CHANGELOG.md    optional: the changelog, as text
//   <source>/packs/<version id>/bundle.json          a pack: "versions" of the other categories
//   <source>/packs/<version id>/<name>.mrpack        a pack from before sets, published as the .mrpack
//   <source>/servers.json                            optional: servers for players' Multiplayer list
//
// (sources.js reads a version folder) and writes the manifest plus the zips (and packs)
// that need uploading into <out>. A version whose inputs match the previous manifest's `source`
// keeps its old URL without downloading or zipping anything.
// See README.md next to this file for the workflow that publishes the result.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createZip } = require('./zip');
const { createRemote } = require('./remote');
const { readPack, readVersion } = require('./sources');

// The manifest categories the app installs as zips (src/modules/categories.js; a test
// keeps them in sync).
const CATEGORIES = ['mods', 'schematics', 'resourcepacks', 'configs', 'shaderpacks'];
// Packs: each version is a set of exact versions of the categories above, which the app
// installs together. They go in the manifest's `packSets` (nothing to upload), so apps
// from before sets never see them. Packs published before sets are a .mrpack, uploaded as
// it is and listed under versions.packs, where every app finds them.
const PACKS = 'packs';
const ALL_CATEGORIES = [...CATEGORIES, PACKS];

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function listDirs(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => entry.name);
}

function readJson(file, what) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (error) {
        throw new Error(`${what} (${file}) is not valid JSON: ${error.message}`, { cause: error });
    }
}

// Release asset names only keep letters, digits, dots, dashes and underscores.
function assetName(category, id) {
    const extension = category === PACKS ? '.mrpack' : '.zip';
    return `${category}-${id}`.replace(/[^A-Za-z0-9._-]+/g, '-') + extension;
}

// Newest first, comparing the numbers in ids as numbers (1.10.0 comes before 1.9.0).
function compareIdsDescending(a, b) {
    return b.localeCompare(a, 'en', { numeric: true, sensitivity: 'base' });
}

// The file listing the servers TMods puts in every profile's Multiplayer list.
const SERVERS_FILE = 'servers.json';
const RESOURCE_PACK_CHOICES = ['prompt', 'enabled', 'disabled'];

// Reads <source>/servers.json: { "servers": [{ "name", "address", "resourcePack" }] }.
// Returns the manifest's `servers`, or null when there is no file. Mistakes stop the
// publish, so a typo never reaches players.
function readServers(source) {
    const file = path.join(source, SERVERS_FILE);
    if (!fs.existsSync(file)) {
        return null;
    }
    const data = readJson(file, 'The server list');
    const list = Array.isArray(data) ? data : data?.servers;
    if (!Array.isArray(list)) {
        throw new Error(`${SERVERS_FILE} needs a "servers" list.`);
    }
    const seen = new Set();
    return list.map((entry, index) => {
        const where = `${SERVERS_FILE}, server ${index + 1}`;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`${where} must be an object with "name" and "address".`);
        }
        const unknown = Object.keys(entry).filter(key => !['name', 'address', 'resourcePack'].includes(key));
        if (unknown.length > 0) {
            throw new Error(`${where} has unknown field(s) ${unknown.join(', ')}. Use name, address and resourcePack.`);
        }
        const address = typeof entry.address === 'string' ? entry.address.trim() : '';
        if (!address || /\s/.test(address)) {
            throw new Error(`${where} needs an "address" without spaces, like "play.example.com".`);
        }
        const key = address.toLowerCase().replace(/:25565$/, '');
        if (seen.has(key)) {
            throw new Error(`${where} repeats the address ${address}.`);
        }
        seen.add(key);
        if (entry.name !== undefined && typeof entry.name !== 'string') {
            throw new Error(`${where}: "name" must be text.`);
        }
        if (entry.resourcePack !== undefined && !RESOURCE_PACK_CHOICES.includes(entry.resourcePack)) {
            throw new Error(`${where}: "resourcePack" must be ${RESOURCE_PACK_CHOICES.join(', ')}.`);
        }
        return {
            name: entry.name?.trim() || address,
            address,
            ...(entry.resourcePack ? { resourcePack: entry.resourcePack } : {}),
        };
    });
}

function previousEntry(previous, category, id) {
    const versions = previous?.versions?.[category];
    return Array.isArray(versions) ? versions.find(version => version.id === id) : undefined;
}

// The manifest entry of a pack that is a set of category versions, once every category
// version is in `manifest`: each one it lists must be published in this same release, so a
// typo never reaches players. Without its own target, the pack takes its mods version's.
function packSet(manifest, { id, label, set, key, metadata }) {
    for (const [category, version] of Object.entries(set)) {
        if (!CATEGORIES.includes(category)) {
            throw new Error(`${label} lists "${category}", which is not a category. Use: ${CATEGORIES.join(', ')}.`);
        }
        if (!manifest.versions[category]?.some(entry => entry.id === version)) {
            const have = (manifest.versions[category] || []).map(entry => entry.id);
            throw new Error(
                `${label} lists ${category} ${version}, which isn't in bundles/${category}/` +
                    (have.length ? ` (it has ${have.join(', ')}).` : ' (it has no versions).'),
            );
        }
    }
    const target = metadata.target ?? manifest.versions.mods?.find(entry => entry.id === set.mods)?.target;
    return { id, versions: set, source: key, ...metadata, ...(target ? { target } : {}) };
}

// Reads `source` and returns { manifest, uploads: [{ name, data, label, replaced }] }.
// `downloadBase` is the URL new assets will be downloadable under (the new release's
// download folder). `remote` fetches Modrinth versions and downloads (see remote.js).
async function buildBundles({ source, downloadBase, previous = null, remote = createRemote() }) {
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
        throw new Error(`The bundles folder ${source} doesn't exist.`);
    }

    const unknown = listDirs(source).filter(name => !ALL_CATEGORIES.includes(name));
    if (unknown.length > 0) {
        throw new Error(`Unknown category folder(s): ${unknown.join(', ')}. Use: ${ALL_CATEGORIES.join(', ')}.`);
    }

    // Read and check every folder before downloading anything, so a typo fails fast.
    const plan = [];
    const assetNames = new Set();
    for (const category of ALL_CATEGORIES) {
        const categoryDir = path.join(source, category);
        const ids = fs.existsSync(categoryDir) ? listDirs(categoryDir).sort(compareIdsDescending) : [];
        for (const id of ids) {
            const label = `${category}/${id}`;
            const name = assetName(category, id);
            if (assetNames.has(name)) {
                throw new Error(`${label} would be uploaded as ${name}, which another version already uses.`);
            }
            assetNames.add(name);
            const read = category === PACKS ? readPack : readVersion;
            plan.push({ category, id, label, name, ...read(path.join(categoryDir, id), label) });
        }
    }

    const manifest = { versions: {} };
    const uploads = [];
    const sets = [];
    for (const { category, id, label, name, metadata, inputs, key, data, set } of plan) {
        if (set) {
            sets.push({ id, label, set, key, metadata });
            continue;
        }
        const before = previousEntry(previous, category, id);
        let entry;
        if (before?.source === key && before.url && before.sha256) {
            entry = { url: before.url, sha256: before.sha256 };
        } else {
            // A pack is uploaded as it is; its files are still fetched, to prove every
            // link works before players try it.
            const files = await remote.filesOf(inputs, label);
            const asset = data || createZip(files);
            const hash = sha256(asset);
            // Manifests from before `source` existed: reuse the asset if its bytes match.
            if (before && before.sha256 === hash && before.url) {
                entry = { url: before.url, sha256: hash };
            } else {
                entry = { url: `${downloadBase}/${encodeURIComponent(name)}`, sha256: hash };
                uploads.push({ name, data: asset, label, replaced: Boolean(before) });
            }
        }
        manifest.versions[category] ??= [];
        manifest.versions[category].push({ id, ...entry, source: key, ...metadata });
    }

    if (sets.length > 0) {
        manifest.packSets = sets.map(pack => packSet(manifest, pack));
    }

    // Read last, so a broken servers.json is reported even when nothing else changed.
    const servers = readServers(source);
    if (servers) {
        manifest.servers = servers;
    }
    if (Object.keys(manifest.versions).length === 0 && !manifest.packSets && !servers?.length) {
        throw new Error(`${source} has no bundles. Add folders like ${source}/mods/1.0.0/mods/<your jars>.`);
    }
    return { manifest, uploads };
}

function releaseNotes(manifest, uploads) {
    const lines = [
        'TMods bundles published by the publish-bundles action.',
        '',
        '| Category | Latest |',
        '| --- | --- |',
    ];
    for (const [category, versions] of Object.entries(manifest.versions)) {
        lines.push(`| ${category} | ${versions[0].id} |`);
    }
    if (manifest.packSets?.length) {
        const pack = manifest.packSets[0];
        const parts = Object.entries(pack.versions).map(([category, version]) => `${category} ${version}`);
        lines.push(`| pack | ${pack.id} (${parts.join(', ')}) |`);
    }
    if (manifest.servers?.length) {
        lines.push('', `Servers: ${manifest.servers.map(server => `${server.name} (${server.address})`).join(', ')}`);
    }
    lines.push('', uploads.length ? 'New or changed in this release:' : 'No bundle changed; only the manifest is new.');
    for (const upload of uploads) {
        lines.push(`- ${upload.label}${upload.replaced ? ' (same id, new contents)' : ''}`);
    }
    return lines.join('\n') + '\n';
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        if (!argv[i].startsWith('--')) {
            throw new Error(`Unexpected argument ${argv[i]}`);
        }
        args[argv[i].slice(2)] = argv[i + 1];
    }
    return args;
}

async function main(argv) {
    const args = parseArgs(argv);
    for (const required of ['source', 'out', 'repo', 'tag']) {
        if (!args[required]) {
            throw new Error(`Missing --${required}`);
        }
    }
    const server = (args['server-url'] || 'https://github.com').replace(/\/$/, '');
    const repoUrl = `${server}/${args.repo}`;
    const previous =
        args.previous && fs.existsSync(args.previous) ? readJson(args.previous, 'Previous manifest') : null;

    const { manifest, uploads } = await buildBundles({
        source: args.source,
        downloadBase: `${repoUrl}/releases/download/${encodeURIComponent(args.tag)}`,
        previous,
    });

    fs.rmSync(args.out, { recursive: true, force: true });
    fs.mkdirSync(path.join(args.out, 'assets'), { recursive: true });
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(path.join(args.out, 'assets', 'manifest.json'), manifestJson);
    for (const upload of uploads) {
        fs.writeFileSync(path.join(args.out, 'assets', upload.name), upload.data);
    }
    fs.writeFileSync(path.join(args.out, 'notes.md'), releaseNotes(manifest, uploads));

    const changed = uploads.length > 0 || !previous || JSON.stringify(previous) !== JSON.stringify(manifest);
    const manifestUrl = `${repoUrl}/releases/latest/download/manifest.json`;
    for (const [category, versions] of Object.entries(manifest.versions)) {
        console.log(`${category}: ${versions.map(v => v.id).join(', ')} (latest ${versions[0].id})`);
    }
    if (manifest.packSets) {
        console.log(
            `pack sets: ${manifest.packSets.map(pack => pack.id).join(', ')} (latest ${manifest.packSets[0].id})`,
        );
    }
    if (manifest.servers) {
        console.log(`servers: ${manifest.servers.map(server => server.address).join(', ') || 'none'}`);
    }
    for (const upload of uploads.filter(u => u.replaced)) {
        console.log(
            `::warning::${upload.label} changed since it was published. Players who installed it won't get the ` +
                'change; give changed bundles a new version folder instead.',
        );
    }
    console.log(`Upload: ${uploads.length ? uploads.map(u => u.name).join(', ') : 'nothing new'}`);
    console.log(changed ? `Manifest: ${manifestUrl}` : 'Nothing changed since the last release.');

    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(
            process.env.GITHUB_OUTPUT,
            `changed=${changed}\nmanifest-url=${manifestUrl}\nuploads=${uploads.length}\n`,
        );
    }
    return { manifest, uploads, changed };
}

if (require.main === module) {
    main(process.argv.slice(2)).catch(error => {
        console.error(`::error::${error.message}`);
        process.exit(1);
    });
}

module.exports = { CATEGORIES, PACKS, assetName, buildBundles, compareIdsDescending, main };
