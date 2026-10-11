// Where Minecraft lives on this computer. The main process works it out (bridge.js), since
// it's also the only folder the page is allowed to touch.
import { minecraftDir as launcherDir } from './node';

// The official launcher's own folder: its profile files, installed versions, and the
// default game folder.
export const defaultGameDir = launcherDir;

export function minecraftDir() {
    return defaultGameDir;
}
