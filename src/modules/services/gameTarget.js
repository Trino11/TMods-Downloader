// Works out which Minecraft version and mod loader a launcher version id stands for,
// e.g. "fabric-loader-0.16.5-1.21.1" is Fabric 0.16.5 on Minecraft 1.21.1. Mods from
// Modrinth are picked to match it.
import { minecraftDir } from './paths';
import { fs, path } from './node';

// Each loader's installer names its launcher version in its own way:
// fabric-loader-0.16.5-1.21.1, quilt-loader-0.26.4-1.21.1, 1.20.1-forge-47.2.0 and
// neoforge-21.1.77. Returns { loader, loaderVersion }, or null for anything else.
function parseLoader(versionId, gameVersion) {
    const suffix = `-${gameVersion}`;
    for (const loader of ['fabric', 'quilt']) {
        const prefix = `${loader}-loader-`;
        if (versionId.startsWith(prefix) && versionId.endsWith(suffix)) {
            return { loader, loaderVersion: versionId.slice(prefix.length, -suffix.length) };
        }
    }
    const neoforge = versionId.match(/neoforge-(.+)$/i);
    if (neoforge) {
        return { loader: 'neoforge', loaderVersion: neoforge[1] };
    }
    const forge = versionId.match(/-forge-?(.+)$/i);
    if (forge) {
        return { loader: 'forge', loaderVersion: forge[1] };
    }
    return null;
}

function readVersionJson(versionId) {
    const file = path.join(minecraftDir(), 'versions', versionId, `${versionId}.json`);
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return null;
    }
}

// Returns { versionId, gameVersion, loader, loaderVersion }, or null when the version
// isn't installed or is plain vanilla (no loader, so no mods).
export function detectTarget(versionId) {
    if (!versionId) {
        return null;
    }
    const json = readVersionJson(versionId);
    if (!json || !json.inheritsFrom) {
        return null;
    }
    const loader = parseLoader(versionId, json.inheritsFrom);
    return loader && { versionId, gameVersion: json.inheritsFrom, ...loader };
}
