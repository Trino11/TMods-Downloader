import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Home from '../pages/home/home';
import { checkChannels, installChannelUpdates } from '../../services/channelUpdates';
import { installBundle } from '../../services/bundleInstaller';
import { createProfile, listGameVersions, listProfiles, updateProfile } from '../../services/profiles';
import { fetchMojangVersions } from '../../services/gameVersions';
import { installFabric, listFabricGameVersions } from '../../services/fabric';
import { detectTarget, gameVersionOf } from '../../services/gameTarget';
import { checkUpdates, readModList, setTargetVersion, updateChangelog, updateMod } from '../../services/modrinthMods';
import { fetchPackUpdates } from '../../services/manifest';
import { downloadPublishedPack, importMrpack, packWarnings, readInstalledPack, readPack } from '../../services/mrpack';
import { isPinned, setPinned } from '../../services/pins';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../services/channelUpdates', () => ({ checkChannels: jest.fn(), installChannelUpdates: jest.fn() }));
jest.mock('../../services/bundleInstaller', () => ({ installBundle: jest.fn() }));
jest.mock('../../services/profiles', () => ({
    DEFAULT_PROFILE_ID: 'default',
    LATEST_RELEASE: 'latest-release',
    LATEST_SNAPSHOT: 'latest-snapshot',
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    listGameVersions: jest.fn(),
    listProfiles: jest.fn(),
    profileGameDir: profile => `/games/${profile.id}`,
}));
jest.mock('../../services/manifest', () => ({
    ...jest.requireActual('../../services/manifest'),
    fetchPackUpdates: jest.fn(),
}));
jest.mock('../../services/mrpack', () => ({
    NEW_PROFILE: 'new',
    downloadPublishedPack: jest.fn(),
    foldersToReplace: () => ['mods'],
    importMrpack: jest.fn(),
    packWarnings: jest.fn(),
    readInstalledPack: jest.fn(),
    readPack: jest.fn(),
}));
jest.mock('../../services/pins', () => ({ PACKS: 'packs', isPinned: jest.fn(), setPinned: jest.fn() }));
jest.mock('../../services/gameVersions', () => ({
    ...jest.requireActual('../../services/gameVersions'),
    fetchMojangVersions: jest.fn(),
}));
jest.mock('../../services/fabric', () => ({
    installFabric: jest.fn(),
    latestLoaderVersion: jest.fn(),
    listFabricGameVersions: jest.fn(),
}));
jest.mock('../../services/gameTarget', () => ({ detectTarget: jest.fn(), gameVersionOf: jest.fn() }));
jest.mock('../../services/modrinthMods', () => ({
    checkUpdates: jest.fn(),
    readModList: jest.fn(),
    setTargetVersion: jest.fn(),
    updateChangelog: jest.fn(),
    updateMod: jest.fn(),
}));

const mods = { id: 'mods', label: 'Mods', backupFolder: 'mods' };
// What fetchPackUpdates says when the latest pack is `latest` and the profile has `installed`.
function packUpdates(latest, installed = null, changes = [], pinned = false) {
    const newer = Boolean(installed && latest && latest.id !== installed);
    return {
        packs: latest ? [latest] : [],
        latest,
        installed,
        pinned: Boolean(installed && pinned),
        newer,
        outdated: newer && !pinned,
        changes,
    };
}

const fabricProfile = { id: 'fabric', name: 'Fabric', gameVersion: 'fabric-loader-0.16.5-1.20.1' };
const defaultProfile = { id: 'default', name: 'Default (.minecraft)', gameVersion: '' };
const target = { versionId: fabricProfile.gameVersion, gameVersion: '1.20.1', loader: 'fabric' };
const sodium = { mod: { projectId: 'sodium', title: 'Sodium' }, version: { id: 'v2' } };

let onSelectProfile;
let onProfilesChange;

