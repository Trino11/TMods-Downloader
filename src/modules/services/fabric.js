// Installs Fabric into the official launcher's versions folder, the same way Fabric's
// own installer does, but without Java: Fabric's public meta service
// (https://meta.fabricmc.net) hands out the launcher version json for any Minecraft
// and loader version, and that json is all the launcher needs. It inherits from the
// vanilla version and lists Fabric's libraries with their Maven urls, so the launcher
// downloads both the first time the profile is played.
import axios from 'axios';
import { minecraftDir } from './paths';
import { fs, path } from './node';
import { t } from '../i18n';

export const META_URL = 'https://meta.fabricmc.net/v2';

async function get(route) {
    const { data } = await axios.get(`${META_URL}${route}`);
    return data;
}

// Fabric's installer names the version fabric-loader-<loader>-<minecraft>, which is
// also how the Modrinth page recognises a Fabric profile.
export function fabricVersionId(gameVersion, loaderVersion) {
    return `fabric-loader-${loaderVersion}-${gameVersion}`;
}

// Minecraft versions Fabric supports, newest first. Snapshots are left out unless asked for.
export async function listFabricGameVersions({ snapshots = false } = {}) {
    const versions = await get('/versions/game');
    return versions.filter(v => snapshots || v.stable).map(v => v.version);
}

// The newest stable loader that runs on this Minecraft version.
export async function latestLoaderVersion(gameVersion) {
    const entries = await get(`/versions/loader/${encodeURIComponent(gameVersion)}`);
    const stable = entries.find(entry => entry.loader.stable);
    if (!stable) {
        throw new Error(t('services.fabric.noStableLoader', { gameVersion }));
    }
    return stable.loader.version;
}

// Version strings end up in a folder name, so refuse anything that could leave it.
// `messageKey` is the error to show, under services.fabric.
function checkVersion(messageKey, version) {
    if (!version || /[\\/]|\.\./.test(version)) {
        throw new Error(t(`services.fabric.${messageKey}`, { version }));
    }
}

// Writes versions/<id>/<id>.json for Fabric on this Minecraft version (latest stable
// loader unless one is given) and returns the launcher version id to put on a profile.
// Reinstalling the same version just rewrites the json.
export async function installFabric(gameVersion, { loaderVersion } = {}) {
    checkVersion('invalidGameVersion', gameVersion);
    const loader = loaderVersion || (await latestLoaderVersion(gameVersion));
    checkVersion('invalidLoaderVersion', loader);

    const profile = await get(
        `/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loader)}/profile/json`,
    );
    if (!profile || profile.inheritsFrom !== gameVersion || !Array.isArray(profile.libraries)) {
        throw new Error(t('services.fabric.unexpectedProfile', { gameVersion }));
    }

    const id = fabricVersionId(gameVersion, loader);
    const dir = path.join(minecraftDir(), 'versions', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ ...profile, id }, null, 2));
    // Like Fabric's installer: no jar of its own, the launcher uses the vanilla one.
    fs.rmSync(path.join(dir, `${id}.jar`), { force: true });
    return id;
}
