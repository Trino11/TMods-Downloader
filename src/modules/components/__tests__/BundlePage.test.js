import { fireEvent, render, screen } from '@testing-library/react';
import BundlePage from '../pages/bundle/BundlePage';
import categories from '../../categories';
import { fetchVersions } from '../../services/manifest';
import { installBundle, listBackups, readInstalledVersion, restoreBackup } from '../../services/bundleInstaller';
import { isPinned, setPinned } from '../../services/pins';

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

const mods = categories.find(c => c.id === 'mods');
const backup = { id: 'b1', createdAt: '2026-10-11T10:00:00.000Z', version: '1.0' };

// CRA resets mock implementations before each test, so set them here.
beforeEach(() => {
    fetchVersions.mockReturnValue(new Promise(() => {}));
    readInstalledVersion.mockReturnValue('');
    listBackups.mockReturnValue([]);
    isPinned.mockReturnValue(false);
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

it('has no backups section for categories that are never backed up', () => {
    render(<BundlePage category={categories.find(c => c.id === 'shaderpacks')} />);

    expect(screen.queryByText('Backups')).not.toBeInTheDocument();
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
