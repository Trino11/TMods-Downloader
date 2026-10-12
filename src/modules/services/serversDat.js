// servers.dat, the game folder file that holds the Multiplayer screen's server list. It
// is uncompressed NBT (https://minecraft.wiki/w/Servers.dat_format): a root compound
// with a `servers` list of compounds, each with `name`, `ip` and optionally `icon`
// (a base64 PNG the game saves after pinging), `acceptTextures` (1 = use the server's
// resource pack, 0 = don't, missing = ask) and `hidden`.
//
// Reading keeps every tag, known or not, so writing the list back never loses something
// a newer game version (or a mod) stored there.

const TAG = {
    END: 0,
    BYTE: 1,
    SHORT: 2,
    INT: 3,
    LONG: 4,
    FLOAT: 5,
    DOUBLE: 6,
    BYTE_ARRAY: 7,
    STRING: 8,
    LIST: 9,
    COMPOUND: 10,
    INT_ARRAY: 11,
    LONG_ARRAY: 12,
};

export const RESOURCE_PACK = { PROMPT: 'prompt', ENABLED: 'enabled', DISABLED: 'disabled' };

class NbtError extends Error {}

// Java's "modified UTF-8": NUL is two bytes and characters outside the BMP are two
// three-byte surrogates, instead of one four-byte sequence.
function decodeString(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length;) {
        const a = bytes[i++];
        if (a < 0x80) {
            out += String.fromCharCode(a);
        } else if ((a & 0xe0) === 0xc0) {
            out += String.fromCharCode(((a & 0x1f) << 6) | (bytes[i++] & 0x3f));
        } else {
            const b = bytes[i++];
            const c = bytes[i++];
            out += String.fromCharCode(((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f));
        }
    }
    return out;
}

function encodeString(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code >= 0x01 && code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    if (bytes.length > 0xffff) {
        throw new NbtError('Text too long for servers.dat.');
    }
    return bytes;
}

// Tags are { type, value }: numbers for byte/short/int/float/double, BigInt for long,
// arrays for the array types, a string, { itemType, items } for a list and an array of
// [name, tag] pairs (in file order) for a compound.
function readTag(view, bytes, start) {
    let offset = start;
    const need = count => {
        if (offset + count > bytes.length) {
            throw new NbtError('servers.dat ends too early.');
        }
        const at = offset;
        offset += count;
        return at;
    };
    const string = () => {
        const length = view.getUint16(need(2));
        const at = need(length);
        return decodeString(bytes.subarray(at, at + length));
    };
    const payload = (type, depth) => {
        if (depth > 64) {
            throw new NbtError('servers.dat is nested too deeply.');
        }
        switch (type) {
            case TAG.BYTE:
                return view.getInt8(need(1));
            case TAG.SHORT:
                return view.getInt16(need(2));
            case TAG.INT:
                return view.getInt32(need(4));
            case TAG.LONG:
                return view.getBigInt64(need(8));
            case TAG.FLOAT:
                return view.getFloat32(need(4));
            case TAG.DOUBLE:
                return view.getFloat64(need(8));
            case TAG.BYTE_ARRAY: {
                const length = view.getInt32(need(4));
                const at = need(Math.max(length, 0));
                return Array.from(bytes.subarray(at, at + length), byte => (byte << 24) >> 24);
            }
            case TAG.STRING:
                return string();
            case TAG.LIST: {
                const itemType = view.getInt8(need(1));
                const length = view.getInt32(need(4));
                const items = [];
                for (let i = 0; i < length; i++) {
                    items.push({ type: itemType, value: payload(itemType, depth + 1) });
                }
                return { itemType, items };
            }
            case TAG.COMPOUND: {
                const entries = [];
                for (;;) {
                    const childType = view.getInt8(need(1));
                    if (childType === TAG.END) {
                        return entries;
                    }
                    const name = string();
                    entries.push([name, { type: childType, value: payload(childType, depth + 1) }]);
                }
            }
            case TAG.INT_ARRAY: {
                const length = view.getInt32(need(4));
                return Array.from({ length: Math.max(length, 0) }, () => view.getInt32(need(4)));
            }
            case TAG.LONG_ARRAY: {
                const length = view.getInt32(need(4));
                return Array.from({ length: Math.max(length, 0) }, () => view.getBigInt64(need(8)));
            }
            default:
                throw new NbtError(`servers.dat has an unknown tag type ${type}.`);
        }
    };

    const type = view.getInt8(need(1));
    if (type !== TAG.COMPOUND) {
        throw new NbtError("servers.dat doesn't start with a compound tag.");
    }
    const name = string();
    return { name, tag: { type, value: payload(type, 0) } };
}

