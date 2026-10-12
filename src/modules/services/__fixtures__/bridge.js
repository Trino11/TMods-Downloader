// Gives tests the window.tmods the preload script would, backed directly by the main
// process's bridge (public/bridge.js), so services run against the real checks. Like the
// real IPC, binary results come back as plain Uint8Arrays rather than Node Buffers.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createBridge } = require('../../../../public/bridge');

function asIpc(value) {
    if (Buffer.isBuffer(value)) {
        return new Uint8Array(value);
    }
    if (Array.isArray(value)) {
        return value.map(asIpc);
    }
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asIpc(item)]));
    }
    return value;
}

// Files may be touched anywhere under `home`; the launcher folder is the one under
// AppData, as on Windows.
function installBridge(home) {
    const minecraftDir = path.join(home, 'AppData', 'Roaming', '.minecraft');
    const bridge = createBridge({
        fs,
        path,
        crypto,
        AdmZip: require('adm-zip'),
        platform: process.platform,
        minecraftDir,
        roots: [home],
    });
    const { methods, ...info } = bridge.info;
    const api = {
        ...info,
        http: jest.fn(() => Promise.reject(new Error('No network in tests'))),
        // The bundles repository calls (public/bundlePublisher.js); tests set what they need.
        github: {
            status: jest.fn(() => Promise.resolve({ hasToken: false })),
            saveToken: jest.fn(() => Promise.resolve()),
            forgetToken: jest.fn(() => Promise.resolve()),
            versions: jest.fn(() => Promise.resolve([])),
            publish: jest.fn(() => Promise.reject(new Error('No network in tests'))),
        },
    };
    for (const method of methods) {
        const [group, name] = method.split('.');
        api[group] = api[group] || {};
        api[group][name] = (...args) => asIpc(bridge.methods[method](...args));
    }
    window.tmods = api;
    return api;
}

function removeBridge() {
    delete window.tmods;
}

module.exports = { installBridge, removeBridge };
