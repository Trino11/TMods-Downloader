import { fireEvent, render, screen } from '@testing-library/react';
import Profiles from '../pages/profiles/Profiles';
import ProfileSelector from '../profiles/ProfileSelector';
import { createProfile, deleteProfile, listGameVersions, profileGameDir, updateProfile } from '../../services/profiles';
import { installFabric, listFabricGameVersions } from '../../services/fabric';

jest.mock('../../services/profiles', () => ({
    DEFAULT_PROFILE_ID: 'default',
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    deleteProfile: jest.fn(),
    listGameVersions: jest.fn(),
    profileGameDir: jest.fn(),
}));

jest.mock('../../services/fabric', () => ({
    installFabric: jest.fn(),
    listFabricGameVersions: jest.fn(),
}));

const defaultProfile = { id: 'default', name: 'Default (.minecraft)', gameVersion: '' };
const fabric = { id: 'fabric', name: 'Fabric', gameVersion: '1.21' };
const all = [defaultProfile, fabric];

let onChange;
let onSelect;

// CRA resets mock implementations before each test, so set them here.
beforeEach(() => {
    profileGameDir.mockImplementation(profile => `/games/${profile.id}`);
    listGameVersions.mockReturnValue(['latest-release', 'latest-snapshot', '1.21']);
    onChange = jest.fn();
    onSelect = jest.fn();
    window.confirm = jest.fn(() => true);
    listFabricGameVersions.mockResolvedValue(['1.21.1', '1.20.1']);
    installFabric.mockResolvedValue('fabric-loader-0.16.5-1.20.1');
});

function renderPage(activeId = 'default') {
    render(<Profiles profiles={all} activeId={activeId} onSelect={onSelect} onChange={onChange} />);
}

it('creates a profile with the chosen game version', () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'Pack' } });
    fireEvent.change(screen.getByLabelText('Game version'), { target: { value: '1.21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(createProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pack', gameVersion: '1.21' }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText(/Profile created/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Profile name')).toHaveValue('');
});

it('shows the error when creating fails', () => {
    createProfile.mockImplementation(() => { throw new Error('Could not read launcher_profiles.json: bad'); });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'Pack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Could not read launcher_profiles.json: bad')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
});

it('edits an existing profile', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByPlaceholderText('Profile name')).toHaveValue('Fabric');
    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'Fabric 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateProfile).toHaveBeenCalledWith('fabric', expect.objectContaining({ name: 'Fabric 2', gameVersion: '1.21' }));
});

it('deletes after confirmation and says where the files are', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('/games/fabric'));
    expect(deleteProfile).toHaveBeenCalledWith('fabric');
    expect(screen.getByText(/still in \/games\/fabric/)).toBeInTheDocument();
});

it('keeps the profile when deletion is cancelled', () => {
    window.confirm = jest.fn(() => false);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteProfile).not.toHaveBeenCalled();
});

it('offers no edit or delete for the default profile and marks the active one', () => {
    renderPage('fabric');

    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Active' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onSelect).toHaveBeenCalledWith('default');
});

it('switches profile from the sidebar selector', () => {
    render(<ProfileSelector profiles={all} activeId='default' onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Profile'), { target: { value: 'fabric' } });

    expect(onSelect).toHaveBeenCalledWith('fabric');
});

it('installs Fabric and picks it for the profile being made', async () => {
    renderPage();

    const fabricSelect = await screen.findByLabelText('Fabric Minecraft version');
    await screen.findByRole('option', { name: '1.20.1' });
    fireEvent.change(fabricSelect, { target: { value: '1.20.1' } });
    listGameVersions.mockReturnValue(['latest-release', 'latest-snapshot', 'fabric-loader-0.16.5-1.20.1']);
    fireEvent.click(screen.getByRole('button', { name: 'Install Fabric' }));

    expect(await screen.findByText(/Installed fabric-loader-0.16.5-1.20.1/)).toBeInTheDocument();
    expect(installFabric).toHaveBeenCalledWith('1.20.1');
    expect(screen.getByLabelText('Game version')).toHaveValue('fabric-loader-0.16.5-1.20.1');

    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'Pack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(createProfile).toHaveBeenCalledWith(expect.objectContaining({ gameVersion: 'fabric-loader-0.16.5-1.20.1' }));
});

it('says when Fabric could not be installed', async () => {
    installFabric.mockRejectedValue(new Error('Network Error'));
    renderPage();

    await screen.findByRole('option', { name: '1.21.1' });
    fireEvent.click(screen.getByRole('button', { name: 'Install Fabric' }));

    expect(await screen.findByText('Could not install Fabric: Network Error')).toBeInTheDocument();
});
