// "Keep this version": a profile can hold on to the version of a channel category (or of
// the channel's pack) it has, so newer ones aren't offered or installed as updates until
// the player lets them through again. Picking another version by hand still installs it,
// and the profile then keeps that one.
//
// The choice lives in the game folder, next to TMods' record of what is installed, so
// each profile has its own.
import { fs, path } from './node';

// The id the channel's pack is kept under, the same as its manifest category.
export const PACKS = 'packs';

function pinsFile(gameDir) {
    return path.join(gameDir, '.tmods_loader', 'pins.json');
}

function readPins(gameDir) {
    try {
        const pins = JSON.parse(fs.readFileSync(pinsFile(gameDir), 'utf-8'));
        return pins && typeof pins === 'object' ? pins : {};
    } catch {
        return {};
    }
}

// Whether the profile in `gameDir` keeps the version of `categoryId` it has.
export function isPinned(gameDir, categoryId) {
    return readPins(gameDir)[categoryId] === true;
}

export function setPinned(gameDir, categoryId, pinned) {
    const pins = readPins(gameDir);
    if (pinned) {
        pins[categoryId] = true;
    } else {
        delete pins[categoryId];
    }
    fs.mkdirSync(path.dirname(pinsFile(gameDir)), { recursive: true });
    fs.writeFileSync(pinsFile(gameDir), JSON.stringify(pins, null, 2));
}
