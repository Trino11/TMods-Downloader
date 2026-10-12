import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import Settings from '../pages/settings/Settings';
import { validateManifestUrl } from '../../services/manifest';
import { addManifest, listManifests } from '../../services/manifests';
import { ensureTModsProfile } from '../../services/profiles';

jest.mock('../../services/manifest', () => ({
    validateManifestUrl: jest.fn(),
    fetchVersions: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../services/bundleInstaller', () => ({
    installBundle: jest.fn(),
    readInstalledVersion: jest.fn(() => ''),
}));
jest.mock('../../services/profiles', () => ({
    ensureTModsProfile: jest.fn(),
    listProfiles: () => [{ id: 'default', name: 'Default', gameVersion: '' }],
    getActiveProfile: () => ({ id: 'default', name: 'Default', gameVersion: '' }),
    profileGameDir: () => '/minecraft',
    setActiveProfile: jest.fn(),
    syncLauncherProfiles: jest.fn(),
}));
jest.mock('../../services/logs', () => ({
    getLogPath: () => Promise.resolve('/logs/main.log'),
    openLogFile: jest.fn(),
    showLogInFolder: jest.fn(),
}));
jest.mock('../enclosing/navbar', () => () => <nav>navbar</nav>);
jest.mock('../pages/modrinth/ModrinthPage', () => () => <div>modrinth</div>);
jest.mock('../pages/home/home', () => () => <div>home</div>);
jest.mock('../../services/fabric', () => ({
    installFabric: jest.fn(),
    latestLoaderVersion: jest.fn(),
    listFabricGameVersions: jest.fn(() => new Promise(() => {})),
}));

beforeEach(() => {
    validateManifestUrl.mockReset();
});

function urlInput() {
    return screen.getByLabelText('Manifest URL');
}

function typeUrl(value) {
    fireEvent.change(urlInput(), { target: { value } });
}

const urls = () => listManifests().map(manifest => manifest.url);

it('makes sure a TMods profile exists when the app starts', () => {
    ensureTModsProfile.mockClear();
    render(<App />);
    expect(ensureTModsProfile).toHaveBeenCalled();
});

describe('first launch', () => {
    it('shows the setup screen when no manifest is saved', () => {
        render(<App />);
        expect(screen.getByRole('heading', { name: 'Welcome to TMods Loader' })).toBeInTheDocument();
        expect(urlInput()).toHaveValue('');
        expect(screen.queryByText('navbar')).not.toBeInTheDocument();
    });

    it('saves a valid URL and opens the app', async () => {
        validateManifestUrl.mockResolvedValue();
        render(<App />);

        typeUrl('  https://example.com/manifest.json  ');
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(await screen.findByText('navbar')).toBeInTheDocument();
        expect(validateManifestUrl).toHaveBeenCalledWith('https://example.com/manifest.json');
        expect(listManifests()).toEqual([
            { id: 'manifest-1', name: 'example.com', url: 'https://example.com/manifest.json' },
        ]);
    });

    it('shows the error and saves nothing when the URL is rejected', async () => {
        validateManifestUrl.mockRejectedValue(
            new Error('The URL loaded, but it is not a TMods manifest (no "versions" field).'),
        );
        render(<App />);

        typeUrl('https://example.com/page.html');
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(await screen.findByText(/not a TMods manifest/)).toBeInTheDocument();
        expect(listManifests()).toEqual([]);
        expect(screen.getByRole('heading', { name: 'Welcome to TMods Loader' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
    });

    it('skips the setup screen once a manifest is saved', () => {
        addManifest({ url: 'https://example.com/manifest.json' });
        render(<App />);
        expect(screen.queryByRole('heading', { name: 'Welcome to TMods Loader' })).not.toBeInTheDocument();
        expect(screen.getByText('navbar')).toBeInTheDocument();
    });

    it('skips the setup screen for a URL saved by an older version', () => {
        localStorage.setItem('tmods.manifestUrl', 'https://example.com/manifest.json');
        render(<App />);
        expect(screen.getByText('navbar')).toBeInTheDocument();
        expect(urls()).toEqual(['https://example.com/manifest.json']);
    });
});

describe('Settings page', () => {
    beforeEach(() => {
        addManifest({ name: 'Old', url: 'https://old.example.com/manifest.json' });
    });

    it('lists the saved manifests', () => {
        render(<Settings />);
        expect(screen.getByText('Old')).toBeInTheDocument();
        expect(screen.getByText('https://old.example.com/manifest.json')).toBeInTheDocument();
        // The last manifest can't be removed.
        expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    });

    it('adds another valid manifest and reports it', async () => {
        validateManifestUrl.mockResolvedValue();
        const onChange = jest.fn();
        render(<Settings onManifestsChange={onChange} />);

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Server' } });
        typeUrl('https://new.example.com/manifest.json');
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(await screen.findByText('Added Server.')).toBeInTheDocument();
        expect(urls()).toEqual(['https://old.example.com/manifest.json', 'https://new.example.com/manifest.json']);
        expect(onChange).toHaveBeenCalled();
        expect(urlInput()).toHaveValue('');
        expect(screen.getAllByRole('button', { name: 'Remove' })[0]).toBeEnabled();
    });

    it('saves nothing when the new URL is rejected', async () => {
        validateManifestUrl.mockRejectedValue(new Error('Could not load the manifest: Network Error'));
        const onChange = jest.fn();
        render(<Settings onManifestsChange={onChange} />);

        typeUrl('https://broken.example.com/manifest.json');
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(await screen.findByText('Could not load the manifest: Network Error')).toBeInTheDocument();
        expect(urls()).toEqual(['https://old.example.com/manifest.json']);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('edits a manifest after checking its new URL', async () => {
        validateManifestUrl.mockResolvedValue();
        render(<Settings />);

        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(screen.getByDisplayValue('https://old.example.com/manifest.json'), {
            target: { value: 'https://moved.example.com/manifest.json' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('Saved Old.')).toBeInTheDocument();
        expect(validateManifestUrl).toHaveBeenCalledWith('https://moved.example.com/manifest.json');
        expect(listManifests()).toEqual([
            { id: 'manifest-1', name: 'Old', url: 'https://moved.example.com/manifest.json' },
        ]);
    });

    it('removes a manifest once there is another one', () => {
        addManifest({ name: 'Second', url: 'https://second.example.com/manifest.json' });
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        render(<Settings />);

        fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

        expect(screen.getByText('Removed Old.')).toBeInTheDocument();
        expect(urls()).toEqual(['https://second.example.com/manifest.json']);
        window.confirm.mockRestore();
    });

    it('disables the form while the URL is being checked', async () => {
        let finish;
        validateManifestUrl.mockReturnValue(
            new Promise(resolve => {
                finish = resolve;
            }),
        );
        render(<Settings />);
        typeUrl('https://new.example.com/manifest.json');
        const add = screen.getByRole('button', { name: 'Add' });

        fireEvent.click(add);

        await waitFor(() => expect(urlInput()).toBeDisabled());
        expect(add).toBeDisabled();

        finish();
        expect(await screen.findByText(/^Added/)).toBeInTheDocument();
        expect(urlInput()).toBeEnabled();
    });
});
