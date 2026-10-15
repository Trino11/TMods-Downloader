import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BundlePage from '../pages/bundle/BundlePage';
import categories from '../../categories';
import { fetchVersions } from '../../services/manifest';
import { installBundle, listBackups, readInstalledVersion, restoreBackup } from '../../services/bundleInstaller';
import { isPinned, setPinned } from '../../services/pins';
import { safeCheckIntegrity } from '../../services/integrity';

jest.mock('../../services/manifest', () => ({
    ...jest.requireActual('../../services/manifest'),
    fetchVersions: jest.fn(),
}));
jest.mock('../../services/bundleInstaller', () => ({
    installBundle: jest.fn(),
    readInstalledVersion: jest.fn(),
    listBackups: jest.fn(),
    restoreBackup: jest.fn(),
}));

jest.mock('../../services/pins', () => ({ isPinned: jest.fn(), setPinned: jest.fn() }));
jest.mock('../../services/integrity', () => ({ safeCheckIntegrity: jest.fn() }));

const mods = categories.find(c => c.id === 'mods');
const backup = { id: 'b1', createdAt: '2026-10-11T10:00:00.000Z', version: '1.0' };

// CRA resets mock implementations before each test, so set them here.
beforeEach(() => {
    fetchVersions.mockReturnValue(new Promise(() => {}));
    readInstalledVersion.mockReturnValue('');
    listBackups.mockReturnValue([]);
    isPinned.mockReturnValue(false);
    safeCheckIntegrity.mockReturnValue(null);
    window.confirm = jest.fn(() => true);
});

it('lists backups with their installed version', () => {
    listBackups.mockReturnValue([backup]);
    render(<BundlePage category={mods} />);

    expect(screen.getByText('Backups')).toBeInTheDocument();
    expect(screen.getByText('1.0')).toBeInTheDocument();
    expect(screen.getByText(new Date(backup.createdAt).toLocaleString())).toBeInTheDocument();
});

it('restores a backup after confirmation and refreshes the installed version', () => {
    listBackups.mockReturnValue([backup]);
    render(<BundlePage category={mods} gameDir='/games/fabric' />);
    readInstalledVersion.mockReturnValue('1.0');

    fireEvent.click(screen.getByText('Restore'));

    expect(restoreBackup).toHaveBeenCalledWith(mods, 'b1', '/games/fabric');
    expect(listBackups).toHaveBeenCalledWith(mods, '/games/fabric');
    expect(listBackups).toHaveBeenCalledTimes(2);
});

it('does nothing when the restore is cancelled', () => {
    listBackups.mockReturnValue([backup]);
    window.confirm = jest.fn(() => false);
    render(<BundlePage category={mods} />);

    fireEvent.click(screen.getByText('Restore'));

    expect(restoreBackup).not.toHaveBeenCalled();
});

it('asks whether a download replaces what is there, starting on replace', async () => {
    fetchVersions.mockResolvedValue([{ id: '2.0', url: 'https://example.com/mods.zip' }]);
    installBundle.mockResolvedValue();
    render(<BundlePage category={mods} gameDir='/games/fabric' />);

    fireEvent.click(await screen.findByRole('button', { name: /download/i }));
    expect(screen.getByText('This installs into mods/.')).toBeInTheDocument();
    expect(screen.getByLabelText('Replace existing content')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() =>
        expect(installBundle).toHaveBeenCalledWith(mods, expect.objectContaining({ id: '2.0' }), '/games/fabric', {
            replace: true,
        }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /download/i }));
    fireEvent.click(screen.getByLabelText('Replace existing content'));
    expect(screen.getByText(/The new files are added next to what you have/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() =>
        expect(installBundle).toHaveBeenLastCalledWith(mods, expect.anything(), '/games/fabric', { replace: false }),
    );
});

