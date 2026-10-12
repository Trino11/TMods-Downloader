import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import PacksPage from '../pages/packs/PacksPage';
import { recogniseFiles, scanProfile } from '../../services/packScan';
import {
    downloadPublishedPack,
    exportMrpack,
    importMrpack,
    listPackBackups,
    packWarnings,
    profileTarget,
    readPack,
    restorePackBackup,
} from '../../services/mrpack';
import { fetchPacks } from '../../services/manifest';
import { bundlesRepo, existingVersions, publishPack } from '../../services/bundlePublish';
import { listProfiles } from '../../services/profiles';

jest.mock('../../services/packScan', () => ({ recogniseFiles: jest.fn(), scanProfile: jest.fn() }));
jest.mock('../../services/mrpack', () => ({
    NEW_PROFILE: 'new',
    downloadPublishedPack: jest.fn(),
    exportMrpack: jest.fn(),
    importMrpack: jest.fn(),
    listPackBackups: jest.fn(),
    packWarnings: jest.fn(),
    profileTarget: jest.fn(),
    readPack: jest.fn(),
    restorePackBackup: jest.fn(),
}));
jest.mock('../../services/manifest', () => ({ fetchPacks: jest.fn() }));
jest.mock('../../services/bundlePublish', () => ({
    ...jest.requireActual('../../services/bundlePublish'),
    bundlesRepo: jest.fn(),
    existingVersions: jest.fn(),
    publishPack: jest.fn(),
}));
jest.mock('../../services/profiles', () => ({ listProfiles: jest.fn(), updateProfile: jest.fn() }));
jest.mock('../../services/fabric', () => ({ installFabric: jest.fn(), listFabricGameVersions: jest.fn() }));

const profile = { id: 'survival', name: 'Survival', gameVersion: 'fabric-loader-0.16.5-1.21.1' };
const target = { versionId: profile.gameVersion, gameVersion: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5' };

function item(id, kind, extra = {}) {
    return {
        id,
        kind,
        name: id.split('/').pop(),
        title: id.split('/').pop(),
        size: 1024,
        files: [{ path: id, size: 1024 }],
        enabled: true,
        link: null,
        ticked: true,
        ...extra,
    };
}

const scanned = [
    item('mods/sodium.jar', 'mod', { title: 'Sodium', link: { url: 'https://cdn.modrinth.com/s.jar' } }),
    item('mods/mine.jar', 'mod'),
    item('config/a.toml', 'config'),
    item('options.txt', 'settings', { ticked: false }),
];

const pack = {
    name: 'Friends Pack',
    version: '1.0',
    summary: 'Sodium and friends',
    gameVersion: '1.21.1',
    loader: { loader: 'fabric', loaderVersion: '0.16.5' },
    items: [item('mods/sodium.jar', 'mod', { link: true }), item('config/sodium.json', 'config')],
};

const onProfilesChange = jest.fn();

function show() {
    return render(
        <MemoryRouter>
            <PacksPage profile={profile} gameDir='/game' onProfilesChange={onProfilesChange} />
        </MemoryRouter>,
    );
}

function openTab(name) {
    fireEvent.click(screen.getByRole('tab', { name }));
}

// jsdom's File can't be read, so this one carries its own arrayBuffer().
async function chooseFile(input) {
    const file = new File(['pack'], 'friends.mrpack');
    file.arrayBuffer = async () => new TextEncoder().encode('pack').buffer;
    fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
    scanProfile.mockReturnValue(scanned);
    recogniseFiles.mockResolvedValue(0);
    profileTarget.mockReturnValue({ versionId: target.versionId, target, gameVersion: '1.21.1' });
    exportMrpack.mockReturnValue({ data: new Uint8Array([1, 2]), links: 1, copies: 2 });
    listPackBackups.mockReturnValue([]);
    readPack.mockReturnValue(pack);
    packWarnings.mockReturnValue([]);
    importMrpack.mockResolvedValue({ profile, loaderNote: '', replaced: ['Sodium'], backupId: 'b1' });
    fetchPacks.mockResolvedValue([]);
    listProfiles.mockReturnValue([{ id: 'default', name: 'Default' }, profile]);
    bundlesRepo.mockReturnValue('Trino11/TMods-bundles');
    existingVersions.mockResolvedValue(['1.0.0']);
    publishPack.mockResolvedValue({ actionsUrl: 'https://github.com/Trino11/TMods-bundles/actions' });
    URL.createObjectURL = jest.fn(() => 'blob:pack');
    URL.revokeObjectURL = jest.fn();
});

