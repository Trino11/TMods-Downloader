// Profiles let each modpack live in its own game folder. Every profile except the
// default one also gets a matching entry in the official Minecraft Launcher, so the
// player picks it there and presses Play; TMods never launches the game itself.
//
// The app's profile list lives in localStorage (like the other settings) and is the
// source of truth: the launcher entries are rewritten from it whenever they drift.
import { defaultGameDir } from './bundleInstaller';

const fs = window.require('fs');
const path = window.require('path');

const PROFILES_KEY = 'tmods.profiles';
const ACTIVE_KEY = 'tmods.activeProfile';

export const DEFAULT_PROFILE_ID = 'default';
// Name of the profile TMods makes for itself when the player has none.
export const TMODS_PROFILE_NAME = 'TMods';
const LAUNCHER_KEY_PREFIX = 'tmods-';
const LAUNCHER_ICON = 'Crafting_Table';

// The official launcher reads one of these, depending on how it was installed.
const LAUNCHER_FILES = ['launcher_profiles.json', 'launcher_profiles_microsoft_store.json'];

// Version ids the launcher resolves on its own, so they work without anything installed.
export const LATEST_RELEASE = 'latest-release';
export const LATEST_SNAPSHOT = 'latest-snapshot';

// The official launcher's own folder, where its profile files and versions live.
export function minecraftDir() {
    return defaultGameDir;
}

function profilesRoot() {
    return path.join(minecraftDir(), 'tmods_profiles');
}

const defaultProfile = {
    id: DEFAULT_PROFILE_ID,
    name: 'Default (.minecraft)',
    // Played through whatever launcher profile the player already uses.
    gameVersion: '',
};

function readStored() {
    try {
        const stored = JSON.parse(localStorage.getItem(PROFILES_KEY));
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
}

function writeStored(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

// The default profile is the plain .minecraft folder TMods always installed into.
// It's built in, can't be renamed or deleted, and has no launcher entry of its own.
export function listProfiles() {
    return [defaultProfile, ...readStored()];
}

export function getActiveProfile() {
    const id = localStorage.getItem(ACTIVE_KEY);
    return listProfiles().find(profile => profile.id === id) || defaultProfile;
}

export function setActiveProfile(id) {
    localStorage.setItem(ACTIVE_KEY, id);
}

export function profileGameDir(profile) {
    return profile.id === DEFAULT_PROFILE_ID ? minecraftDir() : path.join(profilesRoot(), profile.id);
}

// Where installs go right now.
export function activeGameDir() {
    return profileGameDir(getActiveProfile());
}

// Ids double as folder names, so keep them to safe characters and unique.
function newProfileId(name, taken) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'profile';
    let id = slug;
    for (let n = 2; taken.has(id) || id === DEFAULT_PROFILE_ID; n++) {
        id = `${slug}-${n}`;
    }
    return id;
}

function cleanName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
        throw new Error('Give the profile a name.');
    }
    return trimmed;
}

export function createProfile({ name, gameVersion }) {
    const stored = readStored();
    const profile = {
        id: newProfileId(cleanName(name), new Set(stored.map(p => p.id))),
        name: cleanName(name),
        gameVersion: gameVersion || LATEST_RELEASE,
    };
    fs.mkdirSync(profileGameDir(profile), { recursive: true });
    writeStored([...stored, profile]);
    syncLauncherProfiles();
    return profile;
}

export function updateProfile(id, { name, gameVersion }) {
    if (id === DEFAULT_PROFILE_ID) {
        throw new Error('The default profile cannot be changed.');
    }
    const stored = readStored();
    const profile = stored.find(p => p.id === id);
    if (!profile) {
        throw new Error('That profile no longer exists.');
    }
    profile.name = cleanName(name);
    profile.gameVersion = gameVersion || LATEST_RELEASE;
    writeStored(stored);
    syncLauncherProfiles();
    return profile;
}

