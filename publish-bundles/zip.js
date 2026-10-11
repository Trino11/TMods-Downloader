// A small, dependency-free zip writer, so the action runs on a bare runner without an
// npm install. Output is deterministic: entries are sorted and carry a fixed timestamp,
// so the same files always give the same bytes (and the same sha256), which lets a
// publish skip re-uploading bundles that haven't changed.
const zlib = require('zlib');

// 1980-01-01 00:00, the earliest time a zip can hold.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const MAX_32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

// `files`: [{ name, data }] with `name` a forward-slash path inside the zip.
function createZip(files) {
    const entries = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (entries.length > MAX_ENTRIES) {
        throw new Error(`Too many files for one zip (${entries.length}, at most ${MAX_ENTRIES}).`);
    }

    const chunks = [];
    const central = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBytes = Buffer.from(name, 'utf-8');
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        const stored = deflated.length >= data.length;
        const body = stored ? data : deflated;
        const crc = zlib.crc32(data);
        if (data.length > MAX_32 || offset > MAX_32) {
            throw new Error(`${name} doesn't fit in a zip without Zip64 (over 4 GB).`);
        }

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4); // version needed
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(stored ? 0 : 8, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        local.writeUInt16LE(0, 28);

        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014b50, 0);
        header.writeUInt16LE(20, 4); // version made by
        header.writeUInt16LE(20, 6);
        header.writeUInt16LE(0x0800, 8);
        header.writeUInt16LE(stored ? 0 : 8, 10);
        header.writeUInt16LE(DOS_TIME, 12);
        header.writeUInt16LE(DOS_DATE, 14);
        header.writeUInt32LE(crc, 16);
        header.writeUInt32LE(body.length, 20);
        header.writeUInt32LE(data.length, 24);
        header.writeUInt16LE(nameBytes.length, 28);
        header.writeUInt32LE(offset, 42);
        central.push(header, nameBytes);

        chunks.push(local, nameBytes, body);
        offset += local.length + nameBytes.length + body.length;
    }

    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    if (offset > MAX_32) {
        throw new Error('The zip is over 4 GB, which needs Zip64.');
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...chunks, ...central, end]);
}

module.exports = { createZip };
