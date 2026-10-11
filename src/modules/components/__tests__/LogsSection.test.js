import { fireEvent, render, screen } from '@testing-library/react';
import LogsSection from '../settings/LogsSection';
import { getLogPath, openLogFile, showLogInFolder } from '../../services/logs';

jest.mock('../../services/logs', () => ({
    getLogPath: jest.fn(),
    openLogFile: jest.fn(),
    showLogInFolder: jest.fn(),
}));

beforeEach(() => {
    getLogPath.mockResolvedValue('C:\\Users\\me\\AppData\\Roaming\\tmods-downloader\\logs\\main.log');
    openLogFile.mockResolvedValue();
    showLogInFolder.mockResolvedValue();
});

it('shows where the log file is', async () => {
    render(<LogsSection />);
    expect(
        await screen.findByText('C:\\Users\\me\\AppData\\Roaming\\tmods-downloader\\logs\\main.log'),
    ).toBeInTheDocument();
});

it('opens the log file and its folder', async () => {
    render(<LogsSection />);
    await screen.findByText(/main\.log/);

    fireEvent.click(screen.getByRole('button', { name: 'Open log' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open log folder' }));

    expect(openLogFile).toHaveBeenCalledTimes(1);
    expect(showLogInFolder).toHaveBeenCalledTimes(1);
});

it('shows why the log could not be opened', async () => {
    openLogFile.mockRejectedValue(new Error('There is no log file yet.'));
    render(<LogsSection />);
    await screen.findByText(/main\.log/);

    fireEvent.click(screen.getByRole('button', { name: 'Open log' }));

    expect(await screen.findByText('There is no log file yet.')).toBeInTheDocument();
});
