import { fireEvent, render, screen } from '@testing-library/react';
import ModrinthPage from '../pages/modrinth/ModrinthPage';
import { search } from '../../services/modrinth';
import { detectTarget } from '../../services/gameTarget';
import { listGameVersions } from '../../services/profiles';
import { installMod, listUnmanaged, readModList, removeMod, setTargetVersion } from '../../services/modrinthMods';

jest.mock('../../services/modrinth', () => ({
    ...jest.requireActual('../../services/modrinth'),
    search: jest.fn(),
}));
jest.mock('../../services/gameTarget', () => ({ detectTarget: jest.fn() }));
jest.mock('../../services/profiles', () => ({ DEFAULT_PROFILE_ID: 'default', listGameVersions: jest.fn() }));
jest.mock('../../services/modrinthMods', () => ({
    adoptUnmanaged: jest.fn(),
    checkUpdates: jest.fn(),
    installMod: jest.fn(),
    listUnmanaged: jest.fn(),
    readModList: jest.fn(),
    removeMod: jest.fn(),
    setModEnabled: jest.fn(),
    setTargetVersion: jest.fn(),
    updateMod: jest.fn(),
}));
jest.mock('../../services/mrpack', () => ({}));

const fabric = { versionId: 'fabric-loader-0.16.5-1.21.1', gameVersion: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5' };
const profile = { id: 'fabric', name: 'Fabric', gameVersion: fabric.versionId };
const sodiumHit = { project_id: 'sodium', title: 'Sodium', author: 'jellysquid', description: 'Fast rendering', downloads: 1000, icon_url: '' };

beforeEach(() => {
    detectTarget.mockImplementation(id => (id === fabric.versionId ? fabric : null));
    readModList.mockReturnValue({ target: null, mods: [] });
    listUnmanaged.mockReturnValue([]);
    listGameVersions.mockReturnValue([]);
    search.mockResolvedValue({ hits: [sodiumHit], total: 1 });
    window.confirm = jest.fn(() => true);
});

it('searches for the profile\'s loader and installs a mod with its dependencies', async () => {
    installMod.mockResolvedValue(['Sodium', 'Fabric API']);
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    expect(screen.getByText('Fabric 0.16.5 · Minecraft 1.21.1')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search mods'), { target: { value: 'sod' } });
    fireEvent.click(await screen.findByText('Install'));

    expect(search).toHaveBeenLastCalledWith({ projectType: 'mod', loader: 'fabric', gameVersion: '1.21.1', query: 'sod' });
    expect(installMod).toHaveBeenCalledWith('/games/fabric', fabric, 'sodium', 'Sodium');
    expect(await screen.findByText('Installed Sodium with Fabric API.')).toBeInTheDocument();
});

it('marks mods that are already installed', async () => {
    readModList.mockReturnValue({ target: null, mods: [{ projectId: 'sodium', title: 'Sodium', enabled: true }] });
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    expect(await screen.findByText('Installed', { selector: 'button[disabled]' })).toBeInTheDocument();
});

it('explains what to do when the profile has no mod loader', () => {
    render(<ModrinthPage profile={{ ...profile, gameVersion: 'latest-release' }} gameDir='/games/fabric' />);

    expect(screen.getByText(/which has no mod loader/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search mods')).not.toBeInTheDocument();
});

it('lets the default profile pick which installed loader it plays with', () => {
    listGameVersions.mockReturnValue(['latest-release', fabric.versionId]);
    readModList.mockReturnValueOnce({ target: null, mods: [] }).mockReturnValue({ target: { versionId: fabric.versionId }, mods: [] });
    render(<ModrinthPage profile={{ id: 'default', name: 'Default', gameVersion: '' }} gameDir='/mc' />);

    fireEvent.change(screen.getByLabelText(/Which installed version/), { target: { value: fabric.versionId } });
    fireEvent.click(screen.getByText('Use'));

    expect(setTargetVersion).toHaveBeenCalledWith('/mc', fabric.versionId);
    expect(screen.getByText('Fabric 0.16.5 · Minecraft 1.21.1')).toBeInTheDocument();
});

it('removes an installed mod after confirmation', async () => {
    readModList.mockReturnValue({ target: null, mods: [{ projectId: 'sodium', title: 'Sodium', versionNumber: '0.6.0', enabled: true }] });
    removeMod.mockReturnValue(['Sodium', 'Fabric API']);
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    fireEvent.click(screen.getByText('Installed (1)'));
    fireEvent.click(screen.getByText('Remove'));

    expect(removeMod).toHaveBeenCalledWith('/games/fabric', 'sodium');
    expect(await screen.findByText('Removed Sodium, Fabric API.')).toBeInTheDocument();
});