it('lists Import first and opens on it', () => {
    show();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual(['Import', 'Export', 'Publish']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
});

describe('Export', () => {
    it('groups the profile by kind and saves the picked files as a .mrpack', async () => {
        show();
        openTab('Export');
        await waitFor(() => expect(recogniseFiles).toHaveBeenCalledWith('/game'));

        expect(screen.getByText(/^2 of 2 picked/)).toBeInTheDocument();
        expect(screen.getByText(/^0 of 1 picked/)).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Include all configs'));
        fireEvent.click(screen.getByLabelText('Include options.txt'));
        fireEvent.click(screen.getByRole('button', { name: 'Save .mrpack' }));

        expect(
            await screen.findByText(/Saved Survival.mrpack \(2 B\): 1 linked from Modrinth, 2 copied./),
        ).toBeInTheDocument();
        expect(exportMrpack).toHaveBeenCalledWith('/game', target, {
            name: 'Survival',
            version: '1.0.0',
            items: [scanned[0], scanned[1], scanned[3]],
        });
    });

    it('lists files again once hand-added ones are recognised on Modrinth', async () => {
        recogniseFiles.mockResolvedValue(1);
        show();
        await waitFor(() => expect(scanProfile).toHaveBeenCalledTimes(2));
    });

    it('shows why a pack could not be saved', async () => {
        exportMrpack.mockImplementation(() => {
            throw new Error('Pick the loader version this profile plays with before exporting mods.');
        });
        show();
        openTab('Export');
        fireEvent.click(screen.getByRole('button', { name: 'Save .mrpack' }));
        expect(await screen.findByText(/Pick the loader version/)).toBeInTheDocument();
    });
});

describe('Import', () => {
    it('previews a pack file and imports the picked items into the current profile', async () => {
        show();
        openTab('Import');
        await chooseFile(document.getElementById('importPack'));

        expect(await screen.findByText('Friends Pack 1.0')).toBeInTheDocument();
        expect(screen.getByText('Minecraft 1.21.1 · Fabric 0.16.5')).toBeInTheDocument();
        expect(screen.getByLabelText('Import into')).toHaveValue('survival');
        fireEvent.click(screen.getByLabelText('Include all configs'));
        fireEvent.click(screen.getByRole('button', { name: 'Import' }));

        expect(
            await screen.findByText(/Imported into Survival. Replaced other versions of Sodium./),
        ).toBeInTheDocument();
        expect(importMrpack).toHaveBeenCalledWith(expect.any(Uint8Array), {
            into: 'survival',
            name: undefined,
            items: ['mods/sodium.jar'],
        });
        expect(onProfilesChange).toHaveBeenCalled();
    });

    it('can import into a new profile instead', async () => {
        importMrpack.mockResolvedValue({
            profile: { id: 'friends', name: 'Friends' },
            loaderNote: '',
            replaced: [],
            needsLoader: false,
        });
        show();
        openTab('Import');
        await chooseFile(document.getElementById('importPack'));
        fireEvent.change(await screen.findByLabelText('Import into'), { target: { value: 'new' } });
        fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Friends' } });
        fireEvent.click(screen.getByRole('button', { name: 'Import' }));

        expect(await screen.findByText(/Created the profile "Friends"/)).toBeInTheDocument();
        expect(importMrpack).toHaveBeenCalledWith(
            expect.any(Uint8Array),
            expect.objectContaining({ into: 'new', name: 'Friends' }),
        );
    });

    it('asks before importing a pack that does not fit the profile', async () => {
        packWarnings.mockReturnValue(['The pack needs Forge, but Survival uses Fabric.']);
        show();
        openTab('Import');
        await chooseFile(document.getElementById('importPack'));
        fireEvent.click(await screen.findByRole('button', { name: 'Import' }));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('The pack needs Forge, but Survival uses Fabric.')).toBeInTheDocument();
        expect(importMrpack).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Import anyway' }));
        await waitFor(() => expect(importMrpack).toHaveBeenCalled());
    });

    it("previews a pack from the player's channel", async () => {
        const published = { id: '2.0.0', url: 'https://x/packs-2.0.0.mrpack', target: 'Fabric 1.21.1' };
        fetchPacks.mockResolvedValue([published]);
        downloadPublishedPack.mockResolvedValue(new Uint8Array([9]));
        show();
        openTab('Import');
        fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));

        expect(await screen.findByText('Friends Pack 1.0')).toBeInTheDocument();
        expect(downloadPublishedPack).toHaveBeenCalledWith(published);
        expect(readPack).toHaveBeenCalledWith(new Uint8Array([9]));
    });

    it('says what is wrong with a file that is not a pack', async () => {
        readPack.mockImplementation(() => {
            throw new Error("This file is not a modpack (it isn't a zip).");
        });
        show();
        openTab('Import');
        await chooseFile(document.getElementById('importPack'));
        expect(await screen.findByText("This file is not a modpack (it isn't a zip).")).toBeInTheDocument();
    });

    it('undoes an earlier import from its backup', async () => {
        listPackBackups.mockReturnValue([{ id: 'b1', createdAt: '2026-10-12T08:00:00Z', pack: 'Friends Pack' }]);
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        show();
        openTab('Import');
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

        expect(await screen.findByText(/back the way it was before importing Friends Pack/)).toBeInTheDocument();
        expect(restorePackBackup).toHaveBeenCalledWith('/game', 'b1');
    });
});

