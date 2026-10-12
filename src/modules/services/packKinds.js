import { formatNumber, t } from '../i18n';

// Every kind of file a pack can carry, in the order the Packs page lists them. Export
// scans a profile for these, and import sorts a pack's files into them. Adding a kind is
// one entry here.
// Labels are getters so they follow the chosen language.
//
// `folders`: game-folder folders whose entries are this kind (each file or subfolder at
// the top of one is an item). `paths`: single files that are this kind.
// `ticked`: picked by default when exporting. `modrinth`: the Modrinth kind (services/
// modrinth.js KINDS) whose files can go into a pack as download links.
export const PACK_KINDS = [
    {
        id: 'mod',
        get label() {
            return t('packs.kinds.mods');
        },
        folders: ['mods'],
        ticked: true,
        modrinth: 'mod',
    },
    {
        id: 'resourcepack',
        get label() {
            return t('packs.kinds.resourcepacks');
        },
        folders: ['resourcepacks'],
        ticked: true,
        modrinth: 'resourcepack',
    },
    {
        id: 'shader',
        get label() {
            return t('packs.kinds.shaders');
        },
        folders: ['shaderpacks'],
        ticked: true,
        modrinth: 'shader',
    },
    {
        id: 'config',
        get label() {
            return t('packs.kinds.configs');
        },
        folders: ['config', 'defaultconfigs'],
        ticked: true,
    },
    {
        id: 'schematic',
        get label() {
            return t('packs.kinds.schematics');
        },
        folders: ['schematics'],
        ticked: false,
    },
    {
        id: 'settings',
        get label() {
            return t('packs.kinds.settings');
        },
        paths: ['options.txt', 'optionsof.txt', 'optionsshaders.txt'],
        ticked: false,
    },
    {
        id: 'servers',
        get label() {
            return t('packs.kinds.servers');
        },
        paths: ['servers.dat'],
        ticked: false,
    },
];

// What a pack from elsewhere may hold beyond the kinds above. Export never adds these.
export const OTHER_KIND = {
    id: 'other',
    get label() {
        return t('packs.kinds.other');
    },
    ticked: true,
};

const DISABLED_SUFFIX = '.disabled';

export function kindById(id) {
    return PACK_KINDS.find(kind => kind.id === id) || OTHER_KIND;
}

// The kind of a path in the game folder (forward slashes) and the item it belongs to:
// the entry at the top of the kind's folder (a jar, a pack zip, a pack or config
// folder) or the listed file itself. Returns { kind, item } with `item` a path.
export function itemOf(relative) {
    const parts = relative.split('/');
    const top = parts.length > 1 ? parts.slice(0, 2).join('/') : relative;
    for (const kind of PACK_KINDS) {
        if (kind.paths?.includes(relative)) {
            return { kind: kind.id, item: relative };
        }
        if (parts.length > 1 && kind.folders?.includes(parts[0])) {
            return { kind: kind.id, item: top };
        }
    }
    return { kind: OTHER_KIND.id, item: top };
}

// Whether the game uses an item: TMods turns mods, packs and shaders off by adding
// .disabled to their name.
export function isEnabled(item) {
    return !item.endsWith(DISABLED_SUFFIX);
}

// Groups files ({ path, size, ... }) into items: { id, kind, name, size, files }, in
// PACK_KINDS order and by name within a kind.
export function groupItems(files) {
    const items = new Map();
    for (const file of files) {
        const { kind, item } = itemOf(file.path);
        if (!items.has(item)) {
            items.set(item, { id: item, kind, name: item.split('/').pop(), size: 0, files: [] });
        }
        const entry = items.get(item);
        entry.files.push(file);
        entry.size += file.size || 0;
    }
    const order = [...PACK_KINDS, OTHER_KIND].map(kind => kind.id);
    return [...items.values()].sort(
        (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.id.localeCompare(b.id),
    );
}

// Sizes the way the Packs page shows them.
export function formatSize(bytes) {
    const oneDecimal = value => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (bytes < 1024) {
        return t('packs.size.bytes', { size: formatNumber(bytes) });
    }
    if (bytes < 1024 * 1024) {
        return t('packs.size.kilobytes', { size: oneDecimal(bytes / 1024) });
    }
    return t('packs.size.megabytes', { size: oneDecimal(bytes / (1024 * 1024)) });
}
