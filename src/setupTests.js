// Runs before every test file (react-scripts picks it up automatically).
import '@testing-library/jest-dom';

beforeEach(() => {
    // Main-process tests run in plain Node, without a page or its storage.
    if (typeof localStorage !== 'undefined') {
        localStorage.clear();
    }
});

// Electron's page has TextDecoder and TextEncoder (React Router needs it); jsdom doesn't.
if (typeof global.TextDecoder === 'undefined') {
    global.TextDecoder = require('util').TextDecoder;
}
if (typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = require('util').TextEncoder;
}

// adm-zip spots buffers with `instanceof Uint8Array`, which fails under jsdom because
// Node's Buffer comes from another realm (in Electron there is only one). Let this
// realm's Uint8Array recognise Node's too, for tests only.
const NodeUint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
if (NodeUint8Array !== Uint8Array) {
    const isInstance = Function.prototype[Symbol.hasInstance];
    Object.defineProperty(Uint8Array, Symbol.hasInstance, {
        value: value => isInstance.call(Uint8Array, value) || isInstance.call(NodeUint8Array, value),
    });
}
