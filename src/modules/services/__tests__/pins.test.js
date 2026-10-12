import { installBridge, removeBridge } from '../__fixtures__/bridge';

const fs = require('fs');
const os = require('os');
const path = require('path');

let home;
let gameDir;
let pins;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tmods-pins-'));
    gameDir = path.join(home, 'AppData', 'Roaming', '.minecraft');
    fs.mkdirSync(gameDir, { recursive: true });
    installBridge(home);
    jest.isolateModules(() => {
        pins = require('../pins');
    });
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    removeBridge();
});

it('remembers which versions a game folder keeps, each on its own', () => {
    expect(pins.isPinned(gameDir, 'mods')).toBe(false);

    pins.setPinned(gameDir, 'mods', true);
    pins.setPinned(gameDir, pins.PACKS, true);
    expect(pins.isPinned(gameDir, 'mods')).toBe(true);
    expect(pins.isPinned(gameDir, 'packs')).toBe(true);
    expect(pins.isPinned(gameDir, 'configs')).toBe(false);

    pins.setPinned(gameDir, 'mods', false);
    expect(pins.isPinned(gameDir, 'mods')).toBe(false);
    expect(pins.isPinned(gameDir, 'packs')).toBe(true);
});

it('reads an unreadable record as keeping nothing', () => {
    fs.mkdirSync(path.join(gameDir, '.tmods_loader'));
    fs.writeFileSync(path.join(gameDir, '.tmods_loader', 'pins.json'), 'not json');
    expect(pins.isPinned(gameDir, 'mods')).toBe(false);
});
