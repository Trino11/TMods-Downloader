import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import Settings from '../pages/settings/Settings';
import { validateManifestUrl } from '../../services/manifest';
import { getManifestUrl, setManifestUrl } from '../../services/settings';

jest.mock('../../services/manifest', () => ({
    validateManifestUrl: jest.fn(),
    fetchVersions: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../services/bundleInstaller', () => ({
    installBundle: jest.fn(),
    readInstalledVersion: jest.fn(() => ''),
}));
jest.mock('../../services/profiles', () => ({
    listProfiles: () => [{ id: 'default', name: 'Default', gameVersion: '' }],
    getActiveProfile: () => ({ id: 'default', name: 'Default', gameVersion: '' }),
    profileGameDir: () => '/minecraft',
    setActiveProfile: jest.fn(),
    syncLauncherProfiles: jest.fn(),
}));
jest.mock('../enclosing/navbar', () => () => <nav>navbar</nav>);
jest.mock('../pages/modrinth/ModrinthPage', () => () => <div>modrinth</div>);

beforeEach(() => {
    validateManifestUrl.mockReset();
});

function urlInput() {
    return screen.getByLabelText('Manifest URL');
}

// user-event 13 bundles its own @testing-library/dom, which isn't wired to React's
// act(), so drive the form with fireEvent instead.
function typeUrl(value) {
    fireEvent.change(urlInput(), { target: { value } });
}

describe('first launch', () => {
    it('shows the setup screen when no manifest URL is saved', () => {
        render(<App />);
        expect(screen.getByRole('heading', { name: 'Welcome to TMods Loader' })).toBeInTheDocument();
        expect(urlInput()).toHaveValue('');
        expect(screen.queryByText('navbar')).not.toBeInTheDocument();
    });

    it('saves a valid URL and opens the app', async () => {
        validateManifestUrl.mockResolvedValue();
        render(<App />);

        typeUrl('  https://example.com/manifest.json  ');
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('navbar')).toBeInTheDocument();
        expect(validateManifestUrl).toHaveBeenCalledWith('https://example.com/manifest.json');
        expect(getManifestUrl()).toBe('https://example.com/manifest.json');
    });

    it('shows the error and saves nothing when the URL is rejected', async () => {
        validateManifestUrl.mockRejectedValue(new Error('The URL loaded, but it is not a TMods manifest (no "versions" field).'));
        render(<App />);

        typeUrl('https://example.com/page.html');
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText(/not a TMods manifest/)).toBeInTheDocument();
        expect(getManifestUrl()).toBe('');
        expect(screen.getByRole('heading', { name: 'Welcome to TMods Loader' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('skips the setup screen once a URL is saved', () => {
        setManifestUrl('https://example.com/manifest.json');
        render(<App />);
        expect(screen.queryByRole('heading', { name: 'Welcome to TMods Loader' })).not.toBeInTheDocument();
        expect(screen.getByText('navbar')).toBeInTheDocument();
    });
});

describe('Settings page', () => {
    beforeEach(() => {
        setManifestUrl('https://old.example.com/manifest.json');
    });

    it('shows the saved URL', () => {
        render(<Settings />);
        expect(urlInput()).toHaveValue('https://old.example.com/manifest.json');
    });

    it('saves a new valid URL and reports it', async () => {
        validateManifestUrl.mockResolvedValue();
        const onChange = jest.fn();
        render(<Settings onManifestUrlChange={onChange} />);

        typeUrl('https://new.example.com/manifest.json');
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('Saved.')).toBeInTheDocument();
        expect(getManifestUrl()).toBe('https://new.example.com/manifest.json');
        expect(onChange).toHaveBeenCalledWith('https://new.example.com/manifest.json');
    });

    it('keeps the old URL when the new one is rejected', async () => {
        validateManifestUrl.mockRejectedValue(new Error('Could not load the manifest: Network Error'));
        const onChange = jest.fn();
        render(<Settings onManifestUrlChange={onChange} />);

        typeUrl('https://broken.example.com/manifest.json');
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('Could not load the manifest: Network Error')).toBeInTheDocument();
        expect(getManifestUrl()).toBe('https://old.example.com/manifest.json');
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
    });

    it('disables the form while the URL is being checked', async () => {
        let finish;
        validateManifestUrl.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        render(<Settings />);

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => expect(urlInput()).toBeDisabled());
        expect(screen.getByRole('button')).toBeDisabled();

        finish();
        expect(await screen.findByText('Saved.')).toBeInTheDocument();
        expect(urlInput()).toBeEnabled();
    });
});
