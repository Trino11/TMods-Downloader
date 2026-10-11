#!/usr/bin/env node
// Builds TMods bundle zips and the manifest the app reads from a folder laid out as
//
//   <source>/<category>/<version id>/...files, as they land in the game folder
//   <source>/<category>/<version id>/<name>.mrpack   optional: a Modrinth modpack to bundle
//   <source>/<category>/<version id>/bundle.json     optional: text, Modrinth versions, links
//   <source>/<category>/<version id>/CHANGELOG.md    optional: the changelog, as text
//   <source>/bundles.json                            optional: { "latest": { "<category>": "<id>" } }
//
// (sources.js reads a version folder) and writes the manifest plus the zips that need
// uploading into <out>. A version whose inputs match the previous manifest's `source`
// keeps its old URL without downloading or zipping anything.
// See README.md next to this file for the workflow that publishes the result.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createZip } = require('./zip');
const { createRemote } = require('./remote');
const { readVersion } = require('./sources');

// The manifest categories the app knows (src/modules/categories.js; a test keeps them in sync).
const CATEGORIES = ['mods', 'schematics', 'resourcepacks', 'configs', 'shaderpacks'];

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
    return `${category}-${id}`.replace(/[^A-Za-z0-9._-]+/g, '-') + '.zip';
}

// Newest first, comparing the numbers in ids as numbers (1.10.0 comes before 1.9.0).
function compareIdsDescending(a, b) {
    return b.localeCompare(a, 'en', { numeric: true, sensitivity: 'base' });
}

function previousEntry(previous, category, id) {
    const versions = previous?.versions?.[category];
    return Array.isArray(versions) ? versions.find(version => version.id === id) : undefined;
}

// Reads `source` and returns { manifest, uploads: [{ name, data, label, replaced }] }.
// `downloadBase` is the URL new assets will be downloadable under (the new release's
// download folder). `remote` fetches Modrinth versions and downloads (see remote.js).
async function buildBundles({ source, downloadBase, previous = null, remote = createRemote() }) {
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
        throw new Error(`The bundles folder ${source} doesn't exist.`);
    }

    const unknown = listDirs(source).filter(name => !CATEGORIES.includes(name));
    if (unknown.length > 0) {
        throw new Error(`Unknown category folder(s): ${unknown.join(', ')}. Use: ${CATEGORIES.join(', ')}.`);
    }

    const configFile = path.join(source, 'bundles.json');
    const config = fs.existsSync(configFile) ? readJson(configFile, 'bundles.json') : {};
    const latestOverrides = config.latest || {};

    // Read and check every folder before downloading anything, so a typo fails fast.
    const plan = [];
    const assetNames = new Set();
    for (const category of CATEGORIES) {
        const categoryDir = path.join(source, category);
        const ids = fs.existsSync(categoryDir) ? listDirs(categoryDir).sort(compareIdsDescending) : [];
        for (const id of ids) {
            const label = `${category}/${id}`;
            const name = assetName(category, id);
            if (assetNames.has(name)) {
                throw new Error(`${label} would be uploaded as ${name}, which another version already uses.`);
            }
            assetNames.add(name);
            plan.push({ category, id, label, name, ...readVersion(path.join(categoryDir, id), label) });
        }
    }

    const manifest = { latest: {}, versions: {} };
    const uploads = [];
    for (const { category, id, label, name, metadata, inputs, key } of plan) {
        const before = previousEntry(previous, category, id);
        let entry;
        if (before?.source === key && before.url && before.sha256) {
            entry = { url: before.url, sha256: before.sha256 };
        } else {
            const zip = createZip(await remote.filesOf(inputs, label));
            const hash = sha256(zip);
            // Manifests from before `source` existed: reuse the zip if its bytes match.
            if (before && before.sha256 === hash && before.url) {
                entry = { url: before.url, sha256: hash };
            } else {
                entry = { url: `${downloadBase}/${encodeURIComponent(name)}`, sha256: hash };
                uploads.push({ name, data: zip, label, replaced: Boolean(before) });
            }
        }
        manifest.versions[category] ??= [];
        manifest.versions[category].push({ id, ...entry, source: key, ...metadata });
    }

    for (const [category, versions] of Object.entries(manifest.versions)) {
        const ids = versions.map(version => version.id);
        const latest = latestOverrides[category] ?? ids[0];
        if (!ids.includes(latest)) {
            throw new Error(
                `bundles.json names ${category} ${latest} as latest, but there is no ${category}/${latest}.`,
            );
        }
        manifest.latest[category] = latest;
    }
    for (const category of Object.keys(latestOverrides)) {
        if (!manifest.versions[category]) {
            throw new Error(`bundles.json names a latest ${category}, but there is no ${category} folder.`);
        }
    }
    if (Object.keys(manifest.versions).length === 0) {
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
    for (const [category, latest] of Object.entries(manifest.latest)) {
        lines.push(`| ${category} | ${latest} |`);
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
        console.log(`${category}: ${versions.map(v => v.id).join(', ')} (latest ${manifest.latest[category]})`);
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

module.exports = { CATEGORIES, assetName, buildBundles, compareIdsDescending, main };
