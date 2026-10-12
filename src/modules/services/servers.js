// The Multiplayer server list of a game folder (its servers.dat): reading and editing it
// for the Profiles page, merging lists from packs and bundles into it instead of
// replacing it, and keeping the servers the channel's manifest lists in it.
//
// The game reads the file when the Multiplayer screen opens and rewrites it whenever the
// player changes the list there, so a change made while the game runs can be undone by
// the game. Callers tell the player to close it first.
import { parseServers, RESOURCE_PACK, serializeServers } from './serversDat';
import { fetchCurrentManifest } from './manifest';
import { listProfiles, profileGameDir } from './profiles';
import { fs, path } from './node';
import { t } from '../i18n';

export { RESOURCE_PACK };

export const SERVERS_FILE = 'servers.dat';
// The game's own copy of the previous list, which it writes the same way.
const PREVIOUS_FILE = 'servers.dat_old';
const STATE_FOLDER = '.tmods_loader';
// The manifest servers TMods put in this folder's list, by address.
const MANAGED_FILE = 'servers.json';

function serversFile(gameDir) {
    return path.join(gameDir, SERVERS_FILE);
}

// Addresses are compared without case or a default port, as the game connects to them.
export function sameAddress(a, b) {
    const key = address =>
        String(address || '')
            .trim()
            .toLowerCase()
            .replace(/:25565$/, '');
    return key(a) === key(b);
}

// Reads a servers.dat's bytes, with a message a player can act on when it's broken.
export function readServersData(data) {
    try {
        return parseServers(data);
    } catch (error) {
        throw new Error(t('services.servers.unreadable', { reason: error.message }), { cause: error });
    }
}

// The folder's servers, in the game's order ([] when it has no list yet).
export function readServers(gameDir) {
    const file = serversFile(gameDir);
    return fs.existsSync(file) ? readServersData(fs.readFileSync(file)) : [];
}

function checked(servers) {
    return servers.map(server => {
        const name = String(server.name || '').trim();
        const address = String(server.address || '').trim();
        if (!address) {
            throw new Error(t('services.servers.addressRequired'));
        }
        if (/\s/.test(address)) {
            throw new Error(t('services.servers.badAddress', { address }));
        }
        return { ...server, name: name || t('services.servers.defaultName'), address };
    });
}

// Saves the folder's list, keeping the one before as servers.dat_old like the game does.
// Nothing is written when the list is the same. Returns whether the file changed.
export function writeServers(gameDir, servers) {
    const file = serversFile(gameDir);
    const data = serializeServers(checked(servers));
    if (fs.existsSync(file)) {
        const before = fs.readFileSync(file);
        if (sameBytes(before, data)) {
            return false;
        }
        fs.writeFileSync(path.join(gameDir, PREVIOUS_FILE), before);
    } else {
        fs.mkdirSync(gameDir, { recursive: true });
    }
    fs.writeFileSync(file, data);
    return true;
}

function sameBytes(a, b) {
    const left = new Uint8Array(a);
    return left.length === b.length && left.every((byte, i) => byte === b[i]);
}

// `incoming` servers added to `current`: the ones `current` doesn't have go first, in
// their order, and the player's own stay as they are.
export function mergeServers(current, incoming) {
    const added = [];
    for (const server of incoming) {
        if (![...current, ...added].some(other => sameAddress(other.address, server.address))) {
            added.push(server);
        }
    }
    return [...added, ...current];
}

// For an install that is about to copy `staged` (a folder laid out like the game folder)
// over `gameDir`: when both have a server list, the staged one becomes the merge of the
// two, so the copy adds the new servers instead of wiping the player's list. A list
// that can't be read is left to the copy as it is.
export function mergeStagedServers(staged, gameDir) {
    const incomingFile = serversFile(staged);
    if (!fs.existsSync(incomingFile) || !fs.existsSync(serversFile(gameDir))) {
        return;
    }
    let current;
    try {
        current = readServers(gameDir);
    } catch (error) {
        console.error('Replacing an unreadable server list:', error);
        return;
    }
    let incoming;
    try {
        incoming = readServers(staged);
    } catch (error) {
        console.error("Keeping the player's server list over an unreadable one:", error);
        fs.rmSync(incomingFile, { force: true });
        return;
    }
    fs.writeFileSync(incomingFile, serializeServers(mergeServers(current, incoming)));
}