beforeEach(() => {
    localStorage.clear();
    isPinned.mockReturnValue(false);
    listGameVersions.mockReturnValue(['latest-release', 'latest-snapshot']);
    onSelectProfile = jest.fn();
    onProfilesChange = jest.fn();
    fetchMojangVersions.mockResolvedValue([{ id: '1.21', type: 'release' }]);
    listFabricGameVersions.mockResolvedValue(['1.21.1', '1.20.1']);
    installFabric.mockResolvedValue('fabric-loader-0.16.5-1.21.1');
    detectTarget.mockImplementation(id => (id === fabricProfile.gameVersion ? target : null));
    gameVersionOf.mockReturnValue(null);
    readModList.mockReturnValue({ target: null, mods: [sodium.mod] });
    checkUpdates.mockResolvedValue([]);
    checkChannels.mockResolvedValue([
        { category: { ...mods, icon: () => null }, installed: '1.0', latest: { id: '1.1' }, outdated: true },
    ]);
    installChannelUpdates.mockResolvedValue([]);
    fetchPackUpdates.mockResolvedValue(packUpdates(null));
    readInstalledPack.mockReturnValue(null);
});

function renderHome(profile = fabricProfile) {
    render(
        <MemoryRouter>
            <Home
                profile={profile}
                gameDir={`/games/${profile.id}`}
                onSelectProfile={onSelectProfile}
                onProfilesChange={onProfilesChange}
            />
        </MemoryRouter>,
    );
}

it('checks the channels and Modrinth mods of the active profile', async () => {
    checkUpdates.mockResolvedValue([sodium]);
    renderHome();

    expect(await screen.findByText('1.0 → 1.1')).toBeInTheDocument();
    expect(await screen.findByText('Sodium')).toBeInTheDocument();
    expect(checkChannels).toHaveBeenCalledWith(expect.any(Array), '/games/fabric');
    expect(checkUpdates).toHaveBeenCalledWith('/games/fabric', target, '1.20.1');
    expect(screen.getByRole('button', { name: 'Install all (2)' })).toBeEnabled();
});

it('installs every update with one click, then checks again', async () => {
    checkUpdates.mockResolvedValue([sodium]);
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: 'Install all (2)' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Install' }));

    expect(await screen.findByText('Everything is up to date.')).toBeInTheDocument();
    expect(installChannelUpdates).toHaveBeenCalledWith(
        [expect.objectContaining({ installed: '1.0', outdated: true })],
        '/games/fabric',
        { replace: true },
    );
    expect(updateMod).toHaveBeenCalledWith('/games/fabric', 'sodium', { id: 'v2' });
    await waitFor(() => expect(checkChannels).toHaveBeenCalledTimes(2));
});

