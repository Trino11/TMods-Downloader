// Reads a mod loader's launcher version id on its own, without the installed json,
// so any id can be shown in plain words: "fabric-loader-0.16.5-1.21.1" reads as
// "Minecraft 1.21.1 · Fabric 0.16.5". Picking content still goes through
// gameTarget.detectTarget, which checks the installed json.
import { LOADERS } from './modrinth';

// NeoForge numbers its builds after the Minecraft version: 21.1.77 is for 1.21.1,
// 21.0.x for 1.21, and from Minecraft 26.1 on, 26.1.0.x is for 26.1.
function neoforgeGameVersion(loaderVersion) {
    const [major, minor] = loaderVersion.split('.');
    if (!/^\d+$/.test(major || '') || !/^\d+$/.test(minor || '')) {
        return null;
    }
    if (Number(major) >= 26) {
        return `${major}.${minor}`;
    }
    return minor === '0' ? `1.${major}` : `1.${major}.${minor}`;
}

// Returns { loader, loaderVersion, gameVersion } for fabric-loader-<loader>-<mc>,
// quilt-loader-<loader>-<mc>, <mc>-forge-<loader> and neoforge-<loader>, or null for
// anything else. gameVersion is null when the id doesn't say it.
export function parseLoaderId(versionId) {
    if (!versionId) {
        return null;
    }
    const loom = versionId.match(/^(fabric|quilt)-loader-([^-]+)-(.+)$/);
    if (loom) {
        return { loader: loom[1], loaderVersion: loom[2], gameVersion: loom[3] };
    }
    const neoforge = versionId.match(/^neoforge-(.+)$/i);
    if (neoforge) {
        return { loader: 'neoforge', loaderVersion: neoforge[1], gameVersion: neoforgeGameVersion(neoforge[1]) };
    }
    const forge = versionId.match(/^(.+?)-forge-?(.+)$/i);
    if (forge) {
        // Old Forge ids repeat the Minecraft version: 1.12.2-forge1.12.2-14.23.5.2859.
        const repeated = `${forge[1]}-`;
        const loaderVersion = forge[2].startsWith(repeated) ? forge[2].slice(repeated.length) : forge[2];
        return { loader: 'forge', loaderVersion, gameVersion: forge[1] };
    }
    return null;
}

// "Minecraft 1.21.1 · Fabric 0.16.5" for a loader version, the id itself otherwise.
export function describeVersionId(versionId) {
    const parsed = parseLoaderId(versionId);
    if (!parsed) {
        return versionId;
    }
    const loader = `${LOADERS[parsed.loader]} ${parsed.loaderVersion}`;
    return parsed.gameVersion ? `Minecraft ${parsed.gameVersion} · ${loader}` : loader;
}
