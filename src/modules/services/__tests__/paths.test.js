import os from 'os';
import path from 'path';

let paths;

beforeEach(() => {
    window.require = name =>
        name === 'os' ? { ...os, homedir: () => '/home/steve', platform: () => 'linux' } : require(name);
    jest.isolateModules(() => {
        paths = require('../paths');
    });
});

test('finds the launcher folder on each OS', () => {
    const home = path.join('/', 'users', 'steve');
    expect(paths.gameDirFor('win32', home)).toBe(path.join(home, 'AppData', 'Roaming', '.minecraft'));
    expect(paths.gameDirFor('darwin', home)).toBe(path.join(home, 'Library', 'Application Support', 'minecraft'));
    expect(paths.gameDirFor('linux', home)).toBe(path.join(home, '.minecraft'));
});

test('uses the folder for the OS it runs on', () => {
    expect(paths.minecraftDir()).toBe(path.join('/home/steve', '.minecraft'));
    expect(paths.defaultGameDir).toBe(paths.minecraftDir());
});