it('installs nothing when the question is cancelled', async () => {
    fetchVersions.mockResolvedValue([{ id: '2.0', url: 'https://example.com/mods.zip' }]);
    render(<BundlePage category={mods} />);

    fireEvent.click(await screen.findByRole('button', { name: /download/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(installBundle).not.toHaveBeenCalled();
});

it('shows an error when the version list cannot be loaded', async () => {
    fetchVersions.mockRejectedValue(new Error('Network Error'));
    render(<BundlePage category={mods} />);

    expect(await screen.findByText('Could not load the list of versions: Network Error')).toBeInTheDocument();
});

it('shows an error when an install fails', async () => {
    fetchVersions.mockResolvedValue([{ id: '2.0', url: 'https://example.com/mods.zip' }]);
    installBundle.mockRejectedValue(new Error('Request failed with status code 404'));
    render(<BundlePage category={mods} gameDir='/games/fabric' />);

    fireEvent.click(await screen.findByRole('button', { name: /download/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(await screen.findByText('Could not install 2.0: Request failed with status code 404')).toBeInTheDocument();
});

it('shows an error when a restore fails', () => {
    listBackups.mockReturnValue([backup]);
    restoreBackup.mockImplementation(() => {
        throw new Error('EBUSY: resource busy');
    });
    render(<BundlePage category={mods} />);

    fireEvent.click(screen.getByText('Restore'));

    expect(screen.getByText('Could not restore the backup: EBUSY: resource busy')).toBeInTheDocument();
});

it("shows a version's changelog as plain text", async () => {
    fetchVersions.mockResolvedValue([
        { id: '1.1', url: 'https://example.com/1.1.zip', changelog: '# Changes\n<img src=x onerror=alert(1)>' },
        { id: '1.0', url: 'https://example.com/1.0.zip' },
    ]);
    render(<BundlePage category={mods} />);

    const buttons = await screen.findAllByRole('button', { name: "What's new" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);

    expect(await screen.findByText("What's new in 1.1")).toBeInTheDocument();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
});

it('keeps the installed version, or lets updates through again', () => {
    readInstalledVersion.mockReturnValue('1.0');
    render(<BundlePage category={mods} gameDir='/games/a' />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep this version' }));
    expect(setPinned).toHaveBeenCalledWith('/games/a', 'mods', true);
    fireEvent.click(screen.getByRole('button', { name: 'Allow updates' }));
    expect(setPinned).toHaveBeenCalledWith('/games/a', 'mods', false);
});

it('has nothing to keep when no version is installed', () => {
    render(<BundlePage category={mods} gameDir='/games/a' />);
    expect(screen.queryByRole('button', { name: 'Keep this version' })).not.toBeInTheDocument();
});

it('marks the installed version as unchanged or modified, and checks again after an install', async () => {
    readInstalledVersion.mockReturnValue('1.0');
    safeCheckIntegrity.mockReturnValue({
        tracked: true,
        modified: true,
        merged: [],
        changed: [],
        added: ['mods/extra.jar'],
        removed: [],
    });
    fetchVersions.mockResolvedValue([
        { id: '2.0', url: 'https://example.com/2.zip' },
        { id: '1.0', url: 'https://example.com/1.zip' },
    ]);
    installBundle.mockResolvedValue();
    render(<BundlePage category={mods} gameDir='/games/fabric' />);

    expect(await screen.findByText('Modified')).toBeInTheDocument();
    expect(screen.getByText('Not the same as the download: 1 file added.')).toBeInTheDocument();
    expect(safeCheckIntegrity).toHaveBeenCalledWith(mods, '/games/fabric', '1.0');

    readInstalledVersion.mockReturnValue('2.0');
    safeCheckIntegrity.mockReturnValue({
        tracked: true,
        modified: false,
        merged: [],
        changed: [],
        added: [],
        removed: [],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(await screen.findByText('Unchanged')).toBeInTheDocument();
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
});

it('says when an install from before records were kept cannot be checked', async () => {
    readInstalledVersion.mockReturnValue('1.0');
    safeCheckIntegrity.mockReturnValue({ tracked: false });
    fetchVersions.mockResolvedValue([{ id: '1.0', url: 'https://example.com/1.zip' }]);
    render(<BundlePage category={mods} />);

    expect(await screen.findByText('Not checked')).toBeInTheDocument();
});
