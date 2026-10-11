import { fireEvent, render, screen } from '@testing-library/react';
import BundlePage from '../pages/bundle/BundlePage';
import categories from '../../categories';
import { fetchVersions } from '../../services/manifest';
import { listBackups, readInstalledVersion, restoreBackup } from '../../services/bundleInstaller';

jest.mock('../../services/manifest', () => ({ fetchVersions: jest.fn() }));
jest.mock('../../services/bundleInstaller', () => ({
    installBundle: jest.fn(),
    readInstalledVersion: jest.fn(),
    listBackups: jest.fn(),
    restoreBackup: jest.fn(),
}));

const mods = categories.find(c => c.id === 'mods');
const backup = { id: 'b1', createdAt: '2026-10-11T10:00:00.000Z', version: '1.0' };

// CRA resets mock implementations before each test, so set them here.
beforeEach(() => {
    fetchVersions.mockReturnValue(new Promise(() => {}));
    readInstalledVersion.mockReturnValue('');
    listBackups.mockReturnValue([]);
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