describe('Publish', () => {
    it('points to Settings when no repository is set up', () => {
        bundlesRepo.mockReturnValue('');
        show();
        openTab('Publish');
        expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    });

    it('publishes the picked files as a new pack version', async () => {
        show();
        openTab('Publish');
        expect(await screen.findByDisplayValue('1.0.1')).toBeInTheDocument();
        expect(existingVersions).toHaveBeenCalledWith('Trino11/TMods-bundles', 'packs');
        fireEvent.change(screen.getByLabelText('What changed (optional)'), { target: { value: 'Added Sodium' } });
        fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

        expect(await screen.findByRole('link', { name: 'follow it on GitHub' })).toHaveAttribute(
            'href',
            'https://github.com/Trino11/TMods-bundles/actions',
        );
        expect(exportMrpack).toHaveBeenCalledWith('/game', target, {
            name: 'Survival',
            version: '1.0.1',
            items: [scanned[0], scanned[1], scanned[2]],
        });
        expect(publishPack).toHaveBeenCalledWith({
            repo: 'Trino11/TMods-bundles',
            category: 'packs',
            version: '1.0.1',
            data: new Uint8Array([1, 2]),
            description: '',
            changelog: 'Added Sodium',
        });
    });

    it('publishes a .mrpack file as it is', async () => {
        show();
        openTab('Publish');
        await screen.findByDisplayValue('1.0.1');
        fireEvent.click(screen.getByRole('button', { name: 'A .mrpack file' }));
        await chooseFile(document.getElementById('publishPackFile'));
        expect(
            await screen.findByText(/friends.mrpack: Friends Pack, Minecraft 1.21.1, 2 item\(s\)/),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

        await waitFor(() => expect(publishPack).toHaveBeenCalled());
        expect(publishPack.mock.calls[0][0].data).toEqual(new Uint8Array(new TextEncoder().encode('pack')));
        expect(exportMrpack).not.toHaveBeenCalled();
    });

    it('asks before publishing a large pack', async () => {
        exportMrpack.mockReturnValue({ data: { length: 30 * 1024 * 1024 }, links: 0, copies: 1 });
        jest.spyOn(window, 'confirm').mockReturnValue(false);
        show();
        openTab('Publish');
        await screen.findByDisplayValue('1.0.1');
        fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

        await waitFor(() => expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('30.0 MB')));
        expect(publishPack).not.toHaveBeenCalled();
    });
});
