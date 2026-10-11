// The folder itself is worked out by the main process (defaultMinecraftDir in
// public/bridge.js, tested in test/__tests__/bridge.test.js); the page just uses it.
let paths;

beforeEach(() => {
    window.tmods = { minecraftDir: '/home/steve/.minecraft' };
    jest.isolateModules(() => {
        paths = require('../paths');
    });
});

afterEach(() => {
    delete window.tmods;
});

test('uses the folder the main process found', () => {
    expect(paths.minecraftDir()).toBe('/home/steve/.minecraft');
    expect(paths.defaultGameDir).toBe(paths.minecraftDir());
});
