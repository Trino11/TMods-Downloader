#!/usr/bin/env node
// Builds TMods bundle zips and the manifest the app reads from a folder laid out as
//
//   <source>/<category>/<version id>/...files, as they land in the game folder
//   <source>/<category>/<version id>/bundle.json    optional: description, target, changelog
//   <source>/<category>/<version id>/CHANGELOG.md   optional: the changelog, as text
//   <source>/bundles.json                           optional: { "latest": { "<category>": "<id>" } }
//
// and writes the manifest plus the zips that need uploading into <out>. A zip whose
// bytes match the previous manifest's sha256 keeps its old URL and isn't uploaded again.
// See README.md next to this file for the workflow that publishes the result.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createZip } = require('./zip');

// The manifest categories the app knows (src/modules/categories.js; a test keeps them in sync).
const CATEGORIES = ['mods', 'schematics', 'resourcepacks', 'configs', 'shaderpacks'];
const METADATA_FILE = 'bundle.json';
const CHANGELOG_FILE = 'CHANGELOG.md';
const METADATA_KEYS = ['description', 'target', 'changelog'];
const IGNORED_FILES = new Set(['.gitkeep', '.DS_Store', 'Thumbs.db']);

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function listDirs(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => entry.name);
}

// Every file under `dir` as { name, data }, `name` relative with forward slashes.
function collectFiles(dir, prefix = '') {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const name = prefix + entry.name;
        if (entry.isDirectory()) {
            files.push(...collectFiles(full, `${name}/`));
        } else if (entry.isFile() && !IGNORED_FILES.has(entry.name)) {
            files.push({ name, data: fs.readFileSync(full) });
        }
    }
    return files;
}

function readJson(file, what) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (error) {
        throw new Error(`${what} (${file}) is not valid JSON: ${error.message}`, { cause: error });
    }
}

function readMetadata(versionDir, label) {
    const metadataFile = path.join(versionDir, METADATA_FILE);
    const metadata = fs.existsSync(metadataFile) ? readJson(metadataFile, `${label}/${METADATA_FILE}`) : {};
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new Error(`${label}/${METADATA_FILE} must be a JSON object.`);
    }
    for (const [key, value] of Object.entries(metadata)) {
        if (!METADATA_KEYS.includes(key)) {
            throw new Error(
                `${label}/${METADATA_FILE} has an unknown key "${key}" (allowed: ${METADATA_KEYS.join(', ')}).`,
            );
        }
        if (typeof value !== 'string') {
            throw new Error(`${label}/${METADATA_FILE}: "${key}" must be a string.`);
        }
    }

    const changelogFile = path.join(versionDir, CHANGELOG_FILE);
    if (fs.existsSync(changelogFile)) {
        if (metadata.changelog !== undefined) {
            throw new Error(`${label} has both ${CHANGELOG_FILE} and a "changelog" in ${METADATA_FILE}; keep one.`);
        }
        metadata.changelog = fs.readFileSync(changelogFile, 'utf-8').trim();
    }
    return metadata;
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

// Reads `source` and returns { manifest, uploads: [{ name, data }] }. `downloadBase` is
// the URL new assets will be downloadable under (the new release's download folder).
function buildBundles({ source, downloadBase, previous = null }) {
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

    const manifest = { latest: {}, versions: {} };
    const uploads = [];
    const assetNames = new Set();
    for (const category of CATEGORIES) {
        const categoryDir = path.join(source, category);
        if (!fs.existsSync(categoryDir)) {
            continue;
        }
        const ids = listDirs(categoryDir).sort(compareIdsDescending);
        if (ids.length === 0) {
            continue;
        }

        const versions = [];
        for (const id of ids) {
            const label = `${category}/${id}`;
            const versionDir = path.join(categoryDir, id);
            const files = collectFiles(versionDir).filter(
                file => file.name !== METADATA_FILE && file.name !== CHANGELOG_FILE,
            );
            if (files.length === 0) {
                throw new Error(`${label} has no files to bundle.`);
            }

            const zip = createZip(files);
            const hash = sha256(zip);
            const before = previousEntry(previous, category, id);
            let url;
            if (before && before.sha256 === hash && before.url) {
                url = before.url;
            } else {
                const name = assetName(category, id);
                if (assetNames.has(name)) {
                    throw new Error(`${label} would be uploaded as ${name}, which another version already uses.`);
                }
                assetNames.add(name);
                url = `${downloadBase}/${encodeURIComponent(name)}`;
                uploads.push({ name, data: zip, label, replaced: Boolean(before) });
            }
            versions.push({ id, url, sha256: hash, ...readMetadata(versionDir, label) });
        }

        const latest = latestOverrides[category] ?? ids[0];
        if (!ids.includes(latest)) {
            throw new Error(
                `bundles.json names ${category} ${latest} as latest, but there is no ${category}/${latest}.`,
            );
        }
        manifest.latest[category] = latest;
        manifest.versions[category] = versions;
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

function main(argv) {
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

    const { manifest, uploads } = buildBundles({
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
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`::error::${error.message}`);
        process.exit(1);
    }
}

module.exports = { CATEGORIES, assetName, buildBundles, compareIdsDescending, main };
