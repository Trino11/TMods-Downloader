import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ModrinthPage from '../pages/modrinth/ModrinthPage';
import { search } from '../../services/modrinth';
import { detectTarget, gameVersionOf } from '../../services/gameTarget';
import { listGameVersions } from '../../services/profiles';
import {
    adoptUnmanaged,
    checkUpdates,
    installMod,
    listUnmanaged,
    readModList,
    removeMod,
    setTargetVersion,
    updateChangelog,
} from '../../services/modrinthMods';
import { applyFix, checkBeforeInstall, checkCompatibility } from '../../services/modCompat';

jest.mock('../../services/modrinth', () => ({
    ...jest.requireActual('../../services/modrinth'),
    search: jest.fn(),
}));
jest.mock('../../services/gameTarget', () => ({ detectTarget: jest.fn(), gameVersionOf: jest.fn() }));
jest.mock('../../services/profiles', () => ({
    DEFAULT_PROFILE_ID: 'default',
    LATEST_RELEASE: 'latest-release',
    LATEST_SNAPSHOT: 'latest-snapshot',
    listGameVersions: jest.fn(),
}));
jest.mock('../../services/modrinthMods', () => ({
    adoptUnmanaged: jest.fn(),
    checkUpdates: jest.fn(),
    installMod: jest.fn(),
    listUnmanaged: jest.fn(),
    readModList: jest.fn(),
    removeMod: jest.fn(),
    setModEnabled: jest.fn(),
    setTargetVersion: jest.fn(),
    updateChangelog: jest.fn(),
    updateMod: jest.fn(),
}));
jest.mock('../../services/mrpack', () => ({}));
jest.mock('../../services/modCompat', () => ({
    applyFix: jest.fn(),
    checkBeforeInstall: jest.fn(),
    checkCompatibility: jest.fn(),
}));

const fabric = {
    versionId: 'fabric-loader-0.16.5-1.21.1',
    gameVersion: '1.21.1',
    loader: 'fabric',
    loaderVersion: '0.16.5',
};
const profile = { id: 'fabric', name: 'Fabric', gameVersion: fabric.versionId };
const sodiumHit = {
    project_id: 'sodium',
    title: 'Sodium',
    author: 'jellysquid',
    description: 'Fast rendering',
    downloads: 1000,
    icon_url: '',
};

beforeEach(() => {
    detectTarget.mockImplementation(id => (id === fabric.versionId ? fabric : null));
    gameVersionOf.mockImplementation(id => (id === '1.21.1' ? '1.21.1' : null));
    readModList.mockReturnValue({ target: null, mods: [] });
    listUnmanaged.mockReturnValue([]);
    listGameVersions.mockReturnValue([]);
    search.mockResolvedValue({ hits: [sodiumHit], total: 1 });
    window.confirm = jest.fn(() => true);
    checkBeforeInstall.mockResolvedValue([]);
    checkCompatibility.mockResolvedValue([]);
});

