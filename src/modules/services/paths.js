// Where Minecraft lives on this computer.
import { os, path } from './node';

// The official launcher's own folder: its profile files, installed versions, and the
// default game folder.
export const defaultGameDir = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');

export function minecraftDir() {
    return defaultGameDir;
}