// Removes the profile from TMods and the launcher. Its game folder stays on disk so
// worlds and settings aren't lost; the caller tells the user where it is.
export function deleteProfile(id) {
    if (id === DEFAULT_PROFILE_ID) {
        throw new Error('The default profile cannot be deleted.');
    }
    writeStored(readStored().filter(p => p.id !== id));
    if (localStorage.getItem(ACTIVE_KEY) === id) {
        setActiveProfile(DEFAULT_PROFILE_ID);
    }
    syncLauncherProfiles();
}

// TMods always keeps at least one profile of its own: on first start, or once the
// last one is deleted (the app calls this whenever it reloads the list), it makes a "TMods" profile on the latest release and switches
// to it. The default .minecraft profile stays selectable. Returns the new profile, or
// null when there already was one.
export function ensureTModsProfile() {
    if (readStored().length > 0) {
        return null;
    }
    const profile = createProfile({ name: TMODS_PROFILE_NAME, gameVersion: LATEST_RELEASE });
    setActiveProfile(profile.id);
    return profile;
}

// Game versions the player can pick: the launcher's "latest" aliases plus every
// version installed in .minecraft/versions, which includes Fabric, Forge and
// NeoForge once their installers have run.
export function listGameVersions() {
    const versionsDir = path.join(minecraftDir(), 'versions');
    let installed = [];
    if (fs.existsSync(versionsDir)) {
        installed = fs.readdirSync(versionsDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && fs.existsSync(path.join(versionsDir, entry.name, `${entry.name}.json`)))
            .map(entry => entry.name)
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    }
    return [LATEST_RELEASE, LATEST_SNAPSHOT, ...installed];
}

function launcherEntry(profile, existing) {
    const now = new Date().toISOString();
    return {
        ...existing,
        name: profile.name,
        type: 'custom',
        icon: existing?.icon || LAUNCHER_ICON,
        lastVersionId: profile.gameVersion,
        gameDir: profileGameDir(profile),
        created: existing?.created || now,
        lastUsed: existing?.lastUsed || now,
    };
}

function sameEntry(a, b) {
    return a && b && a.name === b.name && a.lastVersionId === b.lastVersionId && a.gameDir === b.gameDir;
}

// Writes every TMods profile into the launcher's profile files and removes entries
// for profiles deleted here. Entries the player made in the launcher are untouched.
// Files are only rewritten when something changed, so running this on every start
// doesn't fight a launcher that's open. Returns the files it changed.
export function syncLauncherProfiles() {
    const dir = minecraftDir();
    const wanted = new Map(readStored().map(profile => [LAUNCHER_KEY_PREFIX + profile.id, profile]));
    let files = LAUNCHER_FILES.map(name => path.join(dir, name)).filter(file => fs.existsSync(file));
    if (files.length === 0) {
        if (wanted.size === 0) {
            return [];
        }
        // The launcher has never run here; seed the file it creates so it picks ours up.
        fs.mkdirSync(dir, { recursive: true });
        files = [path.join(dir, LAUNCHER_FILES[0])];
        fs.writeFileSync(files[0], JSON.stringify({ profiles: {} }, null, 2));
    }

    const changed = [];
    for (const file of files) {
        let data;
        try {
            data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (error) {
            // Never overwrite a file we can't read, the player's own profiles are in it.
            throw new Error(`Could not read ${path.basename(file)}: ${error.message}`);
        }
        const profiles = data.profiles || {};
        let dirty = !data.profiles;

        for (const key of Object.keys(profiles)) {
            if (key.startsWith(LAUNCHER_KEY_PREFIX) && !wanted.has(key)) {
                delete profiles[key];
                dirty = true;
            }
        }
        for (const [key, profile] of wanted) {
            const entry = launcherEntry(profile, profiles[key]);
            if (!sameEntry(entry, profiles[key])) {
                profiles[key] = entry;
                dirty = true;
            }
        }

        if (dirty) {
            data.profiles = profiles;
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
            changed.push(file);
        }
    }
    return changed;
}