it("searches for the profile's loader and installs a mod with its dependencies", async () => {
    installMod.mockResolvedValue(['Sodium', 'Fabric API']);
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    expect(screen.getByText('Fabric 0.16.5 · Minecraft 1.21.1')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search mods'), { target: { value: 'sod' } });
    fireEvent.click(await screen.findByText('Install'));

    expect(search).toHaveBeenLastCalledWith({
        projectType: 'mod',
        loader: 'fabric',
        gameVersion: '1.21.1',
        query: 'sod',
    });
    expect(await screen.findByText('Installed Sodium with Fabric API.')).toBeInTheDocument();
    expect(checkBeforeInstall).toHaveBeenCalledWith('/games/fabric', fabric, 'sodium');
    expect(installMod).toHaveBeenCalledWith('/games/fabric', fabric, 'sodium', 'Sodium', {});
});

it('marks mods that are already installed', async () => {
    readModList.mockReturnValue({ target: null, mods: [{ projectId: 'sodium', title: 'Sodium', enabled: true }] });
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    expect(await screen.findByText('Installed', { selector: 'button[disabled]' })).toBeInTheDocument();
});

it('explains what to do when the profile version is unknown', () => {
    render(<ModrinthPage profile={{ ...profile, gameVersion: 'latest-release' }} gameDir='/games/fabric' />);

    expect(screen.getByText(/doesn't know which Minecraft version/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search mods')).not.toBeInTheDocument();
});

it('offers resource packs but not mods on a profile with no mod loader', async () => {
    const packHit = { ...sodiumHit, project_id: 'faithful', title: 'Faithful' };
    search.mockResolvedValue({ hits: [packHit], total: 1 });
    installMod.mockResolvedValue(['Faithful']);
    render(<ModrinthPage profile={{ ...profile, gameVersion: '1.21.1' }} gameDir='/games/vanilla' />);

    expect(screen.getByText(/which has no mod loader, so only resource packs and shaders/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search mods')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Resource packs' }));
    fireEvent.click(await screen.findByText('Install'));

    expect(search).toHaveBeenLastCalledWith({
        projectType: 'resourcepack',
        loader: undefined,
        gameVersion: '1.21.1',
        query: '',
    });
    expect(installMod).toHaveBeenCalledWith(
        '/games/vanilla',
        { loader: 'minecraft', gameVersion: '1.21.1' },
        'faithful',
        'Faithful',
        { kind: 'resourcepack' },
    );
    expect(await screen.findByText('Installed Faithful.')).toBeInTheDocument();
});

it('searches shaders for the picked shader mod', async () => {
    const shaderHit = { ...sodiumHit, project_id: 'complementary', title: 'Complementary' };
    search.mockResolvedValue({ hits: [shaderHit], total: 1 });
    installMod.mockResolvedValue(['Complementary']);
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    fireEvent.click(screen.getByRole('tab', { name: 'Shaders' }));
    await screen.findByText('Complementary');
    expect(search).toHaveBeenLastCalledWith({
        projectType: 'shader',
        loader: 'iris',
        gameVersion: '1.21.1',
        query: '',
    });

    fireEvent.change(screen.getByLabelText('Shader mod'), { target: { value: 'optifine' } });
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ loader: 'optifine' })));
    fireEvent.click(screen.getByText('Install'));

    expect(installMod).toHaveBeenCalledWith(
        '/games/fabric',
        { loader: 'optifine', gameVersion: '1.21.1' },
        'complementary',
        'Complementary',
        { kind: 'shader' },
    );
});

it('lists installed items by kind and recognises hand-added packs', async () => {
    readModList.mockReturnValue({
        target: null,
        mods: [
            { projectId: 'sodium', kind: 'mod', title: 'Sodium', versionNumber: '0.6.0', enabled: true },
            { projectId: 'faithful', kind: 'resourcepack', title: 'Faithful', versionNumber: '1.0', enabled: false },
        ],
    });
    listUnmanaged.mockImplementation((dir, kind) => (kind === 'shader' ? ['BSL.zip'] : []));
    adoptUnmanaged.mockResolvedValue(1);
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    fireEvent.click(screen.getByText('Installed (2)'));
    const packs = screen.getByRole('heading', { name: 'Resource packs' }).parentElement;
    expect(within(packs).getByText('Faithful')).toBeInTheDocument();
    expect(within(packs).getByText('Enable')).toBeInTheDocument();
    const shaders = screen.getByRole('heading', { name: 'Shaders' }).parentElement;
    expect(within(shaders).getByText('BSL.zip')).toBeInTheDocument();
    fireEvent.click(within(shaders).getByText('Recognise'));

    expect(adoptUnmanaged).toHaveBeenCalledWith('/games/fabric', 'shader');
    expect(await screen.findByText('Recognised 1 shader(s) from Modrinth.')).toBeInTheDocument();
});

it('lets the default profile pick which installed loader it plays with', () => {
    listGameVersions.mockReturnValue(['latest-release', fabric.versionId]);
    readModList
        .mockReturnValueOnce({ target: null, mods: [] })
        .mockReturnValue({ target: { versionId: fabric.versionId }, mods: [] });
    render(<ModrinthPage profile={{ id: 'default', name: 'Default', gameVersion: '' }} gameDir='/mc' />);

    fireEvent.change(screen.getByLabelText(/Which installed version/), { target: { value: fabric.versionId } });
    fireEvent.click(screen.getByText('Use'));

    expect(setTargetVersion).toHaveBeenCalledWith('/mc', fabric.versionId);
    expect(screen.getByText('Fabric 0.16.5 · Minecraft 1.21.1')).toBeInTheDocument();
});

