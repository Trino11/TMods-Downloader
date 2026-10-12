// Builds servers.dat bytes by hand, byte by byte, the way the game writes them, so tests
// check the reader against the format rather than against TMods' own writer.
// `servers` are { name, ip, acceptTextures?, icon?, extra? } with `extra` raw tag bytes.
function nbtString(text) {
    const bytes = Buffer.from(text, 'utf-8');
    const length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    return Buffer.concat([length, bytes]);
}

function named(type, name, payload) {
    return Buffer.concat([Buffer.from([type]), nbtString(name), payload]);
}

function serversDat(servers) {
    const count = Buffer.alloc(4);
    count.writeInt32BE(servers.length);
    const entries = servers.map(server =>
        Buffer.concat([
            server.icon ? named(8, 'icon', nbtString(server.icon)) : Buffer.alloc(0),
            named(8, 'ip', nbtString(server.ip)),
            named(8, 'name', nbtString(server.name)),
            server.acceptTextures === undefined
                ? Buffer.alloc(0)
                : named(1, 'acceptTextures', Buffer.from([server.acceptTextures])),
            server.extra || Buffer.alloc(0),
            Buffer.from([0]),
        ]),
    );
    const list = Buffer.concat([Buffer.from([servers.length ? 10 : 0]), count, ...entries]);
    return Buffer.concat([named(10, '', Buffer.concat([named(9, 'servers', list), Buffer.from([0])]))]);
}

module.exports = { serversDat, named, nbtString };