it('installs a single channel', async () => {
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('This installs into mods/.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('Replace existing content'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));

    expect(await screen.findByText('Installed Mods 1.1.')).toBeInTheDocument();
    expect(installBundle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mods' }),
        { id: '1.1' },
        '/games/fabric',
        {
            replace: false,
        },
    );
});

it('reports the channels that failed to update', async () => {
    installChannelUpdates.mockResolvedValue([{ category: mods, error: new Error('404') }]);
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: 'Install all (1)' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Install' }));

    expect(await screen.findByText('Some updates failed. Mods: 404')).toBeInTheDocument();
});

it('checks resource packs and shaders of a profile with no mod loader', async () => {
    gameVersionOf.mockImplementation(id => (id === '1.21.1' ? '1.21.1' : null));
    renderHome({ id: 'vanilla', name: 'Vanilla', gameVersion: '1.21.1' });

    expect(await screen.findByText('1.0 → 1.1')).toBeInTheDocument();
    expect(checkUpdates).toHaveBeenCalledWith('/games/vanilla', null, '1.21.1');
});

it('skips the Modrinth check when the profile version is unknown', async () => {
    renderHome({ id: 'vanilla', name: 'Vanilla', gameVersion: 'latest-release' });

    expect(await screen.findByText('1.0 → 1.1')).toBeInTheDocument();
    expect(checkUpdates).not.toHaveBeenCalled();
});

it('shows an error when the manifest cannot be loaded', async () => {
    checkChannels.mockRejectedValue(new Error('Network Error'));
    renderHome();

    expect(await screen.findByText('Could not check the channels: Network Error')).toBeInTheDocument();
});

it('creates a profile and switches to it', async () => {
    createProfile.mockReturnValue({ id: 'new', name: 'New one' });
    renderHome();

    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'New one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(createProfile).toHaveBeenCalledWith({ name: 'New one', gameVersion: 'latest-release' });
    expect(onSelectProfile).toHaveBeenCalledWith('new');
    expect(screen.getByText('Created New one and switched to it.')).toBeInTheDocument();
});

it('offers Fabric for the profile version and switches the profile to it', async () => {
    renderHome();

    await waitFor(() => expect(screen.getByLabelText('Fabric Minecraft version')).toHaveValue('1.20.1'));
    fireEvent.change(screen.getByLabelText('Fabric Minecraft version'), { target: { value: '1.21.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install Fabric' }));

    expect(await screen.findByText(/switched Fabric to it/)).toBeInTheDocument();
    expect(installFabric).toHaveBeenCalledWith('1.21.1');
    expect(updateProfile).toHaveBeenCalledWith('fabric', {
        name: 'Fabric',
        gameVersion: 'fabric-loader-0.16.5-1.21.1',
    });
    expect(onProfilesChange).toHaveBeenCalled();
});

it('sets Fabric as the Modrinth target of the default profile', async () => {
    renderHome(defaultProfile);

    await waitFor(() => expect(screen.getByLabelText('Fabric Minecraft version')).toHaveValue('1.21.1'));
    fireEvent.click(screen.getByRole('button', { name: 'Install Fabric' }));

    expect(await screen.findByText(/Pick it in the Minecraft Launcher/)).toBeInTheDocument();
    expect(setTargetVersion).toHaveBeenCalledWith('/games/default', 'fabric-loader-0.16.5-1.21.1');
    expect(updateProfile).not.toHaveBeenCalled();
});

it('leaves out the channels the profile keeps until updates are allowed again', async () => {
    checkChannels.mockResolvedValue([
        {
            category: { ...mods, icon: () => null },
            installed: '1.0',
            latest: { id: '1.2' },
            pinned: true,
            outdated: false,
            changes: [],
        },
    ]);
    renderHome();

    expect(await screen.findByText('Keeping 1.0 (1.2 is out)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install all' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Allow updates' }));
    await waitFor(() => expect(setPinned).toHaveBeenCalledWith('/games/fabric', 'mods', false));
    await waitFor(() => expect(checkChannels).toHaveBeenCalledTimes(2));
});

it('shows the changelogs of channel and Modrinth updates', async () => {
    checkChannels.mockResolvedValue([
        {
            category: { ...mods, icon: () => null },
            installed: '1.0',
            latest: { id: '1.2' },
            outdated: true,
            changes: [
                { id: '1.2', label: '1.2', text: 'Adds Iris' },
                { id: '1.1', label: '1.1', text: 'Adds Sodium' },
            ],
        },
    ]);
    checkUpdates.mockResolvedValue([sodium]);
    updateChangelog.mockResolvedValue([{ id: 'v2', label: '0.6.1', text: 'Fixes a crash' }]);
    renderHome();

    await screen.findByText('Sodium');
    const [channelButton, modButton] = screen.getAllByRole('button', { name: "What's new" });

    fireEvent.click(channelButton);
    expect(await screen.findByText('Adds Iris')).toBeInTheDocument();
    expect(screen.getByText('Adds Sodium')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(modButton);
    expect(await screen.findByText('Fixes a crash')).toBeInTheDocument();
    expect(screen.getByText('Sodium 0.6.1')).toBeInTheDocument();
    expect(updateChangelog).toHaveBeenCalledWith(sodium.mod, sodium.version, target, '1.20.1');
});

const latestPack = {
    id: '1.0.0',
    url: 'https://example.com/packs-1.0.0.mrpack',
    target: 'Fabric 26.3',
    description: 'Base pack',
    changelog: 'First release',
};
const firstRelease = [{ id: '1.0.0', label: '1.0.0', text: 'First release' }];

it('shows the latest pack of the channel apart from the updates', async () => {
    fetchPackUpdates.mockResolvedValue(packUpdates(latestPack, null, firstRelease));
    renderHome();

    expect(await screen.findByText('Pack 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Fabric 26.3 · Base pack')).toBeInTheDocument();
    expect(screen.getByText('Not installed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    expect(await screen.findByText('First release')).toBeInTheDocument();
});

it('says when the active profile has the latest pack', async () => {
    readInstalledPack.mockReturnValue('1.0.0');
    fetchPackUpdates.mockResolvedValue(packUpdates(latestPack, '1.0.0', firstRelease));
    renderHome();

    expect(await screen.findByText('Installed 1.0.0 in Fabric')).toBeInTheDocument();
    expect(readInstalledPack).toHaveBeenCalledWith('/games/fabric');
    expect(fetchPackUpdates).toHaveBeenCalledWith('1.0.0', false);
    expect(screen.getAllByText('Up to date').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
});

it('offers the pack update with what it brings', async () => {
    const newer = { ...latestPack, id: '1.1.0', changelog: 'Adds shaders' };
    readInstalledPack.mockReturnValue('1.0.0');
    fetchPackUpdates.mockResolvedValue(
        packUpdates(newer, '1.0.0', [{ id: '1.1.0', label: '1.1.0', text: 'Adds shaders' }]),
    );
    downloadPublishedPack.mockResolvedValue(new Uint8Array([1]));
    readPack.mockReturnValue({ name: 'TMods', version: '1.1.0', gameVersion: '26.3', loader: null, items: [] });
    listProfiles.mockReturnValue([fabricProfile]);
    renderHome();

    expect(await screen.findByText('1.0.0 → 1.1.0 in Fabric')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    expect(await screen.findByText('Adds shaders')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Update' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(downloadPublishedPack).toHaveBeenCalledWith(newer);
});

it("doesn't offer a newer pack while the profile keeps its version, until updates are allowed", async () => {
    const newer = { ...latestPack, id: '1.1.0' };
    readInstalledPack.mockReturnValue('1.0.0');
    isPinned.mockReturnValue(true);
    fetchPackUpdates.mockResolvedValue(packUpdates(newer, '1.0.0', [], true));
    renderHome();

    expect(await screen.findByText('Keeping 1.0.0 (1.1.0 is out) in Fabric')).toBeInTheDocument();
    expect(isPinned).toHaveBeenCalledWith('/games/fabric', 'packs');
    expect(fetchPackUpdates).toHaveBeenCalledWith('1.0.0', true);
    expect(screen.getByText('Version kept')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();

    fetchPackUpdates.mockResolvedValue(packUpdates(newer, '1.0.0'));
    fireEvent.click(screen.getByRole('button', { name: 'Allow updates' }));
    expect(setPinned).toHaveBeenCalledWith('/games/fabric', 'packs', false);
    expect(await screen.findByRole('button', { name: 'Update' })).toBeInTheDocument();
});

it('says so when the channel has no packs', async () => {
    renderHome();

    expect(await screen.findByText(/Your channel has no packs yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
});

it('downloads the latest pack and imports it into the active profile', async () => {
    fetchPackUpdates.mockResolvedValue(packUpdates(latestPack));
    downloadPublishedPack.mockResolvedValue(new Uint8Array([1]));
    readPack.mockReturnValue({
        name: 'TMods',
        version: '1.0.0',
        gameVersion: '26.3',
        loader: null,
        items: [{ id: 'mods/sodium.jar', kind: 'mod', name: 'sodium.jar', size: 1, files: [], link: true }],
    });
    packWarnings.mockReturnValue([]);
    listProfiles.mockReturnValue([fabricProfile]);
    importMrpack.mockResolvedValue({ profile: fabricProfile, replaced: [] });
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));

    const dialog = await screen.findByRole('dialog');
    expect(downloadPublishedPack).toHaveBeenCalledWith(latestPack);
    expect(within(dialog).getByLabelText('Import into')).toHaveValue('fabric');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));

    expect(await screen.findByText(/Imported into Fabric\./)).toBeInTheDocument();
    expect(importMrpack).toHaveBeenCalledWith(new Uint8Array([1]), {
        into: 'fabric',
        name: undefined,
        items: ['mods/sodium.jar'],
        channelVersion: '1.0.0',
        keepVersion: false,
        replace: true,
    });
    expect(onProfilesChange).toHaveBeenCalled();
    expect(fetchPackUpdates).toHaveBeenCalledTimes(2);
});

it('shows why the latest pack could not be loaded', async () => {
    fetchPackUpdates.mockRejectedValue(new Error('Network Error'));
    renderHome();

    expect(await screen.findByText("Could not load your channel's packs: Network Error")).toBeInTheDocument();
});
