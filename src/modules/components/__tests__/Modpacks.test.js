import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Modpacks from '../pages/modrinth/Modpacks';
import { downloadModrinthModpack, importMrpack, packWarnings, readPack } from '../../services/mrpack';
import { listProfiles } from '../../services/profiles';

jest.mock('../pages/modrinth/ProjectSearch', () => ({ action }) => (
    <div>{action({ project_id: 'friends-pack', title: 'Friends Pack' })}</div>
));
jest.mock('../../services/mrpack', () => ({
    NEW_PROFILE: 'new',
    downloadModrinthModpack: jest.fn(),
    importMrpack: jest.fn(),
    packWarnings: jest.fn(),
    readPack: jest.fn(),
}));
jest.mock('../../services/profiles', () => ({ listProfiles: jest.fn() }));

const profile = { id: 'survival', name: 'Survival' };
const run = action => action().catch(() => {});

it('downloads a Modrinth modpack and offers the same import step as the Packs page', async () => {
    downloadModrinthModpack.mockResolvedValue(new Uint8Array([1]));
    const sodium = {
        id: 'mods/sodium.jar',
        kind: 'mod',
        name: 'sodium.jar',
        size: 1,
        files: [],
        link: true,
        enabled: true,
    };
    readPack.mockReturnValue({
        name: 'Friends Pack',
        version: '2.0',
        gameVersion: '1.21.1',
        loader: null,
        items: [sodium],
    });
    packWarnings.mockReturnValue([]);
    listProfiles.mockReturnValue([profile]);
    importMrpack.mockResolvedValue({ profile: { id: 'friends', name: 'Friends Pack' }, loaderNote: '', replaced: [] });
    const onProfileCreated = jest.fn();

    render(
        <MemoryRouter>
            <Modpacks profile={profile} busy={false} run={run} onProfileCreated={onProfileCreated} />
        </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Packs' })).toHaveAttribute('href', '/packs');
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    const dialog = await screen.findByRole('dialog');
    expect(downloadModrinthModpack).toHaveBeenCalledWith('friends-pack', 'Friends Pack');
    expect(within(dialog).getByText('Friends Pack 2.0')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Import into')).toHaveValue('survival');
    fireEvent.change(within(dialog).getByLabelText('Import into'), { target: { value: 'new' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(onProfileCreated).toHaveBeenCalled());
    expect(importMrpack).toHaveBeenCalledWith(new Uint8Array([1]), {
        into: 'new',
        name: 'Friends Pack',
        items: ['mods/sodium.jar'],
        replace: true,
    });
});
