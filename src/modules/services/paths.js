// Where Minecraft lives on this computer.
import { os, path } from './node';

// The official launcher's own folder on each OS: its profile files
// (launcher_profiles.json), installed versions, and the default game folder.
export function gameDirFor(platform, home) {
    if (platform === 'win32') {
        return path.join(home, 'AppData', 'Roaming', '.minecraft');
    }
    if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'minecraft');
    }
    return path.join(home, '.minecraft');
}

export const defaultGameDir = gameDirFor(os.platform(), os.homedir());

export function minecraftDir() {
    return defaultGameDir;
}
