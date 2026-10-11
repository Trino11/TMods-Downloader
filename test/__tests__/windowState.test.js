const {
    MIN_WINDOW_SIZE,
    defaultWindowBounds,
    initialWindowState,
    loadWindowState,
    saveWindowState,
} = require('../../public/mainProcess');

// A 1920×1080 screen with a 40px taskbar at the bottom.
const fullHd = { x: 0, y: 0, width: 1920, height: 1040 };
// A second screen to the right of it.
const rightScreen = { x: 1920, y: 0, width: 2560, height: 1400 };

describe('defaultWindowBounds', () => {
    it('covers 80% of the work area, centered', () => {
        expect(defaultWindowBounds(fullHd)).toEqual({ x: 192, y: 104, width: 1536, height: 832 });
    });

    it('centers on a screen that does not start at the origin', () => {
        expect(defaultWindowBounds(rightScreen)).toEqual({ x: 2176, y: 140, width: 2048, height: 1120 });
    });

    it('never goes below the minimum size, unless the screen itself is smaller', () => {
        expect(defaultWindowBounds({ x: 0, y: 0, width: 900, height: 700 })).toEqual({
            x: 50,
            y: 50,
            ...MIN_WINDOW_SIZE,
        });
        expect(defaultWindowBounds({ x: 0, y: 0, width: 640, height: 480 })).toEqual({
            x: 0,
            y: 0,
            width: 640,
            height: 480,
        });
    });
});

describe('initialWindowState', () => {
    const fallback = { bounds: defaultWindowBounds(fullHd), isMaximized: false };

    it('uses the default when nothing was saved or the file is malformed', () => {
        expect(initialWindowState(null, [fullHd], fullHd)).toEqual(fallback);
        expect(initialWindowState({}, [fullHd], fullHd)).toEqual(fallback);
        expect(initialWindowState({ bounds: { x: 'a', y: 0, width: 1, height: 1 } }, [fullHd], fullHd)).toEqual(
            fallback,
        );
    });

    it('reopens where the user left it, maximized or not', () => {
        const bounds = { x: 100, y: 50, width: 1200, height: 900 };
        expect(initialWindowState({ bounds, isMaximized: true }, [fullHd], fullHd)).toEqual({
            bounds,
            isMaximized: true,
        });
        expect(initialWindowState({ bounds }, [fullHd], fullHd)).toEqual({ bounds, isMaximized: false });
    });

    it('reopens on a second screen while it is still connected', () => {
        const bounds = { x: 2200, y: 100, width: 1600, height: 1000 };
        expect(initialWindowState({ bounds, isMaximized: false }, [fullHd, rightScreen], fullHd).bounds).toEqual(
            bounds,
        );
    });

    it('falls back to the default when the saved screen was unplugged', () => {
        const bounds = { x: 2200, y: 100, width: 1600, height: 1000 };
        expect(initialWindowState({ bounds, isMaximized: true }, [fullHd], fullHd)).toEqual(fallback);
    });

    it('falls back when only a sliver of the window would be visible', () => {
        const bounds = { x: 1850, y: 100, width: 1000, height: 800 };
        expect(initialWindowState({ bounds }, [fullHd], fullHd)).toEqual(fallback);
    });

    it('enforces the minimum size and shrinks a window too big for its screen', () => {
        expect(
            initialWindowState({ bounds: { x: 10, y: 10, width: 300, height: 200 } }, [fullHd], fullHd).bounds,
        ).toEqual({ x: 10, y: 10, ...MIN_WINDOW_SIZE });
        expect(
            initialWindowState({ bounds: { x: 0, y: 0, width: 2500, height: 1300 } }, [fullHd], fullHd).bounds,
        ).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
    });
});

describe('loadWindowState and saveWindowState', () => {
    it('saves the normal bounds and maximized flag, and reads them back', () => {
        const files = {};
        const fs = {
            writeFileSync: (file, data) => (files[file] = data),
            readFileSync: file => {
                if (!(file in files)) throw new Error('ENOENT');
                return files[file];
            },
        };
        const window = {
            getNormalBounds: () => ({ x: 1, y: 2, width: 1000, height: 700 }),
            isMaximized: () => true,
        };

        expect(loadWindowState(fs, 'state.json')).toBeNull();
        saveWindowState(fs, 'state.json', window);
        expect(loadWindowState(fs, 'state.json')).toEqual({
            bounds: { x: 1, y: 2, width: 1000, height: 700 },
            isMaximized: true,
        });
    });

    it('treats an unreadable file as no saved state and ignores a failed write', () => {
        const fs = {
            readFileSync: () => '{not json',
            writeFileSync: () => {
                throw new Error('EACCES');
            },
        };
        expect(loadWindowState(fs, 'state.json')).toBeNull();
        expect(() =>
            saveWindowState(fs, 'state.json', { getNormalBounds: () => ({}), isMaximized: () => false }),
        ).not.toThrow();
    });
});
