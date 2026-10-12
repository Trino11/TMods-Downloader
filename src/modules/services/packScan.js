// Lists what a profile's game folder can put in a pack, for the Packs page's Export and
// Publish tabs: every item of every kind in packKinds.js, with its size and whether it
// can go in as a Modrinth download link instead of a copy.
import { adoptUnmanaged, readModList, trackedPath } from './modrinthMods';
import { PACK_KINDS, groupItems, isEnabled, kindById } from './packKinds';
import { fs, path } from './node';

function isFolder(file) {
    return fs.existsSync(file) && fs.statSync(file).isDirectory();
}

// Every file of every kind, as { path, size } with forward-slash paths.
function kindFiles(gameDir) {
    const files = [];
    for (const kind of PACK_KINDS) {
        for (const folder of kind.folders || []) {
            const dir = path.join(gameDir, folder);
            if (isFolder(dir)) {
                files.push(...fs.walkSync(dir).map(file => ({ path: `${folder}/${file.name}`, size: file.size })));
            }
        }
        for (const name of kind.paths || []) {
            const file = path.join(gameDir, name);
            if (fs.existsSync(file) && !isFolder(file)) {
                files.push({ path: name, size: fs.statSync(file).size });
            }
        }
    }
    return files;
}

// The items in `gameDir`, as { id, kind, name, title, size, files, enabled, link, ticked }:
// `id` is the item's path, `files` its files ({ path, size }), `link` the Modrinth
// download ({ url, hashes, size }) of an enabled file TMods tracks, else null, and
// `ticked` whether export picks it by default.
export function scanProfile(gameDir) {
    const tracked = new Map();
    for (const mod of readModList(gameDir).mods) {
        if (mod.enabled && mod.url) {
            tracked.set(trackedPath(mod), mod);
        }
    }
    return groupItems(kindFiles(gameDir)).map(item => {
        const single = item.files.length === 1 && item.files[0].path === item.id;
        const mod = single ? tracked.get(item.id) : undefined;
        const enabled = isEnabled(item.id);
        return {
            ...item,
            title: mod?.title || item.name,
            enabled,
            link: mod ? { url: mod.url, hashes: { sha1: mod.sha1, sha512: mod.sha512 }, size: mod.size } : null,
            ticked: kindById(item.kind).ticked && enabled,
        };
    });
}

// Looks mods, resource packs and shaders added by hand up on Modrinth, so they can go
// into a pack as links rather than copies. Best effort: returns how many it recognised,
// and 0 when Modrinth can't be reached.
export async function recogniseFiles(gameDir) {
    let count = 0;
    for (const kind of PACK_KINDS.filter(item => item.modrinth)) {
        try {
            count += await adoptUnmanaged(gameDir, kind.modrinth);
        } catch (error) {
            console.error(`Could not look up ${kind.label.toLowerCase()} on Modrinth:`, error);
        }
    }
    return count;
}