// The servers a manifest lists for players, as { name, address, resourcePack }. The
// manifest's `servers` is a list of { name, address, resourcePack } with resourcePack
// "enabled", "disabled" or "prompt" (the default: the game asks).
export function manifestServers(manifest) {
    if (!Array.isArray(manifest?.servers)) {
        return [];
    }
    const servers = [];
    for (const entry of manifest.servers) {
        const address = typeof entry?.address === 'string' ? entry.address.trim() : '';
        if (!address || /\s/.test(address) || servers.some(other => sameAddress(other.address, address))) {
            continue;
        }
        const resourcePack = Object.values(RESOURCE_PACK).includes(entry.resourcePack)
            ? entry.resourcePack
            : RESOURCE_PACK.PROMPT;
        servers.push({
            name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : address,
            address,
            resourcePack,
        });
    }
    return servers;
}

// The addresses of the manifest servers TMods put in the folder's list.
export function readManaged(gameDir) {
    try {
        const { addresses } = JSON.parse(fs.readFileSync(path.join(gameDir, STATE_FOLDER, MANAGED_FILE), 'utf-8'));
        return Array.isArray(addresses) ? addresses.filter(address => typeof address === 'string') : [];
    } catch {
        return [];
    }
}

function writeManaged(gameDir, addresses) {
    fs.mkdirSync(path.join(gameDir, STATE_FOLDER), { recursive: true });
    fs.writeFileSync(path.join(gameDir, STATE_FOLDER, MANAGED_FILE), JSON.stringify({ addresses }, null, 2));
}

// Whether `server` is one the manifest put in the folder's list.
export function isManaged(managed, server) {
    return managed.some(address => sameAddress(address, server.address));
}

// Brings the folder's list in line with the manifest's servers (`wanted`, as
// manifestServers returns them):
// - a server new to the manifest is added at the top;
// - one TMods added keeps its place, and follows the manifest's name and resource pack
//   setting;
// - one TMods added that the player deleted stays deleted;
// - one TMods added that the manifest no longer lists is removed.
// The player's own servers are never touched, even one the manifest lists too. Returns whether the list changed.
export function applyManifestServers(gameDir, wanted) {
    const managed = readManaged(gameDir);
    const current = readServers(gameDir);
    const has = (list, address) => list.some(item => sameAddress(item.address ?? item, address));

    const kept = current
        .filter(server => !(has(managed, server.address) && !has(wanted, server.address)))
        .map(server => {
            const update = wanted.find(item => sameAddress(item.address, server.address));
            return update && has(managed, server.address)
                ? { ...server, name: update.name, resourcePack: update.resourcePack }
                : server;
        });
    const added = wanted.filter(server => !has(managed, server.address) && !has(current, server.address));
    const nextManaged = wanted
        .filter(server => has(managed, server.address) || !has(current, server.address))
        .map(server => server.address);

    if (nextManaged.length !== managed.length || nextManaged.some(address => !has(managed, address))) {
        writeManaged(gameDir, nextManaged);
    }
    if (added.length === 0 && kept.length === current.length && kept.every((server, i) => server === current[i])) {
        return false;
    }
    return writeServers(gameDir, [...added, ...kept]);
}

// The manifest `profile` follows. The one place servers look a manifest up, so per-profile
// manifests only change this function.
export function manifestFor(profile) {
    // Every profile follows the one manifest URL for now.
    void profile;
    return fetchCurrentManifest();
}

// Brings one profile's list in line with the servers of the manifest it follows.
// Returns whether the list changed.
export async function syncProfileServers(profile) {
    const gameDir = profileGameDir(profile);
    const wanted = manifestServers(await manifestFor(profile));
    // Nothing to do in a folder that was never played, or never had channel servers.
    if (!fs.existsSync(gameDir) || (wanted.length === 0 && readManaged(gameDir).length === 0)) {
        return false;
    }
    return applyManifestServers(gameDir, wanted);
}

// Puts the manifest's servers in every profile's list. Returns the names of the
// profiles whose list changed. A profile whose manifest or list fails is skipped (and
// logged), so one broken file doesn't stop the others.
export async function syncManifestServers() {
    const changed = [];
    for (const profile of listProfiles()) {
        try {
            if (await syncProfileServers(profile)) {
                changed.push(profile.name);
            }
        } catch (error) {
            console.error(`Could not update the server list of ${profile.name}:`, error);
        }
    }
    return changed;
}
