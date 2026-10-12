import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Home from '../pages/home/home';
import { checkChannels, installChannelUpdates } from '../../services/channelUpdates';
import { installBundle } from '../../services/bundleInstaller';
import { createProfile, listGameVersions, updateProfile } from '../../services/profiles';
import { fetchMojangVersions } from '../../services/gameVersions';
import { installFabric, listFabricGameVersions } from '../../services/fabric';
import { detectTarget, gameVersionOf } from '../../services/gameTarget';
import { checkUpdates, readModList, setTargetVersion, updateChangelog, updateMod } from '../../services/modrinthMods';

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
}));
jest.mock('../../services/gameVersions', () => ({
    ...jest.requireActual('../../services/gameVersions'),
    fetchMojangVersions: jest.fn(),
}));
jest.mock('../../services/fabric', () => ({ installFabric: jest.fn(), listFabricGameVersions: jest.fn() }));
jest.mock('../../services/gameTarget', () => ({ detectTarget: jest.fn(), gameVersionOf: jest.fn() }));
jest.mock('../../services/modrinthMods', () => ({
    checkUpdates: jest.fn(),
    readModList: jest.fn(),
    setTargetVersion: jest.fn(),
    updateChangelog: jest.fn(),
    updateMod: jest.fn(),
}));

const mods = { id: 'mods', label: 'Mods' };
const fabricProfile = { id: 'fabric', name: 'Fabric', gameVersion: 'fabric-loader-0.16.5-1.20.1' };
const defaultProfile = { id: 'default', name: 'Default (.minecraft)', gameVersion: '' };
const target = { versionId: fabricProfile.gameVersion, gameVersion: '1.20.1', loader: 'fabric' };
const sodium = { mod: { projectId: 'sodium', title: 'Sodium' }, version: { id: 'v2' } };

let onSelectProfile;
let onProfilesChange;

beforeEach(() => {
    localStorage.clear();
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

    expect(await screen.findByText('Everything is up to date.')).toBeInTheDocument();
    expect(installChannelUpdates).toHaveBeenCalledWith(
        [expect.objectContaining({ installed: '1.0', outdated: true })],
        '/games/fabric',
    );
    expect(updateMod).toHaveBeenCalledWith('/games/fabric', 'sodium', { id: 'v2' });
    await waitFor(() => expect(checkChannels).toHaveBeenCalledTimes(2));
});

it('installs a single channel', async () => {
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));

    expect(await screen.findByText('Installed Mods 1.1.')).toBeInTheDocument();
    expect(installBundle).toHaveBeenCalledWith(expect.objectContaining({ id: 'mods' }), { id: '1.1' }, '/games/fabric');
});

it('reports the channels that failed to update', async () => {
    installChannelUpdates.mockResolvedValue([{ category: mods, error: new Error('404') }]);
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: 'Install all (1)' }));

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
