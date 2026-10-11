import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublishBundle from '../pages/modrinth/PublishBundle';
import { bundlesRepo, existingVersions, publishProfile } from '../../services/bundlePublish';

jest.mock('../../services/bundlePublish', () => ({
    ...jest.requireActual('../../services/bundlePublish'),
    bundlesRepo: jest.fn(),
    existingVersions: jest.fn(),
    publishProfile: jest.fn(),
}));

const target = { loader: 'fabric', gameVersion: '1.21.1', loaderVersion: '0.16.5' };
const profile = { id: 'p', name: 'Survival' };

// Runs actions like ModrinthPage does, without its messages.
const run = action => action().catch(() => {});

function show() {
    return render(
        <MemoryRouter>
            <PublishBundle profile={profile} gameDir='/game' target={target} busy={false} run={run} />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    bundlesRepo.mockReturnValue('Trino11/TMods-bundles');
    existingVersions.mockResolvedValue(['1.0.0', '1.1.0']);
    publishProfile.mockResolvedValue({
        actionsUrl: 'https://github.com/Trino11/TMods-bundles/actions',
        mods: 4,
        extraFiles: [],
    });
});

it('points to Settings when no repository is set up', () => {
    bundlesRepo.mockReturnValue('');
    show();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
});

it('suggests the version after the newest published one', async () => {
    show();
    expect(await screen.findByDisplayValue('1.1.1')).toBeInTheDocument();
    expect(existingVersions).toHaveBeenCalledWith('Trino11/TMods-bundles', 'mods');
});

it('publishes the profile and links to the build on GitHub', async () => {
    show();
    await screen.findByDisplayValue('1.1.1');
    fireEvent.change(screen.getByLabelText('What changed (optional)'), { target: { value: 'Added Sodium' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('link', { name: 'follow it on GitHub' })).toHaveAttribute(
        'href',
        'https://github.com/Trino11/TMods-bundles/actions',
    );
    expect(publishProfile).toHaveBeenCalledWith(
        expect.objectContaining({
            repo: 'Trino11/TMods-bundles',
            category: 'mods',
            version: '1.1.1',
            gameDir: '/game',
            name: 'Survival',
            changelog: 'Added Sodium',
            includeConfig: true,
        }),
    );
});

it('says why it could not look up the versions', async () => {
    existingVersions.mockRejectedValue(new Error('Add a GitHub token in Settings first.'));
    show();
    expect(await screen.findByText('Add a GitHub token in Settings first.')).toBeInTheDocument();
});
