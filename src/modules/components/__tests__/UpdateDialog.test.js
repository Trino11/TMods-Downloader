import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UpdateDialog from '../utils/UpdateDialog';
import { installUpdate, onUpdateReady, readyUpdate } from '../../services/appUpdates';
import { setLanguage } from '../../i18n';

jest.mock('../../services/appUpdates', () => ({
    readyUpdate: jest.fn(),
    onUpdateReady: jest.fn(),
    installUpdate: jest.fn(),
    releaseUrl: version => `https://github.com/Trino11/TMods-Downloader/releases/tag/v${version}`,
}));

let announce;
const stopListening = jest.fn();

beforeEach(() => {
    readyUpdate.mockResolvedValue(null);
    installUpdate.mockResolvedValue(true);
    onUpdateReady.mockImplementation(listener => {
        announce = listener;
        return stopListening;
    });
});

it('stays hidden while no update is ready', async () => {
    render(<UpdateDialog />);
    await waitFor(() => expect(readyUpdate).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('pops up when an update finishes downloading and restarts to install it', async () => {
    render(<UpdateDialog />);
    act(() => announce({ version: '0.4.2' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('TMods Downloader 0.4.2 has been downloaded');
    expect(screen.getByRole('link', { name: "See what's new" })).toHaveAttribute(
        'href',
        'https://github.com/Trino11/TMods-Downloader/releases/tag/v0.4.2',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }));
    expect(installUpdate).toHaveBeenCalled();
});

it('shows an update that was ready before the page loaded', async () => {
    readyUpdate.mockResolvedValue({ version: '0.4.2' });
    render(<UpdateDialog />);
    expect(await screen.findByRole('dialog')).toHaveTextContent('0.4.2');
});

it('hides on "Later" until a newer version is ready', async () => {
    render(<UpdateDialog />);
    act(() => announce({ version: '0.4.2' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(installUpdate).not.toHaveBeenCalled();

    act(() => announce({ version: '0.4.2' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => announce({ version: '0.4.3' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('0.4.3');
});

it('speaks Spanish', async () => {
    setLanguage('es');
    render(<UpdateDialog />);
    act(() => announce({ version: '0.4.2' }));
    expect(await screen.findByRole('button', { name: 'Reiniciar ahora' })).toBeInTheDocument();
    setLanguage('');
});
