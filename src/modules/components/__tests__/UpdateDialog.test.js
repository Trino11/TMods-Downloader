import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UpdateDialog from '../utils/UpdateDialog';
import { availableUpdate, installUpdateNow, installUpdateOnQuit, onUpdateAvailable } from '../../services/appUpdates';
import { setLanguage } from '../../i18n';

jest.mock('../../services/appUpdates', () => ({
    availableUpdate: jest.fn(),
    onUpdateAvailable: jest.fn(),
    installUpdateNow: jest.fn(),
    installUpdateOnQuit: jest.fn(),
    releaseUrl: version => `https://github.com/Trino11/TMods-Downloader/releases/tag/v${version}`,
}));

let announce;
const stopListening = jest.fn();

beforeEach(() => {
    availableUpdate.mockResolvedValue(null);
    installUpdateNow.mockReturnValue(new Promise(() => {}));
    installUpdateOnQuit.mockResolvedValue(true);
    onUpdateAvailable.mockImplementation(listener => {
        announce = listener;
        return stopListening;
    });
});

it('stays hidden while there is no new version', async () => {
    render(<UpdateDialog />);
    await waitFor(() => expect(availableUpdate).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('asks about the version found when the app opened', async () => {
    availableUpdate.mockResolvedValue({ version: '0.4.2' });
    render(<UpdateDialog />);

    expect(await screen.findByRole('dialog')).toHaveTextContent('TMods Downloader 0.4.2 is out');
    expect(screen.getByRole('link', { name: "See what's new" })).toHaveAttribute(
        'href',
        'https://github.com/Trino11/TMods-Downloader/releases/tag/v0.4.2',
    );
});

it('installs now, showing the download until the app restarts', async () => {
    render(<UpdateDialog />);
    act(() => announce({ version: '0.4.2' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Install now' }));

    expect(installUpdateNow).toHaveBeenCalled();
    expect(await screen.findByText(/Downloading the update/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
});

it('says so when installing now fails', async () => {
    installUpdateNow.mockRejectedValue(new Error('offline'));
    render(<UpdateDialog />);
    act(() => announce({ version: '0.4.2' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Install now' }));

    expect(await screen.findByText('Could not install the update: offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install now' })).toBeEnabled();
});

it('installs on quit and closes', async () => {
    render(<UpdateDialog />);
    act(() => announce({ version: '0.4.2' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Install on quit' }));

    expect(installUpdateOnQuit).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('dismisses without installing anything', async () => {
    render(<UpdateDialog />);
    act(() => announce({ version: '0.4.2' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(installUpdateNow).not.toHaveBeenCalled();
    expect(installUpdateOnQuit).not.toHaveBeenCalled();
});

it('speaks Spanish', async () => {
    setLanguage('es');
    render(<UpdateDialog />);
    act(() => announce({ version: '0.4.2' }));
    expect(await screen.findByRole('button', { name: 'Instalar al cerrar' })).toBeInTheDocument();
    setLanguage('');
});