it('removes an installed mod after confirmation', async () => {
    readModList.mockReturnValue({
        target: null,
        mods: [{ projectId: 'sodium', title: 'Sodium', versionNumber: '0.6.0', enabled: true }],
    });
    removeMod.mockReturnValue(['Sodium', 'Fabric API']);
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    fireEvent.click(screen.getByText('Installed (1)'));
    fireEvent.click(screen.getByText('Remove'));

    expect(removeMod).toHaveBeenCalledWith('/games/fabric', 'sodium');
    expect(await screen.findByText('Removed Sodium, Fabric API.')).toBeInTheDocument();
});

const irisMod = { projectId: 'iris', title: 'Iris', versionNumber: '1.6.0', enabled: true };

it('shows compatibility problems under each mod and fixes them in one click', async () => {
    readModList.mockReturnValue({ target: null, mods: [irisMod] });
    const problem = {
        mod: { projectId: 'iris', fileName: 'iris.jar', tracked: true, title: 'Iris' },
        kind: 'mismatch',
        message: 'Made for Minecraft 1.20.1, but this profile plays 1.21.1.',
        fix: { type: 'switchVersion', label: 'Switch to 1.8.0' },
    };
    checkCompatibility.mockResolvedValueOnce([problem]).mockResolvedValue([]);
    applyFix.mockResolvedValue('Switched Iris to 1.8.0.');
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    fireEvent.click(screen.getByText('Installed (1)'));

    expect(await screen.findByText(problem.message)).toBeInTheDocument();
    expect(screen.getByText(/1 compatibility problem found/)).toBeInTheDocument();
    expect(checkCompatibility).toHaveBeenCalledWith('/games/fabric', fabric);
    fireEvent.click(screen.getByText('Switch to 1.8.0'));

    expect(await screen.findByText('Switched Iris to 1.8.0.')).toBeInTheDocument();
    expect(applyFix).toHaveBeenCalledWith('/games/fabric', fabric, problem);
    expect(await screen.findByText('No compatibility problems found.')).toBeInTheDocument();
});

it('warns before installing a mod that clashes, and installs it if the player insists', async () => {
    checkBeforeInstall.mockResolvedValue(["It says it doesn't work together with Iris, which is installed."]);
    installMod.mockResolvedValue(['Sodium']);
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    fireEvent.click(await screen.findByText('Install'));

    expect(await screen.findByText('Install Sodium anyway?')).toBeInTheDocument();
    expect(screen.getByText(/doesn't work together with Iris/)).toBeInTheDocument();
    expect(installMod).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Install anyway'));

    expect(await screen.findByText('Installed Sodium.')).toBeInTheDocument();
    expect(installMod).toHaveBeenCalledWith('/games/fabric', fabric, 'sodium', 'Sodium', { allowIncompatible: true });
});

it('shows what an update brings before installing it', async () => {
    const sodium = { projectId: 'sodium', title: 'Sodium', versionNumber: '0.6.0', enabled: true };
    readModList.mockReturnValue({ target: null, mods: [sodium] });
    const update = { id: 'v2', version_number: '0.7.0' };
    checkUpdates.mockResolvedValue([{ mod: sodium, version: update }]);
    updateChangelog.mockResolvedValue([{ id: 'v2', label: '0.7.0', text: 'Faster chunks' }]);
    render(<ModrinthPage profile={profile} gameDir='/games/fabric' />);

    fireEvent.click(screen.getByText('Installed (1)'));
    fireEvent.click(screen.getByText('Check for updates'));
    fireEvent.click(await screen.findByRole('button', { name: "What's new" }));

    expect(await screen.findByText('Faster chunks')).toBeInTheDocument();
    expect(updateChangelog).toHaveBeenCalledWith(sodium, update, fabric, '1.21.1');
});
