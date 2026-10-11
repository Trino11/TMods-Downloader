import axios from 'axios';

const fs = window.require('fs');
const os = window.require('os');
const path = window.require('path');
const { Buffer } = window.require('buffer');
const AdmZip = window.require('adm-zip');

const minecraftDir = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
const stateRoot = path.join(minecraftDir, '.tmods_loader');

function stateDir(category) {
    return path.join(stateRoot, category.id);
}

function installedMarker(category) {
    return path.join(stateDir(category), 'downloaded.txt');
}

export function readInstalledVersion(category) {
    const marker = installedMarker(category);
    return fs.existsSync(marker) ? fs.readFileSync(marker, 'utf-8') : '';
}

function backupFolder(folder, clear) {
    if (!fs.existsSync(folder)) {
        return;
    }
    const backup = `${folder}_back`;
    fs.rmSync(backup, { recursive: true, force: true });
    fs.cpSync(folder, backup, { recursive: true });
    if (clear) {
        fs.rmSync(folder, { recursive: true, force: true });
    }
}

// Downloads a version's zip and extracts it over .minecraft, then records it as installed.
export async function installBundle(category, version) {
    const response = await axios.get(version.url, { responseType: 'arraybuffer' });

    fs.mkdirSync(stateDir(category), { recursive: true });
    const zipFile = path.join(stateDir(category), `${category.id}.zip`);
    fs.writeFileSync(zipFile, Buffer.from(response.data));

    try {
        if (category.backupFolder) {
            backupFolder(path.join(minecraftDir, category.backupFolder), category.clearFolder);
        }
        new AdmZip(zipFile).extractAllTo(minecraftDir, true);
    } finally {
        fs.unlinkSync(zipFile);
    }

    fs.writeFileSync(installedMarker(category), version.id, 'utf-8');
}