function writeTag(name, tag) {
    const out = [];
    const u16 = n => out.push((n >> 8) & 0xff, n & 0xff);
    const i32 = n => out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    const viaView = (size, set) => {
        const buffer = new DataView(new ArrayBuffer(size));
        set(buffer);
        out.push(...new Uint8Array(buffer.buffer));
    };
    const string = text => {
        const bytes = encodeString(text);
        u16(bytes.length);
        out.push(...bytes);
    };
    const payload = ({ type, value }) => {
        switch (type) {
            case TAG.BYTE:
                out.push(value & 0xff);
                break;
            case TAG.SHORT:
                u16(value & 0xffff);
                break;
            case TAG.INT:
                i32(value);
                break;
            case TAG.LONG:
                viaView(8, view => view.setBigInt64(0, BigInt(value)));
                break;
            case TAG.FLOAT:
                viaView(4, view => view.setFloat32(0, value));
                break;
            case TAG.DOUBLE:
                viaView(8, view => view.setFloat64(0, value));
                break;
            case TAG.BYTE_ARRAY:
                i32(value.length);
                out.push(...value.map(byte => byte & 0xff));
                break;
            case TAG.STRING:
                string(value);
                break;
            case TAG.LIST:
                out.push(value.items.length ? value.itemType : TAG.END);
                i32(value.items.length);
                value.items.forEach(payload);
                break;
            case TAG.COMPOUND:
                for (const [childName, child] of value) {
                    out.push(child.type);
                    string(childName);
                    payload(child);
                }
                out.push(TAG.END);
                break;
            case TAG.INT_ARRAY:
                i32(value.length);
                value.forEach(i32);
                break;
            case TAG.LONG_ARRAY:
                i32(value.length);
                value.forEach(n => viaView(8, view => view.setBigInt64(0, BigInt(n))));
                break;
            default:
                throw new NbtError(`Unknown tag type ${type}.`);
        }
    };
    out.push(tag.type);
    string(name);
    payload(tag);
    return Uint8Array.from(out);
}

function toBytes(data) {
    if (data instanceof Uint8Array) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return new Uint8Array(data);
}

function field(entries, name) {
    return entries.find(([entryName]) => entryName === name)?.[1];
}

// The servers in a servers.dat (its bytes), in the game's order, as { name, address,
// resourcePack, hidden, extra }: `resourcePack` is one of RESOURCE_PACK, `extra` the
// entry's other tags (its icon, for one), kept so writing it back loses nothing.
export function parseServers(data) {
    const bytes = toBytes(data);
    if (bytes.length === 0) {
        return [];
    }
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        throw new NbtError('servers.dat is compressed, which the game never does.');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const { tag } = readTag(view, bytes, 0);
    const list = field(tag.value, 'servers');
    if (!list) {
        return [];
    }
    if (list.type !== TAG.LIST || (list.value.items.length && list.value.itemType !== TAG.COMPOUND)) {
        throw new NbtError("servers.dat's server list isn't a list of servers.");
    }
    return list.value.items.map(({ value: entries }) => {
        const text = name => {
            const tagged = field(entries, name);
            return tagged?.type === TAG.STRING ? tagged.value : '';
        };
        const accept = field(entries, 'acceptTextures');
        const hidden = field(entries, 'hidden');
        return {
            name: text('name'),
            address: text('ip'),
            resourcePack: !accept
                ? RESOURCE_PACK.PROMPT
                : accept.value
                  ? RESOURCE_PACK.ENABLED
                  : RESOURCE_PACK.DISABLED,
            hidden: Boolean(hidden?.value),
            extra: entries.filter(([name]) => !['name', 'ip', 'acceptTextures', 'hidden'].includes(name)),
        };
    });
}

// The bytes of a servers.dat holding `servers` (as parseServers returns them; `extra`
// and `hidden` may be left out).
export function serializeServers(servers) {
    const items = servers.map(server => {
        const entries = [
            ['name', { type: TAG.STRING, value: String(server.name ?? '') }],
            ['ip', { type: TAG.STRING, value: String(server.address ?? '') }],
        ];
        if (server.resourcePack === RESOURCE_PACK.ENABLED || server.resourcePack === RESOURCE_PACK.DISABLED) {
            entries.push([
                'acceptTextures',
                { type: TAG.BYTE, value: server.resourcePack === RESOURCE_PACK.ENABLED ? 1 : 0 },
            ]);
        }
        if (server.hidden) {
            entries.push(['hidden', { type: TAG.BYTE, value: 1 }]);
        }
        return { type: TAG.COMPOUND, value: [...entries, ...(server.extra || [])] };
    });
    const root = {
        type: TAG.COMPOUND,
        value: [['servers', { type: TAG.LIST, value: { itemType: TAG.COMPOUND, items } }]],
    };
    return writeTag('', root);
}
