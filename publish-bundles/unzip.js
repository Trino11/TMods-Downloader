// A small, dependency-free zip reader for the .mrpack files a bundle can be built from.
// It handles what Modrinth, Prism, packwiz and TMods write: stored or deflated entries,
// no encryption, no Zip64.
const zlib = require('zlib');

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEnd(data) {
    // The end record is 22 bytes plus a comment of up to 65,535 bytes.
    const stop = Math.max(0, data.length - 22 - 0xffff);
    for (let at = data.length - 22; at >= stop; at--) {
        if (data.readUInt32LE(at) === END_SIGNATURE) {
            return at;
        }
    }
    throw new Error("it isn't a zip file");
}

// Returns [{ name, data }] for every file in the zip (folders are left out).
function readZip(data) {
    const end = findEnd(data);
    const count = data.readUInt16LE(end + 10);
    let at = data.readUInt32LE(end + 16);
    const files = [];
    for (let i = 0; i < count; i++) {
        if (data.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
            throw new Error('its file list is damaged');
        }
        const method = data.readUInt16LE(at + 10);
        const size = data.readUInt32LE(at + 20);
        const nameLength = data.readUInt16LE(at + 28);
        const extraLength = data.readUInt16LE(at + 30);
        const commentLength = data.readUInt16LE(at + 32);
        const offset = data.readUInt32LE(at + 42);
        const name = data.toString('utf-8', at + 46, at + 46 + nameLength);
        at += 46 + nameLength + extraLength + commentLength;
        if (name.endsWith('/')) {
            continue;
        }

        if (data.readUInt32LE(offset) !== LOCAL_SIGNATURE) {
            throw new Error(`${name} is damaged`);
        }
        const start = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28);
        const body = data.subarray(start, start + size);
        if (method === 0) {
            files.push({ name, data: Buffer.from(body) });
        } else if (method === 8) {
            files.push({ name, data: zlib.inflateRawSync(body) });
        } else {
            throw new Error(`${name} uses a compression method (${method}) this reader doesn't support`);
        }
    }
    return files;
}

module.exports = { readZip };
